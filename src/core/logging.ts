import { getKVStore } from "./kv-store";
import { McpToolError } from "./errors";
import type { ToolResult } from "./types";

export interface ToolLog {
  tool: string;
  durationMs: number;
  status: "success" | "error";
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  timestamp: string;
  tokenId?: string;
}

// In-memory ring buffer for recent logs (survives across requests in same serverless instance)
const LOG_BUFFER_SIZE = 100;
const recentLogs: ToolLog[] = [];

export function logToolCall(log: ToolLog) {
  recentLogs.push(log);
  if (recentLogs.length > LOG_BUFFER_SIZE) {
    recentLogs.shift();
  }

  const emoji = log.status === "success" ? "✓" : "✗";
  const errorSuffix = log.error
    ? ` — ${log.errorCode ? `[${log.errorCode}] ` : ""}${log.error}`
    : "";
  console.log(`[MyMCP] ${emoji} ${log.tool} (${log.durationMs}ms)${errorSuffix}`);

  // Write to durable KV store if enabled (fire-and-forget)
  if (process.env.MYMCP_DURABLE_LOGS === "true") {
    const kv = getKVStore();
    const key = `log:${Date.now()}:${log.tool}`;
    kv.set(key, JSON.stringify(log)).catch((err: Error) =>
      console.error("[MyMCP] Durable log write failed:", err.message)
    );
  }

  // Fire error webhook if configured
  if (log.status === "error") {
    const webhookUrl = process.env.MYMCP_ERROR_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `[MyMCP] Tool error: ${log.tool} — ${log.error} (${log.durationMs}ms)`,
          tool: log.tool,
          error: log.error,
          errorCode: log.errorCode,
          retryable: log.retryable,
          durationMs: log.durationMs,
          timestamp: log.timestamp,
        }),
      }).catch(() => {
        /* best effort — don't crash on webhook failure */
      });
    }
  }
}

/** Aggregate stats from recent logs */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil(sortedValues.length * p) - 1;
  return sortedValues[Math.max(0, Math.min(idx, sortedValues.length - 1))];
}

export function getToolStats(): {
  totalCalls: number;
  errorCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
  byTool: Record<
    string,
    { calls: number; errors: number; avgMs: number; p95Ms: number; errorRate: number }
  >;
  byToken: Record<string, { calls: number; errors: number }>;
} {
  const byTool: Record<string, { calls: number; errors: number; durations: number[] }> = {};
  const byToken: Record<string, { calls: number; errors: number }> = {};
  const allDurations: number[] = [];

  for (const log of recentLogs) {
    if (!byTool[log.tool]) {
      byTool[log.tool] = { calls: 0, errors: 0, durations: [] };
    }
    byTool[log.tool].calls++;
    byTool[log.tool].durations.push(log.durationMs);
    allDurations.push(log.durationMs);
    if (log.status === "error") byTool[log.tool].errors++;

    if (log.tokenId) {
      if (!byToken[log.tokenId]) {
        byToken[log.tokenId] = { calls: 0, errors: 0 };
      }
      byToken[log.tokenId].calls++;
      if (log.status === "error") byToken[log.tokenId].errors++;
    }
  }

  const totalCalls = recentLogs.length;
  const errorCount = recentLogs.filter((l) => l.status === "error").length;
  const totalMs = recentLogs.reduce((sum, l) => sum + l.durationMs, 0);
  const sortedAll = [...allDurations].sort((a, b) => a - b);

  return {
    totalCalls,
    errorCount,
    avgDurationMs: totalCalls > 0 ? Math.round(totalMs / totalCalls) : 0,
    p95DurationMs: percentile(sortedAll, 0.95),
    byTool: Object.fromEntries(
      Object.entries(byTool).map(([tool, s]) => {
        const sorted = [...s.durations].sort((a, b) => a - b);
        const sum = s.durations.reduce((a, b) => a + b, 0);
        return [
          tool,
          {
            calls: s.calls,
            errors: s.errors,
            avgMs: Math.round(sum / s.calls),
            p95Ms: percentile(sorted, 0.95),
            errorRate: s.calls > 0 ? s.errors / s.calls : 0,
          },
        ];
      })
    ),
    byToken,
  };
}

export function getRecentLogs(count?: number): ToolLog[] {
  const n = Math.min(count || 20, LOG_BUFFER_SIZE);
  return recentLogs.slice(-n);
}

export async function getDurableLogs(
  count?: number,
  filter?: "all" | "errors" | "success"
): Promise<ToolLog[]> {
  const kv = getKVStore();
  const keys = await kv.list("log:");
  // Keys are `log:<timestamp>:<tool>` — sort descending by timestamp
  keys.sort((a, b) => {
    const tsA = parseInt(a.split(":")[1] ?? "0", 10);
    const tsB = parseInt(b.split(":")[1] ?? "0", 10);
    return tsB - tsA;
  });

  const limit = Math.min(count || 20, 500);
  const results: ToolLog[] = [];

  for (const key of keys) {
    if (results.length >= limit) break;
    const raw = await kv.get(key);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw) as ToolLog;
      if (filter === "errors" && entry.status !== "error") continue;
      if (filter === "success" && entry.status !== "success") continue;
      results.push(entry);
    } catch {
      // skip malformed entries
    }
  }

  return results;
}

export function withLogging<TParams>(
  toolName: string,
  handler: (params: TParams) => Promise<ToolResult>,
  callerTokenId?: string | null
): (params: TParams) => Promise<ToolResult> {
  return async (params: TParams) => {
    const start = Date.now();
    try {
      const result = await handler(params);
      logToolCall({
        tool: toolName,
        durationMs: Date.now() - start,
        status: "success",
        timestamp: new Date().toISOString(),
        ...(callerTokenId ? { tokenId: callerTokenId } : {}),
      });
      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      const timestamp = new Date().toISOString();

      if (error instanceof McpToolError) {
        logToolCall({
          tool: toolName,
          durationMs,
          status: "error",
          error: error.message,
          errorCode: error.code,
          retryable: error.retryable,
          timestamp,
          ...(callerTokenId ? { tokenId: callerTokenId } : {}),
        });
        return {
          content: [{ type: "text", text: error.userMessage }],
          isError: true,
          errorCode: error.code,
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      logToolCall({
        tool: toolName,
        durationMs,
        status: "error",
        error: message,
        timestamp,
        ...(callerTokenId ? { tokenId: callerTokenId } : {}),
      });
      throw error;
    }
  };
}

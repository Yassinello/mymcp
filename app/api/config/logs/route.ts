import { NextResponse } from "next/server";
import { getRecentLogs, getDurableLogs } from "@/core/logging";
import { getLogStore } from "@/core/log-store";
import { getTenantId, TenantError } from "@/core/tenant";
import { withAdminAuth } from "@/core/with-admin-auth";
import { getLogger } from "@/core/logging";
import type { PipelineContext } from "@/core/pipeline";

const logsRouteLog = getLogger("API:config/logs");

/**
 * GET /api/config/logs?count=100&filter=all|errors|success
 *
 * Returns recent tool logs. When `MYMCP_DURABLE_LOGS=true` the payload
 * is sourced from the pluggable LogStore (O1) — Upstash list in prod,
 * filesystem JSONL in dev, in-memory fallback on Vercel without
 * Upstash. Otherwise falls back to the in-process ring buffer.
 *
 * **Phase 42 (TEN-02) — tenant-scoped durable logs:**
 * `getLogStore()` now returns a per-tenant instance; Upstash reads
 * land on `tenant:<id>:mymcp:logs`. The pre-v0.11 application-code
 * tokenId filter in the durable branch is REMOVED — namespace
 * isolation handles it at the storage layer.
 *
 * **Carry-over:** the in-memory ring buffer branch (logging.ts
 * `recentLogs`) is NOT yet per-tenant (short-lived; survives within
 * a single warm lambda only). The tokenId application-code filter is
 * retained in that branch until logging.ts is refactored. Tracked in
 * Phase 42 FOLLOW-UP.
 *
 * TECH-07: unified with mcp-logs tool — both now call the same
 * `getDurableLogs()` helper which reads from `getLogStore().recent()`
 * and handles the meta → ToolLog unwrap + filtering.
 *
 * Admin-auth-gated.
 */
async function getHandler(ctx: PipelineContext) {
  const request = ctx.request;

  // Validate the x-mymcp-tenant header (400 on malformed). Value is
  // used for the in-memory ring buffer fallback filter; the durable
  // branch relies on namespace isolation via getLogStore() → per-tenant.
  let tenantId: string | null = null;
  try {
    tenantId = getTenantId(request);
  } catch (err) {
    if (err instanceof TenantError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
  }

  const url = new URL(request.url);
  const count = parseInt(url.searchParams.get("count") || "100", 10);
  const n = Number.isFinite(count) ? count : 100;
  const filter = (url.searchParams.get("filter") as "all" | "errors" | "success") || "all";

  if (process.env.MYMCP_DURABLE_LOGS === "true") {
    try {
      const store = getLogStore();
      // Phase 42 / TEN-02: getDurableLogs() reads via getLogStore().recent(),
      // which is now tenant-scoped. No application-code tokenId filter.
      const logs = await getDurableLogs(n, filter);
      return NextResponse.json({ ok: true, logs, source: store.kind });
    } catch (err) {
      // Fall through to the in-memory ring buffer so the dashboard
      // never loses visibility if the store is momentarily unhealthy.
      logsRouteLog.error("log store read failed, falling back to memory", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // NOTE: in-process ring buffer (getRecentLogs) is not yet per-tenant —
  // see Phase 42 FOLLOW-UP. Retain the application-code tokenId filter
  // in this branch until the ring buffer is refactored.
  let logs = getRecentLogs(n);
  if (filter === "errors") {
    logs = logs.filter((l) => l.status === "error");
  } else if (filter === "success") {
    logs = logs.filter((l) => l.status === "success");
  }
  if (tenantId) {
    logs = logs.filter((l) => l.tokenId === tenantId);
  }
  return NextResponse.json({ ok: true, logs, source: "memory" });
}

export const GET = withAdminAuth(getHandler);

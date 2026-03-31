export interface ToolLog {
  tool: string;
  durationMs: number;
  status: "success" | "error";
  error?: string;
  timestamp: string;
}

export function logToolCall(log: ToolLog) {
  const emoji = log.status === "success" ? "✓" : "✗";
  const errorSuffix = log.error ? ` — ${log.error}` : "";
  console.log(
    `[YassMCP] ${emoji} ${log.tool} (${log.durationMs}ms)${errorSuffix}`
  );
}

export function withLogging<TParams, TResult>(
  toolName: string,
  handler: (params: TParams) => Promise<TResult>
): (params: TParams) => Promise<TResult> {
  return async (params: TParams) => {
    const start = Date.now();
    try {
      const result = await handler(params);
      logToolCall({
        tool: toolName,
        durationMs: Date.now() - start,
        status: "success",
        timestamp: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      logToolCall({
        tool: toolName,
        durationMs: Date.now() - start,
        status: "error",
        error: message,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  };
}

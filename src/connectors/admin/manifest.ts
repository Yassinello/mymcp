import { defineTool, type ConnectorManifest } from "@/core/types";
import { mcpLogsSchema, handleMcpLogs } from "./tools/mcp-logs";
import { cacheEvictSchema, handleCacheEvict } from "./tools/cache-evict";

export const adminConnector: ConnectorManifest = {
  id: "admin",
  label: "Admin & Observability",
  core: true,
  description: "Tool call logs, cache management, diagnostics",
  requiredEnvVars: [], // Always active — no credentials needed
  tools: [
    // PILOT: defineTool() migration (v0.5 phase 12, T1).
    // The generic parameter is inferred from `schema` so `args` is fully
    // typed — no `params as { ... }` cast needed. Handler receives the
    // narrow type, not `Record<string, unknown>`.
    defineTool({
      name: "mcp_logs",
      description:
        "View recent MCP tool call logs. Shows tool name, duration, status, and errors. Useful for debugging failed calls. Logs are in-memory and ephemeral (reset on cold start).",
      schema: mcpLogsSchema,
      handler: async (args) => handleMcpLogs(args),
      destructive: false,
    }),
    defineTool({
      name: "mcp_cache_evict",
      description:
        "Clear server-side caches. Scope: registry (connector resolution cache), kv (KV store read cache), logs (in-memory log buffer), or all. Useful after manual env changes or to free memory.",
      schema: cacheEvictSchema,
      handler: async (args) => handleCacheEvict(args),
      destructive: true,
    }),
  ],
};

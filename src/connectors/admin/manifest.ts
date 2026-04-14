import { defineTool, type ConnectorManifest } from "@/core/types";
import { mcpLogsSchema, handleMcpLogs } from "./tools/mcp-logs";

export const adminConnector: ConnectorManifest = {
  id: "admin",
  label: "Admin & Observability",
  core: true,
  description: "Tool call logs, diagnostics",
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
  ],
};

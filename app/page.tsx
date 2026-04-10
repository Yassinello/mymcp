import { resolveRegistry } from "@/core/registry";
import { getInstanceConfig } from "@/core/config";
import { getRecentLogs } from "@/core/logging";
import { AppShell } from "./sidebar";
import { ConfigBlock } from "./config-block";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const registry = resolveRegistry();
  const config = getInstanceConfig();
  const logs = getRecentLogs(10);

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  const enabledPacks = registry.filter((p) => p.enabled);
  const totalTools = enabledPacks.reduce((sum, p) => sum + p.manifest.tools.length, 0);

  return (
    <AppShell title="Dashboard" subtitle="Overview of your personal MCP server.">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="border border-border rounded-lg p-5">
          <p className="text-2xl font-bold font-mono text-accent">{totalTools}</p>
          <p className="text-xs text-text-muted uppercase tracking-wide mt-1">Active Tools</p>
        </div>
        <div className="border border-border rounded-lg p-5">
          <p className="text-2xl font-bold font-mono text-green">{enabledPacks.length}</p>
          <p className="text-xs text-text-muted uppercase tracking-wide mt-1">Active Packs</p>
        </div>
        <div className="border border-border rounded-lg p-5">
          <p className="text-2xl font-bold font-mono text-text-dim">
            {registry.length - enabledPacks.length}
          </p>
          <p className="text-xs text-text-muted uppercase tracking-wide mt-1">Inactive</p>
        </div>
      </div>

      {/* Pack cards — Cadens style */}
      <section className="mb-10">
        <h2 className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] mb-3">
          Tool Packs
        </h2>
        <div className="border border-border rounded-lg divide-y divide-border">
          {registry.map((pack) => (
            <div
              key={pack.manifest.id}
              className="flex items-center gap-4 px-5 py-4 hover:bg-bg-muted transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-bg-muted border border-border-light flex items-center justify-center text-text-muted text-sm font-semibold">
                {pack.manifest.label.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{pack.manifest.label}</span>
                  {pack.enabled ? (
                    <span className="text-[11px] font-medium text-green bg-green-bg px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-text-muted bg-bg-muted px-2 py-0.5 rounded-full">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-dim mt-0.5 truncate">
                  {pack.enabled
                    ? pack.manifest.description
                    : `${pack.manifest.description} — ${pack.reason}`}
                </p>
              </div>
              <span className="text-sm text-text-muted whitespace-nowrap">
                {pack.manifest.tools.length} tools
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Connection configs */}
      <section className="mb-10">
        <h2 className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] mb-3">
          Connect
        </h2>
        <div className="space-y-3">
          <ConfigBlock
            title="Claude Desktop"
            subtitle="claude_desktop_config.json"
            config={JSON.stringify(
              {
                mcpServers: {
                  mymcp: {
                    url: `${baseUrl}/api/mcp`,
                    headers: { Authorization: "Bearer <MCP_AUTH_TOKEN>" },
                  },
                },
              },
              null,
              2
            )}
          />
          <ConfigBlock
            title="Claude Code"
            subtitle="~/.claude/settings.json"
            config={JSON.stringify(
              {
                mcpServers: {
                  mymcp: {
                    type: "http",
                    url: `${baseUrl}/api/mcp`,
                    headers: { Authorization: "Bearer <MCP_AUTH_TOKEN>" },
                  },
                },
              },
              null,
              2
            )}
          />
        </div>
      </section>

      {/* Recent logs */}
      {logs.length > 0 && (
        <section>
          <h2 className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] mb-3">
            Recent Logs <span className="font-normal normal-case text-text-muted">(ephemeral)</span>
          </h2>
          <div className="border border-border rounded-lg divide-y divide-border">
            {logs.map((log, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${log.status === "success" ? "bg-green" : "bg-red"}`}
                />
                <span className="font-mono text-xs w-36 truncate">{log.tool}</span>
                <span className="text-text-muted flex-1 truncate">
                  {log.status === "success" ? "OK" : log.error}
                </span>
                <span className="font-mono text-xs text-text-muted">{log.durationMs}ms</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

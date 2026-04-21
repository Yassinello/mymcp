import { resolveRegistry } from "@/core/registry";
import { getInstanceConfigAsync } from "@/core/config";
import { getRecentLogs } from "@/core/logging";
import { VERSION } from "@/core/version";
import { withAdminAuth } from "@/core/with-admin-auth";
import { getRehydrateCount } from "@/core/first-run";
import { getKVLatencySamples } from "@/core/kv-store";
import { getEnvPresence } from "@/core/env-safety";

/**
 * Private admin status endpoint — requires ADMIN_AUTH_TOKEN.
 * Returns detailed pack diagnostics, tool counts, config, and recent logs.
 * Runs diagnose() on enabled packs to verify credentials actually work.
 */
async function getHandler() {
  const registry = resolveRegistry();
  const config = await getInstanceConfigAsync();
  const logs = getRecentLogs();

  // Run diagnose() on enabled packs that have it
  const packs = await Promise.all(
    registry.map(async (p) => {
      let diagnosis: { ok: boolean; message: string } | undefined;
      if (p.enabled && p.manifest.diagnose) {
        try {
          diagnosis = await p.manifest.diagnose();
        } catch {
          diagnosis = { ok: false, message: "Diagnose check failed" };
        }
      }

      return {
        id: p.manifest.id,
        label: p.manifest.label,
        description: p.manifest.description,
        enabled: p.enabled,
        reason: p.reason,
        toolCount: p.manifest.tools.length,
        diagnosis,
        tools: p.manifest.tools.map((t) => ({
          name: t.name,
          description: t.description,
        })),
      };
    })
  );

  const totalTools = registry
    .filter((p) => p.enabled)
    .reduce((sum, p) => sum + p.manifest.tools.length, 0);

  // OBS-02: cold-start-diagnostic payload. `rehydrateCount` is KV-backed
  // with a 24h sliding window, so an operator can tell at a glance
  // whether this lambda has been churning (cold-start loop) or stable
  // (single rehydrate on the warm-up request). `kvLatencySamples` is the
  // in-process ring buffer populated by pingKV and future per-op hooks.
  // `envPresent` returns only booleans — `getEnvPresence` scrubs values.
  const rehydrateCount = await getRehydrateCount();

  return Response.json({
    version: VERSION,
    packs,
    totalTools,
    config: {
      timezone: config.timezone,
      locale: config.locale,
      displayName: config.displayName,
    },
    recentLogs: logs.slice(0, 20).map((l) => ({
      tool: l.tool,
      status: l.status,
      durationMs: l.durationMs,
      timestamp: l.timestamp,
      error: l.error,
    })),
    firstRun: {
      rehydrateCount,
      kvLatencySamples: getKVLatencySamples(),
      envPresent: getEnvPresence(),
    },
    _ephemeral: "Logs are in-memory and reset on cold start.",
  });
}

export const GET = withAdminAuth(getHandler);

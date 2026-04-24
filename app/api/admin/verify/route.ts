import { resolveRegistryAsync } from "@/core/registry";
import { withAdminAuth } from "@/core/with-admin-auth";
import { getLogger } from "@/core/logging";

const logger = getLogger("diagnose");

/**
 * Run diagnose() on all enabled packs and return results.
 * Used by the setup page for live credential verification.
 */
async function getHandler() {
  // PERF-01: lazy resolve. Handler is already async.
  const registry = await resolveRegistryAsync();

  const results = await Promise.all(
    registry.map(async (p) => {
      let diagnosis: { ok: boolean; message: string } | null = null;

      if (p.enabled && p.manifest.diagnose) {
        try {
          diagnosis = await p.manifest.diagnose();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Check failed";
          logger.warn("diagnose threw", { connector: p.manifest.id, error: message });
          diagnosis = { ok: false, message };
        }
      }

      return {
        id: p.manifest.id,
        label: p.manifest.label,
        enabled: p.enabled,
        reason: p.reason,
        diagnosis,
      };
    })
  );

  return Response.json({ packs: results });
}

export const GET = withAdminAuth(getHandler);

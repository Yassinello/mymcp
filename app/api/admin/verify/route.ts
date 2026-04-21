import { resolveRegistry } from "@/core/registry";
import { withAdminAuth } from "@/core/with-admin-auth";

/**
 * Run diagnose() on all enabled packs and return results.
 * Used by the setup page for live credential verification.
 */
async function getHandler() {
  const registry = resolveRegistry();

  const results = await Promise.all(
    registry.map(async (p) => {
      let diagnosis: { ok: boolean; message: string } | null = null;

      if (p.enabled && p.manifest.diagnose) {
        try {
          diagnosis = await p.manifest.diagnose();
        } catch (err) {
          diagnosis = {
            ok: false,
            message: err instanceof Error ? err.message : "Check failed",
          };
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

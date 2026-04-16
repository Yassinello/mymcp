import { checkAdminAuth } from "@/core/auth";
import { getKVStore } from "@/core/kv-store";

/**
 * GET /api/admin/health-history — admin-gated.
 *
 * Returns health-check sample history from dedicated KV keys.
 * Each sample is written by the deep health check (`GET /api/health?deep=1`)
 * at `health:sample:<timestamp>`.
 *
 * MEDIUM-2: Reads directly from KV with prefix scan instead of loading
 * all LogStore entries and filtering. Much more efficient.
 *
 * Query params:
 * - `days` — retention window (default: MYMCP_HEALTH_SAMPLE_RETENTION_DAYS or 7)
 */
export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const defaultDays = parseInt(process.env.MYMCP_HEALTH_SAMPLE_RETENTION_DAYS || "7", 10);
  const days = Math.max(
    1,
    Math.min(parseInt(url.searchParams.get("days") || String(defaultDays), 10) || defaultDays, 90)
  );
  const cutoff = Date.now() - days * 86_400_000;

  const kv = getKVStore();
  const keys = await kv.list("health:sample:");

  // Batch-read values in parallel (groups of 10)
  const BATCH_SIZE = 10;
  interface HealthSample {
    ts: number;
    overall: string;
    connectors: Record<string, { ok: boolean; latencyMs: number }>;
  }
  const samples: HealthSample[] = [];

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const values = await Promise.all(batch.map((k) => kv.get(k)));
    for (const raw of values) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as HealthSample;
        if (parsed.ts >= cutoff) {
          samples.push(parsed);
        }
      } catch {
        // skip malformed entries
      }
    }
  }

  // Sort chronologically (oldest first)
  samples.sort((a, b) => a.ts - b.ts);

  // Clean up old samples beyond retention (fire-and-forget)
  const staleKeys = keys.filter((k) => {
    const ts = parseInt(k.replace("health:sample:", ""), 10);
    return Number.isFinite(ts) && ts < cutoff;
  });
  if (staleKeys.length > 0) {
    Promise.all(staleKeys.map((k) => kv.delete(k))).catch(() => {});
  }

  return Response.json(samples);
}

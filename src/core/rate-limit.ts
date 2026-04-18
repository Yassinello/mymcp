import { createHash } from "node:crypto";
import { getKVStore, kvScanAll } from "./kv-store";
import { getCurrentTenantId } from "./request-context";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix ms
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/**
 * Sliding-window (fixed per-minute bucket) rate limiter.
 *
 * KV key: `ratelimit:{scope}:{identifierHash}:{minuteBucket}`
 * Default limit controlled by MYMCP_RATE_LIMIT_RPM env var (default 60).
 * KV failures are treated as allow (fail open).
 *
 * **Atomic path (v0.6):** when the KV implementation provides `incr`
 * (UpstashKV and MemoryKV for tests), we pipeline INCR + EXPIRE in a
 * single round-trip. This eliminates the classic get-then-set race
 * where two concurrent callers each read `count=N` and both write
 * `N+1`. The bucket TTL auto-expires stale keys, so no sweep is needed
 * on the incr path.
 *
 * **Legacy path:** the old get-then-set branch is kept only for stores
 * that don't implement `incr` (none in production). It's racy but
 * bounded, and runs a best-effort sweep of stale buckets.
 */
export async function checkRateLimit(
  identifier: string,
  options: { scope?: string; limit?: number } = {}
): Promise<RateLimitResult> {
  const scope = options.scope || "mcp";
  const defaultLimit = Math.max(1, parseInt(process.env.MYMCP_RATE_LIMIT_RPM ?? "60", 10) || 60);
  const limit = options.limit ?? defaultLimit;
  const now = Date.now();
  const windowMs = 60_000;
  const minuteBucket = Math.floor(now / windowMs);
  const resetAt = (minuteBucket + 1) * windowMs;
  const idHash = hashToken(identifier);
  const tenantId = getCurrentTenantId() ?? "global";
  const key = `ratelimit:${tenantId}:${scope}:${idHash}:${minuteBucket}`;

  const kv = getKVStore();

  try {
    // Atomic path — preferred whenever incr is implemented. TTL is set
    // to 2× the window so the bucket always outlives its own relevance
    // even under clock skew, without accumulating forever.
    if (typeof kv.incr === "function") {
      const count = await kv.incr(key, { ttlSeconds: Math.ceil((windowMs / 1000) * 2) });
      // v0.6 MED-1: FilesystemKV.incr does not honor TTL (dev-only path),
      // so stale buckets accumulate in `data/kv.json` forever without a
      // sweep. Upstash handles eviction natively via EXPIRE. We only
      // trigger the sweep on `count === 1` (fresh bucket boundary) to
      // avoid doing it on every request.
      if (kv.kind === "filesystem" && count === 1) {
        void sweepOldBuckets(scope, idHash, minuteBucket, tenantId);
      }
      if (count > limit) {
        return { allowed: false, remaining: 0, resetAt };
      }
      return { allowed: true, remaining: Math.max(0, limit - count), resetAt };
    }

    // Legacy fallback (stores without incr). Racy but bounded.
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;

    if (count >= limit) {
      return { allowed: false, remaining: 0, resetAt };
    }

    await kv.set(key, String(count + 1));

    if (count === 0) {
      void sweepOldBuckets(scope, idHash, minuteBucket, tenantId);
    }

    return { allowed: true, remaining: limit - count - 1, resetAt };
  } catch (err) {
    // Fail open: KV errors must not block legitimate requests
    console.warn(
      "[Kebab MCP] Rate limit KV error (failing open):",
      err instanceof Error ? err.message : String(err)
    );
    return { allowed: true, remaining: -1, resetAt };
  }
}

/**
 * Best-effort bucket cleanup. Lists keys under the scope+id prefix and
 * deletes anything older than the current minute. Failures are swallowed.
 */
async function sweepOldBuckets(
  scope: string,
  idHash: string,
  currentBucket: number,
  tenantId: string = "global"
): Promise<void> {
  try {
    const kv = getKVStore();
    const prefix = `ratelimit:${tenantId}:${scope}:${idHash}:`;
    const keys = await kvScanAll(kv, `${prefix}*`);
    for (const key of keys) {
      const bucketStr = key.slice(prefix.length);
      const bucket = parseInt(bucketStr, 10);
      if (Number.isFinite(bucket) && bucket < currentBucket) {
        await kv.delete(key);
      }
    }
  } catch {
    // ignore — cleanup is best-effort
  }
}

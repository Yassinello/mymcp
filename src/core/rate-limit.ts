import { createHash } from "node:crypto";
import { getKVStore } from "./kv-store";

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
 * Use `scope` to partition limits — e.g. "mcp" for the tool endpoint vs
 * "setup" for the first-run credential tester, which should have much
 * tighter budgets.
 */
export async function checkRateLimit(
  identifier: string,
  options: { scope?: string; limit?: number } = {}
): Promise<RateLimitResult> {
  const scope = options.scope || "mcp";
  const defaultLimit = Math.max(1, parseInt(process.env.MYMCP_RATE_LIMIT_RPM ?? "60", 10) || 60);
  const limit = options.limit ?? defaultLimit;
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60_000);
  const resetAt = (minuteBucket + 1) * 60_000;
  const idHash = hashToken(identifier);
  const key = `ratelimit:${scope}:${idHash}:${minuteBucket}`;

  const kv = getKVStore();

  try {
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;

    if (count >= limit) {
      return { allowed: false, remaining: 0, resetAt };
    }

    await kv.set(key, String(count + 1));
    return { allowed: true, remaining: limit - count - 1, resetAt };
  } catch (err) {
    // Fail open: KV errors must not block legitimate requests
    console.warn(
      "[MyMCP] Rate limit KV error (failing open):",
      err instanceof Error ? err.message : String(err)
    );
    return { allowed: true, remaining: -1, resetAt };
  }
}

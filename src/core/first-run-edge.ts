/**
 * Edge-safe bootstrap rehydration for middleware.
 *
 * `first-run.ts` imports `node:fs` for the /tmp persistence layer, which
 * breaks when evaluated under Next's Edge runtime (middleware / proxy).
 * This module is a smaller, Edge-compatible subset: it reads the
 * first-run bootstrap directly from Upstash via the REST API, with no
 * file system access.
 *
 * The goal is to close the consistency gap where middleware would see
 * `process.env.MCP_AUTH_TOKEN` as undefined on a fresh lambda (because
 * the handler rehydrates from KV at request time, but the middleware
 * runs first and has no such path), leading to spurious
 * `/config` → `/welcome` redirects on a fully-initialized instance.
 *
 * SEC-02 (v0.10): this module no longer mutates process.env at request
 * time. Instead it populates a module-scope edge cache that the
 * Edge-runtime auth check (`proxy.ts`) consults via
 * `getEdgeBootstrapAuthToken()`. This matches the Node runtime
 * pattern in `first-run.ts` (bootstrapAuthTokenCache).
 *
 * Keep this file import-clean: only Web-standard APIs (`fetch`, `JSON`),
 * no Node built-ins, no `@/core/*` imports that might pull fs in
 * transitively.
 */

const KV_BOOTSTRAP_KEY = "mymcp:firstrun:bootstrap";

/**
 * SEC-02: in-memory edge cache for the bootstrap MCP_AUTH_TOKEN.
 * Replaces the pre-v0.10 `process.env.MCP_AUTH_TOKEN = ...` mutation
 * which was racy under interleaved edge requests.
 */
let edgeBootstrapAuthTokenCache: string | null = null;

/** Returns the Edge-runtime in-memory bootstrap token, if any. */
export function getEdgeBootstrapAuthToken(): string | null {
  return edgeBootstrapAuthTokenCache;
}

/**
 * If `process.env.MCP_AUTH_TOKEN` is missing on the current lambda and
 * Upstash is configured, fetch the persisted bootstrap and populate the
 * module-scope edge cache (NOT process.env — SEC-02). Swallows all
 * errors — middleware must never break page serving.
 *
 * On warm lambdas the first check short-circuits, so the Upstash call
 * only fires once per lambda lifetime (or never, if the platform already
 * injected MCP_AUTH_TOKEN via real env vars).
 */
export async function ensureBootstrapRehydratedFromUpstash(): Promise<void> {
  if (process.env.MCP_AUTH_TOKEN) return;
  if (edgeBootstrapAuthTokenCache) return;
  // Support both env var schemes: the legacy "Upstash for Vercel"
  // integration injects UPSTASH_REDIS_REST_URL/TOKEN, while the newer
  // Vercel Marketplace Upstash KV product injects KV_REST_API_URL/TOKEN.
  // Without this fallback, deploys via the marketplace flow silently
  // skip rehydrate even though Upstash IS configured — middleware then
  // sees no MCP_AUTH_TOKEN and redirects /config to /welcome.
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim();
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    ""
  ).trim();
  if (!url || !token) return;
  try {
    // Use the POST-with-command-array form rather than the GET-style
    // path endpoint. The key (`mymcp:firstrun:bootstrap`) contains
    // colons that some Upstash gateway revisions treat as URL-reserved
    // and 404 on, even though they were originally written via the
    // POST form by `UpstashKV` in `kv-store.ts`. Aligning the two paths
    // is the safer option.
    const res = await fetch(url.replace(/\/$/, ""), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["GET", KV_BOOTSTRAP_KEY]),
      // A second is plenty for a Redis GET on the same region; if it
      // takes longer than that, fall through to first-time-setup rather
      // than block the page.
      signal: AbortSignal.timeout(1000),
    });
    if (!res.ok) return;
    const json = (await res.json()) as { result?: string | null };
    if (!json.result) return;
    const parsed = JSON.parse(json.result) as {
      token?: unknown;
      claimId?: unknown;
      createdAt?: unknown;
    };
    if (typeof parsed.token !== "string" || parsed.token.length < 10) return;
    edgeBootstrapAuthTokenCache = parsed.token;
  } catch {
    // Network hiccup, malformed payload, timeout — any failure leaves
    // the edge cache as-is and the middleware proceeds with its existing
    // first-time-setup logic. Graceful degradation.
  }
}

import { timingSafeEqual, createHash } from "crypto";
import { isLoopbackRequest } from "./request-utils";
import { isClaimer } from "./first-run";
import { getTenantId } from "./tenant";

/**
 * Auth utilities for Kebab MCP.
 *
 * Two auth scopes:
 * - MCP auth: protects the /api/mcp endpoint (MCP_AUTH_TOKEN)
 *   Supports comma-separated list of tokens for multi-client deployments.
 * - Admin auth: protects the dashboard/welcome UI (ADMIN_AUTH_TOKEN, falls back to MCP_AUTH_TOKEN)
 *   Always single-token.
 */

let adminTokenWarned = false;

function warnAdminTokenFallback() {
  if (adminTokenWarned) return;
  if (!process.env.ADMIN_AUTH_TOKEN && !process.env.MCP_AUTH_TOKEN) {
    console.warn(
      "[Kebab MCP Security] No auth tokens configured. Admin dashboard is publicly accessible."
    );
    adminTokenWarned = true;
  } else if (!process.env.ADMIN_AUTH_TOKEN && process.env.MCP_AUTH_TOKEN) {
    console.warn(
      "[Kebab MCP Security] ADMIN_AUTH_TOKEN is not set. Falling back to MCP_AUTH_TOKEN for admin access. " +
        "Set a separate ADMIN_AUTH_TOKEN for better security isolation."
    );
    adminTokenWarned = true;
  }
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Split a comma-separated token env value into individual tokens.
 * Trims whitespace and drops empty segments — safe to call with undefined.
 */
export function parseTokens(envValue: string | undefined): string[] {
  if (!envValue) return [];
  return envValue
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Returns the first 8 hex chars of a token's SHA-256 hash.
 * Used for safe, non-reversible token identification in logs.
 */
export function tokenId(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}

export function extractToken(request: Request): string | null {
  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }

  // Fallback: query string token (needed for Claude Desktop)
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken) return queryToken;

  // Fallback: admin cookie (set by middleware after ?token= auth).
  // Dashboard fetches from the browser rely on this.
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)mymcp_admin_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]).trim();
  }

  return null;
}

/**
 * Check MCP endpoint auth. Returns error Response or null if OK, plus the
 * matched tokenId.
 *
 * Fail-closed semantics:
 * - If MCP_AUTH_TOKEN is set → one of the tokens must match
 * - If MCP_AUTH_TOKEN is unset → only loopback requests are allowed
 *   (local dev convenience). Public deploys that forget to set the env
 *   var MUST NOT expose the tools endpoint — that would let the internet
 *   drive the operator's Gmail, GitHub, Calendar, Slack, etc. using the
 *   connector credentials the server already has.
 */
export function checkMcpAuth(request: Request): {
  error: Response | null;
  tokenId: string | null;
  tenantId: string | null;
} {
  // Extract tenant from header (null = default tenant, same as before).
  let tenantIdValue: string | null;
  try {
    tenantIdValue = getTenantId(request);
  } catch (err) {
    return {
      error: new Response(err instanceof Error ? err.message : "Bad tenant header", {
        status: 400,
      }),
      tokenId: null,
      tenantId: null,
    };
  }

  // Resolve token list: tenant-specific env var first, then global fallback.
  const tenantTokenEnv = tenantIdValue
    ? process.env[`MCP_AUTH_TOKEN_${tenantIdValue.toUpperCase().replace(/-/g, "_")}`]
    : undefined;
  const tokens = parseTokens(tenantTokenEnv || process.env.MCP_AUTH_TOKEN);

  if (tokens.length === 0) {
    // First-run / dev: only loopback may skip auth.
    if (isLoopbackRequest(request)) return { error: null, tokenId: null, tenantId: tenantIdValue };
    return {
      error: new Response(
        "MCP_AUTH_TOKEN not configured on this server. Set it to enable the MCP endpoint.",
        { status: 503 }
      ),
      tokenId: null,
      tenantId: tenantIdValue,
    };
  }

  const provided = extractToken(request);
  if (provided) {
    for (const t of tokens) {
      if (safeCompare(provided, t)) {
        return { error: null, tokenId: tokenId(t), tenantId: tenantIdValue };
      }
    }
  }

  return { error: new Response("Unauthorized", { status: 401 }), tokenId: null, tenantId: null };
}

/**
 * Origin-header CSRF check for state-mutating admin routes.
 *
 * Defense-in-depth on top of SameSite=Strict — ensures that even if the
 * browser leaks the admin cookie cross-site (misconfigured proxy, buggy
 * future browser, etc.), the request's Origin header must still match
 * the server's host.
 *
 * Rules:
 * - GET/HEAD/OPTIONS are exempt (CSRF only matters for mutations)
 * - Missing Origin → allow (older clients, curl, server-to-server)
 * - Origin host must equal request host
 * - Returns null on success, 403 Response on mismatch.
 *
 * The Origin header is set by every browser on cross-site requests and
 * cannot be spoofed by JavaScript. curl/server-side requests don't set
 * it, which is why we allow the "missing" case.
 */
export function checkCsrf(request: Request): Response | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  const origin = request.headers.get("origin");
  if (!origin) return null; // non-browser caller

  const host = request.headers.get("host");
  if (!host) return null; // should not happen in practice

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return new Response(`CSRF check failed — Origin ${originHost} does not match host ${host}`, {
        status: 403,
      });
    }
  } catch {
    return new Response("CSRF check failed — malformed Origin", { status: 403 });
  }
  return null;
}

/**
 * Check admin dashboard auth. Returns error Response or null if OK.
 *
 * Also runs the Origin-header CSRF check for mutating methods — cheaper
 * than requiring every individual route to call checkCsrf() separately,
 * and impossible to forget.
 *
 * Multi-token aware: `ADMIN_AUTH_TOKEN` / `MCP_AUTH_TOKEN` can be a
 * comma-separated list so one deployment can hand different tokens to
 * different clients. Fix shipped in v0.5 phase 13 after route tests
 * caught that the prior single-string compare broke multi-token setups.
 */
export async function checkAdminAuth(request: Request): Promise<Response | null> {
  // CSRF first — doesn't depend on token state, so no info leak.
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  warnAdminTokenFallback();
  const adminRaw = process.env.ADMIN_AUTH_TOKEN || process.env.MCP_AUTH_TOKEN;
  const tokens = parseTokens(adminRaw);
  if (tokens.length === 0) {
    // First-run mode (no token configured anywhere). We must NOT silently
    // grant admin access to the public internet — that would let anyone seize
    // a fresh Vercel deploy. Allow access only when:
    //   (a) the request is from loopback (local dev), or
    //   (b) the request carries a valid first-run claim cookie (the user who
    //       initialized this instance via /welcome).
    if (isLoopbackRequest(request)) return null;
    try {
      if (await isClaimer(request)) return null;
    } catch {
      // SigningSecretUnavailableError or any other failure → deny.
    }
    return new Response("Unauthorized", { status: 401 });
  }

  const provided = extractToken(request);
  if (provided) {
    for (const t of tokens) {
      if (safeCompare(provided, t)) return null;
    }
  }

  return new Response("Unauthorized", { status: 401 });
}

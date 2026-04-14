/**
 * Shared test helpers for API route testing.
 *
 * Why a custom harness over @testing-library/react or MSW: our routes
 * are framework-agnostic Next 16 Route Handlers that just export async
 * functions taking `Request` and returning `Response`. We can call them
 * directly in a vitest test — no server, no fetch, no mocking network.
 * This helper wraps the ergonomics so individual tests stay concise.
 *
 * Usage:
 *   import { GET, POST } from "@/../app/api/config/auth-token/route";
 *   import { makeRequest } from "@/core/test-utils";
 *   const res = await GET(makeRequest("GET", "/api/config/auth-token"));
 *   expect(res.status).toBe(401);
 */

export interface MakeRequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  /** Override the full URL. Default: `http://mymcp.local${path}` */
  url?: string;
}

export function makeRequest(
  method: string,
  path: string,
  opts: MakeRequestOptions = {}
): Request {
  const url = opts.url ?? `http://mymcp.local${path}`;
  const headers: Record<string, string> = {
    host: new URL(url).host,
    ...opts.headers,
  };

  const init: RequestInit = { method, headers };
  if (opts.body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    if (!headers["content-type"] && !headers["Content-Type"]) {
      headers["content-type"] = "application/json";
    }
  }

  return new Request(url, init);
}

/**
 * Same as makeRequest but forces the request to appear cross-origin so
 * the CSRF check fires. Use in tests that verify the CSRF path explicitly.
 */
export function makeCrossOriginRequest(
  method: string,
  path: string,
  opts: MakeRequestOptions = {}
): Request {
  return makeRequest(method, path, {
    ...opts,
    headers: {
      origin: "https://evil.example.com",
      ...opts.headers,
    },
  });
}

/**
 * Parse a Response body as JSON. Throws if the response body isn't valid JSON.
 */
export async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Response body was not JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * Install a valid admin token for the duration of the current test.
 * Caller must restore after — usually via afterEach.
 */
export function installAdminToken(token = "test-admin-token-1234567890"): string {
  process.env.MCP_AUTH_TOKEN = token;
  return token;
}

/**
 * Construct headers that will satisfy checkAdminAuth (token + same-origin).
 */
export function adminHeaders(token: string, host = "mymcp.local"): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    host,
    origin: `http://${host}`,
  };
}

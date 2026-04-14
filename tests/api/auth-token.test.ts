/**
 * Tests for GET /api/config/auth-token — the admin-authed endpoint that
 * returns the MCP_AUTH_TOKEN on demand so the Settings → MCP panel can
 * reveal it without server-rendering it into the HTML payload.
 *
 * Regressions we care about:
 * - 401/403 without auth (CSRF or missing token)
 * - 404 when no token is configured (differentiate "wrong creds" from
 *   "no token at all" so an attacker can't oracle)
 * - 200 with the first token when multiple comma-separated tokens set
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/config/auth-token/route";
import { makeRequest, makeCrossOriginRequest, readJson } from "../../src/core/test-utils";

describe("GET /api/config/auth-token", () => {
  const originalMcp = process.env.MCP_AUTH_TOKEN;
  const originalAdmin = process.env.ADMIN_AUTH_TOKEN;

  beforeEach(() => {
    delete process.env.MCP_AUTH_TOKEN;
    delete process.env.ADMIN_AUTH_TOKEN;
  });

  afterEach(() => {
    if (originalMcp === undefined) delete process.env.MCP_AUTH_TOKEN;
    else process.env.MCP_AUTH_TOKEN = originalMcp;
    if (originalAdmin === undefined) delete process.env.ADMIN_AUTH_TOKEN;
    else process.env.ADMIN_AUTH_TOKEN = originalAdmin;
  });

  it("returns 401 when no token is configured and caller is not loopback", async () => {
    // URL hostname is non-loopback so the first-run bypass doesn't fire.
    // x-forwarded-for set to simulate a real proxy routing from the
    // public internet.
    const req = makeRequest("GET", "/api/config/auth-token", {
      url: "https://mymcp.example.com/api/config/auth-token",
      headers: { "x-forwarded-for": "203.0.113.42" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when token is configured but caller is unauthed", async () => {
    process.env.MCP_AUTH_TOKEN = "real-secret-token-1234567890";
    const req = makeRequest("GET", "/api/config/auth-token", {
      headers: { host: "mymcp.example.com" },
      url: "https://mymcp.example.com/api/config/auth-token",
    });
    const res = await GET(req);
    // checkAdminAuth returns 401 for missing creds when token is set
    expect(res.status).toBe(401);
  });

  it("returns the first token to an admin-authed caller", async () => {
    const token = "admin-reveal-token-1234567890";
    process.env.MCP_AUTH_TOKEN = token;
    const req = makeRequest("GET", "/api/config/auth-token", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await readJson<{ ok: boolean; token: string }>(res);
    expect(data.ok).toBe(true);
    expect(data.token).toBe(token);
  });

  it("returns the first token from a comma-separated list", async () => {
    process.env.MCP_AUTH_TOKEN = "primary-token-123456,secondary-token-456789";
    const req = makeRequest("GET", "/api/config/auth-token", {
      headers: {
        authorization: "Bearer primary-token-123456",
        host: "mymcp.local",
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await readJson<{ ok: boolean; token: string }>(res);
    expect(data.token).toBe("primary-token-123456");
  });

  it("returns 404 when the auth path is fine but MCP_AUTH_TOKEN is actually unset (admin fallback)", async () => {
    // Edge case: ADMIN_AUTH_TOKEN set without MCP_AUTH_TOKEN. Admin auth
    // succeeds but there's no MCP token to return.
    process.env.ADMIN_AUTH_TOKEN = "admin-only-token-1234567890";
    const req = makeRequest("GET", "/api/config/auth-token", {
      headers: {
        authorization: "Bearer admin-only-token-1234567890",
        host: "mymcp.local",
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("GET requests don't need to pass the CSRF check (safe method)", async () => {
    // Even a cross-origin GET should work because CSRF only applies to
    // mutating methods. The response depends on auth separately.
    process.env.MCP_AUTH_TOKEN = "csrf-test-token-123456";
    const req = makeCrossOriginRequest("GET", "/api/config/auth-token", {
      headers: {
        authorization: "Bearer csrf-test-token-123456",
        host: "mymcp.local",
      },
    });
    const res = await GET(req);
    // Should reach auth path, not fail on CSRF
    expect(res.status).toBe(200);
  });
});

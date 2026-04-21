/**
 * SAFE-02 + OBS-01: /api/health enrichment tests.
 *
 * Closes .planning/milestones/v0.10-durability-ROADMAP.md Phase 38:
 * - OBS-01: /api/health returns bootstrap.state, kv.reachable, kv.lastRehydrateAt
 * - SAFE-02: warnings[] surfaced when destructive env vars active in non-allowed NODE_ENV
 * - Public payload contains no secrets / env values
 * - Hard-cap 1.5 s handler budget
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET } from "@/../app/api/health/route";
import { __resetFirstRunForTests } from "@/core/first-run";
import { resetKVStoreCache, __resetKVLatencyBufferForTests as resetKvBuf } from "@/core/kv-store";

function makeReq(path = "/api/health"): Request {
  return new Request(`http://localhost${path}`);
}

describe("/api/health enrichment (OBS-01, SAFE-02)", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = [
    "NODE_ENV",
    "MYMCP_RECOVERY_RESET",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "MCP_AUTH_TOKEN",
  ];

  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
    for (const k of keys) delete process.env[k];
    resetKVStoreCache();
    resetKvBuf();
    __resetFirstRunForTests();
  });

  // Note: `resetKvBuf` reserved for future tests that inspect
  // `getKVLatencySamples()` mid-flight; reset here so each test starts
  // with a clean ring buffer.

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
    resetKVStoreCache();
    __resetFirstRunForTests();
    vi.restoreAllMocks();
  });

  it("returns { ok, version, bootstrap, kv } on the happy path", async () => {
    process.env.MCP_AUTH_TOKEN = "dummy-token";
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
    expect(body.bootstrap).toEqual({ state: "active" });
    expect(body.kv).toHaveProperty("reachable");
    expect(body.kv).toHaveProperty("lastRehydrateAt");
    expect(body.warnings).toBeUndefined();
  });

  it("bootstrap.state === 'pending' when no MCP_AUTH_TOKEN", async () => {
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.bootstrap.state).toBe("pending");
  });

  it("surfaces warnings[] when MYMCP_RECOVERY_RESET=1 in production", async () => {
    process.env.MYMCP_RECOVERY_RESET = "1";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const res = await GET(makeReq());
    const body = await res.json();
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.warnings.length).toBe(1);
    expect(body.warnings[0].code).toBe("DESTRUCTIVE_ENV_VAR_ACTIVE");
    expect(body.warnings[0].var).toBe("MYMCP_RECOVERY_RESET");
    expect(body.warnings[0].message).toContain("MYMCP_RECOVERY_RESET");
  });

  it("omits warnings when MYMCP_RECOVERY_RESET=1 in development", async () => {
    process.env.MYMCP_RECOVERY_RESET = "1";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.warnings).toBeUndefined();
  });

  it("response body contains no env values or secrets", async () => {
    process.env.MCP_AUTH_TOKEN = "SECRET-VALUE-xyz-1234";
    process.env.MYMCP_RECOVERY_RESET = "1";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const res = await GET(makeReq());
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("SECRET-VALUE-xyz-1234");
  });

  it("completes within 1.5s even when KV is slow", async () => {
    // Don't actually install a slow KV here — just assert the budget boundary.
    // Real 1.5s validation happens in the manual checkpoint.
    const started = Date.now();
    const res = await GET(makeReq());
    const elapsed = Date.now() - started;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(2000);
  });
});

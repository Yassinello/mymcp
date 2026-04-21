/**
 * rate-limit-step unit tests — PIPE-03 + PIPE-04.
 *
 * Covers:
 *  - opt-in: MYMCP_RATE_LIMIT_ENABLED !== 'true' → pass-through
 *  - keyFrom: 'token' (ctx.tokenId wins over extractToken)
 *  - keyFrom: 'ip' (x-forwarded-for leftmost, x-real-ip fallback, 'unknown' default)
 *  - keyFrom: 'cronSecretTokenId' (sha256-8 of CRON_SECRET)
 *  - Deny shape: 429 + Retry-After + X-RateLimit-Remaining + JSON body
 *  - CORRECTNESS TEST: 2-tenant scenario — tenant-A bursts to limit,
 *    tenant-B next request still allowed (validates POST-V0.10-AUDIT §B.2
 *    closure: rate-limit key now contains tenantId via getCurrentTenantId()).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { composeRequestPipeline } from "@/core/pipeline";
import { rateLimitStep } from "@/core/pipeline/rate-limit-step";
import { __resetInMemoryRateLimitForTests } from "@/core/rate-limit";
import { requestContext } from "@/core/request-context";
import type { Step } from "@/core/pipeline/types";

const ENV_KEYS = [
  "MYMCP_RATE_LIMIT_ENABLED",
  "MYMCP_RATE_LIMIT_INMEMORY",
  "MYMCP_RATE_LIMIT_RPM",
  "CRON_SECRET",
  "VERCEL",
];

function snapshotEnv(): Record<string, string | undefined> {
  const o: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) o[k] = process.env[k];
  return o;
}

function restoreEnv(s: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("rateLimitStep (PIPE-03 + PIPE-04)", () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshotEnv();
    process.env.MYMCP_RATE_LIMIT_INMEMORY = "1";
    __resetInMemoryRateLimitForTests();
  });

  afterEach(() => {
    restoreEnv(snap);
    __resetInMemoryRateLimitForTests();
  });

  it("passes through when MYMCP_RATE_LIMIT_ENABLED is not 'true'", async () => {
    delete process.env.MYMCP_RATE_LIMIT_ENABLED;
    const step = rateLimitStep({ scope: "mcp", keyFrom: "token" });
    const pipeline = composeRequestPipeline(
      [step],
      async () => new Response("ok", { status: 200 })
    );
    // Send 50 requests; none should be throttled (env-gate off)
    for (let i = 0; i < 50; i++) {
      const res = await pipeline(new Request("https://test.local/api/mcp"));
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 with Retry-After + X-RateLimit-Remaining: 0 after limit hit", async () => {
    process.env.MYMCP_RATE_LIMIT_ENABLED = "true";
    process.env.MYMCP_RATE_LIMIT_RPM = "2";

    // Seed ctx.tokenId so the rate-limit step uses it deterministically.
    const setToken: Step = async (ctx, next) => {
      ctx.tokenId = "deadbeef";
      return next();
    };
    const step = rateLimitStep({ scope: "mcp", keyFrom: "token" });
    const pipeline = composeRequestPipeline(
      [setToken, step],
      async () => new Response("ok", { status: 200 })
    );

    const r1 = await pipeline(new Request("https://test.local/api/mcp"));
    const r2 = await pipeline(new Request("https://test.local/api/mcp"));
    const r3 = await pipeline(new Request("https://test.local/api/mcp"));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.headers.get("Retry-After")).toBeTruthy();
    expect(r3.headers.get("X-RateLimit-Remaining")).toBe("0");
    const body = (await r3.json()) as { error: string };
    expect(body.error).toBe("Rate limit exceeded");
  });

  it("keyFrom: 'ip' derives from x-forwarded-for leftmost (Vercel path)", async () => {
    process.env.MYMCP_RATE_LIMIT_ENABLED = "true";
    process.env.MYMCP_RATE_LIMIT_RPM = "2";
    process.env.VERCEL = "1"; // getClientIP trusts x-forwarded-for only on Vercel

    const step = rateLimitStep({ scope: "webhook", keyFrom: "ip" });
    const pipeline = composeRequestPipeline([step], async () => new Response("ok"));
    const headers = { "x-forwarded-for": "1.2.3.4, 10.0.0.1" };

    const r1 = await pipeline(new Request("https://test.local/api/webhook/x", { headers }));
    const r2 = await pipeline(new Request("https://test.local/api/webhook/x", { headers }));
    const r3 = await pipeline(new Request("https://test.local/api/webhook/x", { headers }));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
  });

  it("keyFrom: 'ip' falls back to 'unknown' when headers absent and no NextRequest.ip (still limits — same bucket for all anon)", async () => {
    process.env.MYMCP_RATE_LIMIT_ENABLED = "true";
    process.env.MYMCP_RATE_LIMIT_RPM = "1";

    const step = rateLimitStep({ scope: "webhook", keyFrom: "ip" });
    const pipeline = composeRequestPipeline([step], async () => new Response("ok"));
    const r1 = await pipeline(new Request("https://test.local/api/webhook/x"));
    const r2 = await pipeline(new Request("https://test.local/api/webhook/x"));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);
  });

  it("keyFrom: 'cronSecretTokenId' derives from sha256 of CRON_SECRET", async () => {
    process.env.MYMCP_RATE_LIMIT_ENABLED = "true";
    process.env.MYMCP_RATE_LIMIT_RPM = "1";
    process.env.CRON_SECRET = "supersecret";

    const step = rateLimitStep({ scope: "cron", keyFrom: "cronSecretTokenId" });
    const pipeline = composeRequestPipeline([step], async () => new Response("ok"));
    const r1 = await pipeline(new Request("https://test.local/api/cron/health"));
    const r2 = await pipeline(new Request("https://test.local/api/cron/health"));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);
  });

  it("explicit limit overrides MYMCP_RATE_LIMIT_RPM", async () => {
    process.env.MYMCP_RATE_LIMIT_ENABLED = "true";
    process.env.MYMCP_RATE_LIMIT_RPM = "100";
    const step = rateLimitStep({ scope: "mcp", keyFrom: "token", limit: 1 });
    const setToken: Step = async (ctx, next) => {
      ctx.tokenId = "aabbccdd";
      return next();
    };
    const pipeline = composeRequestPipeline([setToken, step], async () => new Response("ok"));
    const r1 = await pipeline(new Request("https://test.local/api/mcp"));
    const r2 = await pipeline(new Request("https://test.local/api/mcp"));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);
  });

  it("CORRECTNESS: tenant-A burst does NOT throttle tenant-B (POST-V0.10-AUDIT §B.2 closure)", async () => {
    process.env.MYMCP_RATE_LIMIT_ENABLED = "true";
    process.env.MYMCP_RATE_LIMIT_RPM = "2";

    // Simulate authStep: set tenantId + tokenId on ctx AND re-enter
    // requestContext.run so rateLimitStep's checkRateLimit() sees
    // getCurrentTenantId(). This is the contract authStep honors.
    function makeFakeAuthStep(tenantId: string): Step {
      return async (ctx, next) => {
        ctx.tokenId = "shared-token-id"; // same token across tenants
        ctx.tenantId = tenantId;
        return requestContext.run({ tenantId }, next);
      };
    }
    const step = rateLimitStep({ scope: "mcp", keyFrom: "token" });

    async function runTenant(tenantId: string) {
      const pipeline = composeRequestPipeline(
        [makeFakeAuthStep(tenantId), step],
        async () => new Response("ok", { status: 200 })
      );
      return pipeline(new Request("https://test.local/api/mcp"));
    }

    // Tenant A bursts to the limit (2 OK + 1 denied)
    const a1 = await runTenant("tenant-a");
    const a2 = await runTenant("tenant-a");
    const a3 = await runTenant("tenant-a");
    expect(a1.status).toBe(200);
    expect(a2.status).toBe(200);
    expect(a3.status).toBe(429);

    // Tenant B's first request is still allowed — separate bucket
    const b1 = await runTenant("tenant-b");
    expect(b1.status).toBe(200);
  });
});

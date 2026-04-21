/**
 * auth-step unit tests — PIPE-02 + PIPE-03.
 *
 * Covers:
 *  - 'mcp' kind: unauthed → 401; authed → calls next() + sets tokenId + tenantId;
 *    wraps next() in nested requestContext.run so downstream observes tenantId
 *  - 'admin' kind: unauthed → 401; authed → calls next()
 *  - 'cron' kind: CRON_SECRET mismatch → 401; CRON_SECRET missing + non-loopback → 503
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { composeRequestPipeline } from "@/core/pipeline";
import { authStep } from "@/core/pipeline/auth-step";
import { __resetFirstRunForTests } from "@/core/first-run";
import { getCurrentTenantId } from "@/core/request-context";
import type { Step } from "@/core/pipeline/types";

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of keys) out[k] = process.env[k];
  return out;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(snap)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("authStep('mcp') (PIPE-02)", () => {
  const envKeys = ["MCP_AUTH_TOKEN", "MCP_AUTH_TOKEN_ACME", "VERCEL"];
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshotEnv(envKeys);
    __resetFirstRunForTests();
  });

  afterEach(() => {
    restoreEnv(snap);
  });

  it("returns 401 on unauthenticated MCP request", async () => {
    process.env.MCP_AUTH_TOKEN = "the-token";
    process.env.VERCEL = "1"; // force non-loopback semantics

    const step = authStep("mcp");
    const req = new Request("https://test.local/api/mcp", {
      method: "POST",
      headers: {},
    });
    const pipeline = composeRequestPipeline([step], async () => new Response("ok"));
    const res = await pipeline(req);
    expect(res.status).toBe(401);
  });

  it("calls next() on authed MCP request and writes tokenId + null tenantId", async () => {
    process.env.MCP_AUTH_TOKEN = "the-token";

    const step = authStep("mcp");
    const observe: Step = async (ctx, next) => {
      expect(ctx.tokenId).toBeTruthy();
      expect(ctx.tokenId).toHaveLength(8); // sha256 first-8
      expect(ctx.tenantId).toBeNull();
      expect(ctx.authKind).toBe("mcp");
      return next();
    };
    const pipeline = composeRequestPipeline([step, observe], async () => new Response("ok"));
    const res = await pipeline(
      new Request("https://test.local/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer the-token" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("resolves tenantId from x-mymcp-tenant and propagates it via nested requestContext.run", async () => {
    // Tenant-specific token env var (MCP_AUTH_TOKEN_ACME) matches the tenant
    process.env.MCP_AUTH_TOKEN_ACME = "acme-token";

    const step = authStep("mcp");
    let seenByDownstream: string | null = "unset";
    let seenByHandler: string | null = "unset";
    const observe: Step = async (_c, next) => {
      seenByDownstream = getCurrentTenantId();
      return next();
    };
    const pipeline = composeRequestPipeline([step, observe], async () => {
      seenByHandler = getCurrentTenantId();
      return new Response("ok");
    });

    const res = await pipeline(
      new Request("https://test.local/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer acme-token", "x-mymcp-tenant": "acme" },
      })
    );
    expect(res.status).toBe(200);
    expect(seenByDownstream).toBe("acme");
    expect(seenByHandler).toBe("acme");
  });
});

describe("authStep('admin') (PIPE-02)", () => {
  const envKeys = ["ADMIN_AUTH_TOKEN", "MCP_AUTH_TOKEN", "VERCEL"];
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshotEnv(envKeys);
    __resetFirstRunForTests();
  });

  afterEach(() => {
    restoreEnv(snap);
  });

  it("returns 401 on unauthenticated admin request", async () => {
    process.env.ADMIN_AUTH_TOKEN = "admin-t";
    process.env.VERCEL = "1";

    const step = authStep("admin");
    const pipeline = composeRequestPipeline([step], async () => new Response("ok"));
    const res = await pipeline(new Request("https://test.local/api/admin/x", { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("calls next() on authed admin request", async () => {
    process.env.ADMIN_AUTH_TOKEN = "admin-t";

    const step = authStep("admin");
    const observe: Step = async (ctx, next) => {
      expect(ctx.authKind).toBe("admin");
      return next();
    };
    const pipeline = composeRequestPipeline([step, observe], async () => new Response("ok"));
    const res = await pipeline(
      new Request("https://test.local/api/admin/x", {
        method: "GET",
        headers: { authorization: "Bearer admin-t" },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("authStep('cron') (PIPE-02)", () => {
  const envKeys = ["CRON_SECRET", "VERCEL"];
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshotEnv(envKeys);
  });

  afterEach(() => {
    restoreEnv(snap);
  });

  it("returns 401 when CRON_SECRET set but Authorization header is wrong", async () => {
    process.env.CRON_SECRET = "cron-sec";
    const step = authStep("cron");
    const pipeline = composeRequestPipeline([step], async () => new Response("ok"));
    const res = await pipeline(
      new Request("https://test.local/api/cron/health", {
        method: "GET",
        headers: { authorization: "Bearer WRONG" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when CRON_SECRET unset and request is non-loopback (Vercel)", async () => {
    delete process.env.CRON_SECRET;
    process.env.VERCEL = "1";
    const step = authStep("cron");
    const pipeline = composeRequestPipeline([step], async () => new Response("ok"));
    const res = await pipeline(
      new Request("https://test.local/api/cron/health", { method: "GET" })
    );
    expect(res.status).toBe(503);
  });

  it("calls next() on matching Bearer CRON_SECRET + writes tokenId (sha256-8)", async () => {
    process.env.CRON_SECRET = "cron-sec";
    const step = authStep("cron");
    const observe: Step = async (ctx, next) => {
      expect(ctx.authKind).toBe("cron");
      expect(ctx.tokenId).toHaveLength(8);
      return next();
    };
    const pipeline = composeRequestPipeline([step, observe], async () => new Response("ok"));
    const res = await pipeline(
      new Request("https://test.local/api/cron/health", {
        method: "GET",
        headers: { authorization: "Bearer cron-sec" },
      })
    );
    expect(res.status).toBe(200);
  });
});

/**
 * SEC-04 + SEC-05 regression tests for the welcome flow.
 *
 * Covers:
 *  1. Pre-v0.10 forged cookie (HMAC keyed to VERCEL_GIT_COMMIT_SHA) is
 *     rejected by /api/welcome/init. This is the critical exploit path
 *     closed by SEC-04.
 *  2. /api/welcome/claim returns 503 `signing_secret_unavailable` on a
 *     deploy that has no durable KV and no MYMCP_ALLOW_EPHEMERAL_SECRET
 *     opt-in.
 *  3. /api/welcome/init returns 503 `signing_secret_unavailable` under
 *     the same conditions.
 *  4. Happy path: MYMCP_ALLOW_EPHEMERAL_SECRET=1 unblocks local claim
 *     minting.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as kvStore from "@/core/kv-store";
import { __resetFirstRunForTests } from "@/core/first-run";
import { resetSigningSecretCache } from "@/core/signing-secret";

const TMP_SEED_PATH = join(tmpdir(), "mymcp-signing-seed");

function makeStubKv() {
  const store = new Map<string, string>();
  return {
    kind: "filesystem" as const,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    delete: vi.fn(async (k: string) => {
      store.delete(k);
    }),
    list: vi.fn(async (prefix?: string) =>
      Array.from(store.keys()).filter((k) => (prefix ? k.startsWith(prefix) : true))
    ),
    _store: store,
  };
}

describe("welcome forgery + 503 regression (SEC-04/05)", () => {
  const ORIG_UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
  const ORIG_UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  const ORIG_KV_URL = process.env.KV_REST_API_URL;
  const ORIG_KV_TOKEN = process.env.KV_REST_API_TOKEN;
  const ORIG_VERCEL = process.env.VERCEL;
  const ORIG_NODE_ENV = process.env.NODE_ENV;
  const ORIG_ALLOW = process.env.MYMCP_ALLOW_EPHEMERAL_SECRET;
  const ORIG_COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA;
  const ORIG_MCP_AUTH = process.env.MCP_AUTH_TOKEN;

  let stubKv: ReturnType<typeof makeStubKv>;
  let kvSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stubKv = makeStubKv();
    kvSpy = vi
      .spyOn(kvStore, "getKVStore")
      .mockReturnValue(stubKv as unknown as ReturnType<typeof kvStore.getKVStore>);
    delete process.env.MCP_AUTH_TOKEN;
    __resetFirstRunForTests();
    resetSigningSecretCache();
    try {
      if (existsSync(TMP_SEED_PATH)) unlinkSync(TMP_SEED_PATH);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    kvSpy.mockRestore();
    const env = process.env as Record<string, string | undefined>;
    if (ORIG_UPSTASH_URL === undefined) delete env.UPSTASH_REDIS_REST_URL;
    else env.UPSTASH_REDIS_REST_URL = ORIG_UPSTASH_URL;
    if (ORIG_UPSTASH_TOKEN === undefined) delete env.UPSTASH_REDIS_REST_TOKEN;
    else env.UPSTASH_REDIS_REST_TOKEN = ORIG_UPSTASH_TOKEN;
    if (ORIG_KV_URL === undefined) delete env.KV_REST_API_URL;
    else env.KV_REST_API_URL = ORIG_KV_URL;
    if (ORIG_KV_TOKEN === undefined) delete env.KV_REST_API_TOKEN;
    else env.KV_REST_API_TOKEN = ORIG_KV_TOKEN;
    if (ORIG_VERCEL === undefined) delete env.VERCEL;
    else env.VERCEL = ORIG_VERCEL;
    if (ORIG_NODE_ENV === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = ORIG_NODE_ENV;
    if (ORIG_ALLOW === undefined) delete env.MYMCP_ALLOW_EPHEMERAL_SECRET;
    else env.MYMCP_ALLOW_EPHEMERAL_SECRET = ORIG_ALLOW;
    if (ORIG_COMMIT_SHA === undefined) delete env.VERCEL_GIT_COMMIT_SHA;
    else env.VERCEL_GIT_COMMIT_SHA = ORIG_COMMIT_SHA;
    if (ORIG_MCP_AUTH === undefined) delete env.MCP_AUTH_TOKEN;
    else env.MCP_AUTH_TOKEN = ORIG_MCP_AUTH;
    __resetFirstRunForTests();
    resetSigningSecretCache();
    try {
      if (existsSync(TMP_SEED_PATH)) unlinkSync(TMP_SEED_PATH);
    } catch {
      // ignore
    }
  });

  it("rejects a cookie forged with the pre-v0.10 HMAC algorithm (SEC-04)", async () => {
    // Simulate a real deploy: Upstash configured, commit SHA known (public).
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";

    // Pre-v0.10 forgery: attacker computes HMAC with the public SHA-derived
    // secret and constructs a valid-looking claim cookie.
    const prefixSecret = `mymcp-firstrun-v1:abc123`;
    const forgedClaimId = "f".repeat(64);
    const forgedSig = createHmac("sha256", prefixSecret).update(forgedClaimId).digest("hex");
    const forgedCookie = `${forgedClaimId}.${forgedSig}`;

    // POST /api/welcome/init with the forged cookie.
    const { POST } = await import("../../app/api/welcome/init/route");
    const req = new Request("http://mymcp.example.com/api/welcome/init", {
      method: "POST",
      headers: {
        cookie: `mymcp_firstrun_claim=${encodeURIComponent(forgedCookie)}`,
        host: "mymcp.example.com",
      },
    });
    const res = await POST(req);

    // v0.10 derives its secret from randomBytes, persisted to the stub KV.
    // The forged signature does not match the real secret, so isClaimer()
    // returns false → 403.
    expect(res.status).toBe(403);
    // Crucially, the response must NOT contain a minted MCP_AUTH_TOKEN.
    const body = (await res.json()) as { token?: string; error?: string };
    expect(body.token).toBeUndefined();
    expect(body.error).toBe("Forbidden — not the claimer");
    // process.env.MCP_AUTH_TOKEN must remain unset.
    expect(process.env.MCP_AUTH_TOKEN).toBeUndefined();
  });

  it("/api/welcome/claim returns 503 on Vercel prod without durable KV (SEC-05)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.MYMCP_ALLOW_EPHEMERAL_SECRET;
    const env = process.env as Record<string, string | undefined>;
    env.VERCEL = "1";
    env.NODE_ENV = "production";

    const { POST } = await import("../../app/api/welcome/claim/route");
    const req = new Request("http://mymcp.example.com/api/welcome/claim", {
      method: "POST",
      headers: { host: "mymcp.example.com" },
    });
    const res = await POST(req);

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; hint?: string };
    expect(body.error).toBe("signing_secret_unavailable");
    expect(body.hint).toContain("UPSTASH_REDIS_REST_URL");
    expect(body.hint).toContain("MYMCP_ALLOW_EPHEMERAL_SECRET");
  });

  it("/api/welcome/init returns 503 on Vercel prod without durable KV (SEC-05)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.MYMCP_ALLOW_EPHEMERAL_SECRET;
    const env = process.env as Record<string, string | undefined>;
    env.VERCEL = "1";
    env.NODE_ENV = "production";

    const { POST } = await import("../../app/api/welcome/init/route");
    const req = new Request("http://mymcp.example.com/api/welcome/init", {
      method: "POST",
      headers: {
        cookie: `mymcp_firstrun_claim=${encodeURIComponent("fake.cookie")}`,
        host: "mymcp.example.com",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; hint?: string };
    expect(body.error).toBe("signing_secret_unavailable");
  });

  it("MYMCP_ALLOW_EPHEMERAL_SECRET=1 lets /api/welcome/claim succeed on ephemeral deploys", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const env = process.env as Record<string, string | undefined>;
    env.VERCEL = "1";
    env.NODE_ENV = "production";
    env.MYMCP_ALLOW_EPHEMERAL_SECRET = "1";

    const { POST } = await import("../../app/api/welcome/claim/route");
    const req = new Request("http://mymcp.example.com/api/welcome/claim", {
      method: "POST",
      headers: { host: "mymcp.example.com" },
    });
    const res = await POST(req);

    // 200 with status="new" on first call
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe("new");
  });
});

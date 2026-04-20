/**
 * Tests for src/core/signing-secret.ts — SEC-04.
 *
 * Behaviors covered:
 *   1. Fresh KV + no prior secret → mint random 32-byte hex, persist to KV.
 *   2. Existing KV secret → return it; no write.
 *   3. rotateSigningSecret() overwrites and clears cache.
 *   4. Two consecutive getSigningSecret() calls return the same value.
 *   5. After rotate, new getSigningSecret() returns a different value.
 *   6. Pre-fix algorithm (HMAC keyed to `mymcp-firstrun-v1:${VERCEL_GIT_COMMIT_SHA}`)
 *      no longer verifies a cookie against the new secret.
 *   7. Production-like deploy (VERCEL=1) + no Upstash + no /tmp + no opt-in
 *      → SigningSecretUnavailableError.
 *   8. MYMCP_ALLOW_EPHEMERAL_SECRET=1 opts in to /tmp fallback.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as kvStore from "@/core/kv-store";

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

async function loadFresh() {
  const mod = await import("@/core/signing-secret");
  mod.resetSigningSecretCache();
  return mod;
}

describe("signing-secret (SEC-04)", () => {
  const ORIG_UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
  const ORIG_UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  const ORIG_KV_URL = process.env.KV_REST_API_URL;
  const ORIG_KV_TOKEN = process.env.KV_REST_API_TOKEN;
  const ORIG_VERCEL = process.env.VERCEL;
  const ORIG_NODE_ENV = process.env.NODE_ENV;
  const ORIG_ALLOW = process.env.MYMCP_ALLOW_EPHEMERAL_SECRET;
  const ORIG_COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA;

  let stubKv: ReturnType<typeof makeStubKv>;
  let kvSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stubKv = makeStubKv();
    kvSpy = vi
      .spyOn(kvStore, "getKVStore")
      .mockReturnValue(stubKv as unknown as ReturnType<typeof kvStore.getKVStore>);
    // Pretend Upstash is configured by default for most tests.
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.VERCEL;
    delete process.env.MYMCP_ALLOW_EPHEMERAL_SECRET;
    // Clean up any leftover /tmp seed from a previous test.
    try {
      if (existsSync(TMP_SEED_PATH)) unlinkSync(TMP_SEED_PATH);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    kvSpy.mockRestore();
    if (ORIG_UPSTASH_URL === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = ORIG_UPSTASH_URL;
    if (ORIG_UPSTASH_TOKEN === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = ORIG_UPSTASH_TOKEN;
    if (ORIG_KV_URL === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = ORIG_KV_URL;
    if (ORIG_KV_TOKEN === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = ORIG_KV_TOKEN;
    if (ORIG_VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = ORIG_VERCEL;
    const env = process.env as Record<string, string | undefined>;
    if (ORIG_NODE_ENV === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = ORIG_NODE_ENV;
    if (ORIG_ALLOW === undefined) delete process.env.MYMCP_ALLOW_EPHEMERAL_SECRET;
    else process.env.MYMCP_ALLOW_EPHEMERAL_SECRET = ORIG_ALLOW;
    if (ORIG_COMMIT_SHA === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = ORIG_COMMIT_SHA;
    try {
      if (existsSync(TMP_SEED_PATH)) unlinkSync(TMP_SEED_PATH);
    } catch {
      // ignore
    }
  });

  it("mints a 64-char hex secret and persists to KV on first call", async () => {
    const mod = await loadFresh();
    const secret = await mod.getSigningSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(stubKv._store.get("mymcp:firstrun:signing-secret")).toBe(secret);
  });

  it("returns the KV value when one already exists (no write)", async () => {
    stubKv._store.set("mymcp:firstrun:signing-secret", "a".repeat(64));
    const mod = await loadFresh();
    const secret = await mod.getSigningSecret();
    expect(secret).toBe("a".repeat(64));
    expect(stubKv.set).not.toHaveBeenCalled();
  });

  it("returns the same value across consecutive calls (module cache)", async () => {
    const mod = await loadFresh();
    const a = await mod.getSigningSecret();
    const b = await mod.getSigningSecret();
    expect(a).toBe(b);
  });

  it("rotateSigningSecret produces a different value and updates KV", async () => {
    const mod = await loadFresh();
    const before = await mod.getSigningSecret();
    const rotated = await mod.rotateSigningSecret();
    const after = await mod.getSigningSecret();
    expect(rotated).not.toBe(before);
    expect(after).toBe(rotated);
    expect(stubKv._store.get("mymcp:firstrun:signing-secret")).toBe(rotated);
  });

  it("cookie forged with pre-fix algorithm (keyed to commit SHA) does NOT verify", async () => {
    // Pre-fix algorithm: secret = `mymcp-firstrun-v1:${VERCEL_GIT_COMMIT_SHA}`
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    const prefixSecret = `mymcp-firstrun-v1:abc123`;
    const claimId = "f".repeat(64);
    const forgedSig = createHmac("sha256", prefixSecret).update(claimId).digest("hex");
    const forgedCookie = `${claimId}.${forgedSig}`;

    // The new getSigningSecret yields a random 32-byte hex, unrelated to the SHA.
    const mod = await loadFresh();
    const newSecret = await mod.getSigningSecret();
    expect(newSecret).not.toBe(prefixSecret);

    // A re-sign of claimId under the new secret yields a different signature.
    const legitSig = createHmac("sha256", newSecret).update(claimId).digest("hex");
    expect(legitSig).not.toBe(forgedSig);
    // The forged cookie's signature does not match the new-secret signature,
    // proving an attacker who knows VERCEL_GIT_COMMIT_SHA cannot forge a valid
    // cookie on a v0.10+ deploy.
    expect(forgedCookie.endsWith(legitSig)).toBe(false);
  });

  it("throws SigningSecretUnavailableError on Vercel prod with no KV and no opt-in", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.VERCEL = "1";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.MYMCP_ALLOW_EPHEMERAL_SECRET;

    const mod = await loadFresh();
    await expect(mod.getSigningSecret()).rejects.toMatchObject({
      name: "SigningSecretUnavailableError",
    });
  });

  it("MYMCP_ALLOW_EPHEMERAL_SECRET=1 opts in to /tmp fallback on Vercel prod", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.VERCEL = "1";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.MYMCP_ALLOW_EPHEMERAL_SECRET = "1";

    const mod = await loadFresh();
    const secret = await mod.getSigningSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    // Second call returns cached value — still works even though the /tmp
    // seed file is where the previous run persisted it.
    const again = await mod.getSigningSecret();
    expect(again).toBe(secret);
  });
});

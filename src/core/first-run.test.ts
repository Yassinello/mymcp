import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import {
  isFirstRunMode,
  isBootstrapActive,
  getOrCreateClaim,
  isClaimer,
  bootstrapToken,
  clearBootstrap,
  forceReset,
  rehydrateBootstrapFromTmp,
  rehydrateBootstrapAsync,
  __resetFirstRunForTests,
  __internals,
} from "./first-run";
import * as kvStore from "./kv-store";

const ORIGINAL_TOKEN = process.env.MCP_AUTH_TOKEN;

function makeRequest(cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  return new Request("http://localhost/api/welcome/claim", { headers });
}

beforeEach(() => {
  delete process.env.MCP_AUTH_TOKEN;
  __resetFirstRunForTests();
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.MCP_AUTH_TOKEN;
  } else {
    process.env.MCP_AUTH_TOKEN = ORIGINAL_TOKEN;
  }
  __resetFirstRunForTests();
  try {
    if (existsSync(__internals.BOOTSTRAP_PATH)) unlinkSync(__internals.BOOTSTRAP_PATH);
  } catch {
    // ignore
  }
});

describe("isFirstRunMode", () => {
  it("is true when MCP_AUTH_TOKEN is unset", () => {
    expect(isFirstRunMode()).toBe(true);
  });
  it("is false when MCP_AUTH_TOKEN is set", () => {
    process.env.MCP_AUTH_TOKEN = "x".repeat(32);
    expect(isFirstRunMode()).toBe(false);
  });
});

describe("getOrCreateClaim", () => {
  it("creates a new claim with cookie on first call", () => {
    const result = getOrCreateClaim(makeRequest());
    expect(result.isNewClaim).toBe(true);
    expect(result.isClaimer).toBe(true);
    expect(result.claimId).toMatch(/^[0-9a-f]{64}$/);
    expect(result.cookieToSet).toBeTruthy();
  });

  it("recognizes the same claimer via cookie", () => {
    const first = getOrCreateClaim(makeRequest());
    const cookieValue = encodeURIComponent(first.cookieToSet || "");
    const second = getOrCreateClaim(makeRequest(`mymcp_firstrun_claim=${cookieValue}`));
    expect(second.isNewClaim).toBe(false);
    expect(second.isClaimer).toBe(true);
    expect(second.claimId).toBe(first.claimId);
  });

  it("locks out a second visitor with no cookie", () => {
    getOrCreateClaim(makeRequest());
    const other = getOrCreateClaim(makeRequest());
    expect(other.isClaimer).toBe(false);
  });

  it("rejects a request with a forged/unsigned cookie", () => {
    getOrCreateClaim(makeRequest());
    const forged = getOrCreateClaim(makeRequest("mymcp_firstrun_claim=garbage"));
    expect(forged.isClaimer).toBe(false);
  });
});

describe("isClaimer", () => {
  it("true for the original claimer", () => {
    const c = getOrCreateClaim(makeRequest());
    const cookie = `mymcp_firstrun_claim=${encodeURIComponent(c.cookieToSet || "")}`;
    expect(isClaimer(makeRequest(cookie))).toBe(true);
  });
  it("false for an unrelated visitor", () => {
    getOrCreateClaim(makeRequest());
    expect(isClaimer(makeRequest())).toBe(false);
  });
});

describe("bootstrapToken", () => {
  it("generates a 64-char hex token and mutates process.env", () => {
    const c = getOrCreateClaim(makeRequest());
    const { token } = bootstrapToken(c.claimId);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(process.env.MCP_AUTH_TOKEN).toBe(token);
    expect(isBootstrapActive()).toBe(true);
  });

  it("is idempotent for the same claim id", () => {
    const c = getOrCreateClaim(makeRequest());
    const a = bootstrapToken(c.claimId);
    const b = bootstrapToken(c.claimId);
    expect(a.token).toBe(b.token);
  });

  it("persists to the bootstrap /tmp file", () => {
    const c = getOrCreateClaim(makeRequest());
    bootstrapToken(c.claimId);
    expect(existsSync(__internals.BOOTSTRAP_PATH)).toBe(true);
  });
});

describe("clearBootstrap", () => {
  it("removes in-memory and on-disk state", () => {
    const c = getOrCreateClaim(makeRequest());
    bootstrapToken(c.claimId);
    clearBootstrap();
    expect(isBootstrapActive()).toBe(false);
    expect(existsSync(__internals.BOOTSTRAP_PATH)).toBe(false);
  });
});

describe("forceReset", () => {
  it("clears in-memory and on-disk state", () => {
    const c = getOrCreateClaim(makeRequest());
    bootstrapToken(c.claimId);
    expect(isBootstrapActive()).toBe(true);
    forceReset();
    expect(isBootstrapActive()).toBe(false);
    expect(existsSync(__internals.BOOTSTRAP_PATH)).toBe(false);
  });
});

describe("MYMCP_RECOVERY_RESET", () => {
  const ORIGINAL_RESET = process.env.MYMCP_RECOVERY_RESET;

  afterEach(() => {
    if (ORIGINAL_RESET === undefined) {
      delete process.env.MYMCP_RECOVERY_RESET;
    } else {
      process.env.MYMCP_RECOVERY_RESET = ORIGINAL_RESET;
    }
  });

  it("prevents rehydrate from /tmp and deletes the file", () => {
    __resetFirstRunForTests();
    // Manually write a bootstrap payload to /tmp.
    const payload = {
      claimId: "a".repeat(64),
      token: "b".repeat(64),
      createdAt: Date.now(),
    };
    writeFileSync(__internals.BOOTSTRAP_PATH, JSON.stringify(payload), { encoding: "utf-8" });
    expect(existsSync(__internals.BOOTSTRAP_PATH)).toBe(true);

    process.env.MYMCP_RECOVERY_RESET = "1";
    rehydrateBootstrapFromTmp();

    expect(isBootstrapActive()).toBe(false);
    expect(existsSync(__internals.BOOTSTRAP_PATH)).toBe(false);
  });
});

// ── KV cross-instance bootstrap persistence ────────────────────────
//
// `isExternalKvAvailable()` returns true when off-Vercel (which the test
// environment is by default), so the helpers will exercise the real KV
// store. We mock getKVStore() to capture set/get/delete calls.

describe("KV cross-instance bootstrap persistence", () => {
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

  let stubKv: ReturnType<typeof makeStubKv>;
  let kvSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stubKv = makeStubKv();
    kvSpy = vi
      .spyOn(kvStore, "getKVStore")
      .mockReturnValue(stubKv as unknown as ReturnType<typeof kvStore.getKVStore>);
  });

  afterEach(() => {
    kvSpy.mockRestore();
  });

  it("persistBootstrapToKv is called when KV is available (via bootstrapToken)", async () => {
    const c = getOrCreateClaim(new Request("http://localhost/api/welcome/claim"));
    bootstrapToken(c.claimId);
    // Fire-and-forget: wait a microtask tick.
    await new Promise((r) => setTimeout(r, 10));
    expect(stubKv.set).toHaveBeenCalledTimes(1);
    expect(stubKv.set.mock.calls[0][0]).toBe("mymcp:firstrun:bootstrap");
    const stored = JSON.parse(stubKv.set.mock.calls[0][1] as string);
    expect(stored.claimId).toBe(c.claimId);
    expect(stored.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rehydrateBootstrapAsync hydrates from KV when /tmp is empty", async () => {
    // /tmp is already empty (file-level beforeEach reset). Pre-populate KV
    // AFTER the spy is installed so the data lands in the stub store.
    expect(isBootstrapActive()).toBe(false);
    const payload = {
      claimId: "c".repeat(64),
      token: "d".repeat(64),
      createdAt: Date.now(),
    };
    stubKv._store.set("mymcp:firstrun:bootstrap", JSON.stringify(payload));

    await rehydrateBootstrapAsync();

    expect(isBootstrapActive()).toBe(true);
    expect(process.env.MCP_AUTH_TOKEN).toBe(payload.token);
    expect(stubKv.get).toHaveBeenCalledWith("mymcp:firstrun:bootstrap");
    // Mirrored back to /tmp for fast-path next time.
    expect(existsSync(__internals.BOOTSTRAP_PATH)).toBe(true);
  });

  it("rehydrateBootstrapAsync prefers /tmp when both have data", async () => {
    // Write a different payload to /tmp (so the sync path wins).
    const tmpPayload = {
      claimId: "1".repeat(64),
      token: "2".repeat(64),
      createdAt: Date.now(),
    };
    writeFileSync(__internals.BOOTSTRAP_PATH, JSON.stringify(tmpPayload), { encoding: "utf-8" });

    // KV has different data.
    stubKv._store.set(
      "mymcp:firstrun:bootstrap",
      JSON.stringify({
        claimId: "9".repeat(64),
        token: "8".repeat(64),
        createdAt: Date.now(),
      })
    );

    await rehydrateBootstrapAsync();

    // /tmp wins → token is the tmpPayload one.
    expect(process.env.MCP_AUTH_TOKEN).toBe(tmpPayload.token);
    // KV.get should NOT have been called because the sync path already
    // populated activeBootstrap.
    expect(stubKv.get).not.toHaveBeenCalled();
  });

  it("clearBootstrap also deletes from KV", async () => {
    const c = getOrCreateClaim(new Request("http://localhost/api/welcome/claim"));
    bootstrapToken(c.claimId);
    await new Promise((r) => setTimeout(r, 10));
    stubKv.delete.mockClear();

    clearBootstrap();
    await new Promise((r) => setTimeout(r, 10));

    expect(stubKv.delete).toHaveBeenCalledWith("mymcp:firstrun:bootstrap");
  });

  it("forceReset also deletes from KV", async () => {
    const c = getOrCreateClaim(new Request("http://localhost/api/welcome/claim"));
    bootstrapToken(c.claimId);
    await new Promise((r) => setTimeout(r, 10));
    stubKv.delete.mockClear();

    forceReset();
    await new Promise((r) => setTimeout(r, 10));

    expect(stubKv.delete).toHaveBeenCalledWith("mymcp:firstrun:bootstrap");
  });
});

/**
 * Tests for per-tool enable/disable via KV.
 *
 * Phase 42 (TEN-03): tool-toggles are now tenant-scoped. Reads/writes
 * flow through `getContextKVStore()`; cache is keyed per-tenant.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared in-memory KV. TenantKVStore semantics: keys under a tenant
// prefix isolate per-tenant state; null tenant stores bare keys.
const mockKV: Record<string, string> = {};

function baseStore() {
  return {
    kind: "filesystem" as const,
    get: async (key: string) => mockKV[key] ?? null,
    set: async (key: string, value: string) => {
      mockKV[key] = value;
    },
    delete: async (key: string) => {
      delete mockKV[key];
    },
    list: async (prefix?: string) =>
      Object.keys(mockKV).filter((k) => (prefix ? k.startsWith(prefix) : true)),
  };
}

function prefixed(tenantId: string | null) {
  if (tenantId === null) return baseStore();
  const base = baseStore();
  const pk = (k: string) => `tenant:${tenantId}:${k}`;
  return {
    ...base,
    get: async (key: string) => mockKV[pk(key)] ?? null,
    set: async (key: string, value: string) => {
      mockKV[pk(key)] = value;
    },
    delete: async (key: string) => {
      delete mockKV[pk(key)];
    },
    list: async (prefix?: string) => {
      const full = pk(prefix ?? "");
      return Object.keys(mockKV)
        .filter((k) => k.startsWith(full))
        .map((k) => k.slice(`tenant:${tenantId}:`.length));
    },
  };
}

vi.mock("@/core/kv-store", () => ({
  getKVStore: () => baseStore(),
  getTenantKVStore: (tenantId: string | null) => prefixed(tenantId),
}));

let mockTenantId: string | null = null;
vi.mock("@/core/request-context", async () => {
  const kvMod = await import("@/core/kv-store");
  return {
    getCurrentTenantId: () => mockTenantId,
    getContextKVStore: () => kvMod.getTenantKVStore(mockTenantId),
  };
});

vi.mock("@/core/events", () => ({
  emit: vi.fn(),
  on: vi.fn(() => vi.fn()),
}));

import {
  isToolDisabled,
  setToolDisabled,
  getDisabledTools,
  __resetDisabledToolsCacheForTests,
} from "@/core/tool-toggles";
import { emit } from "@/core/events";

describe("tool-toggles (null tenant — back-compat)", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockKV)) delete mockKV[key];
    mockTenantId = null;
    __resetDisabledToolsCacheForTests();
    vi.clearAllMocks();
  });

  it("reports a tool as enabled by default", async () => {
    expect(await isToolDisabled("gmail_search")).toBe(false);
  });

  it("disables a tool and reports it as disabled", async () => {
    await setToolDisabled("gmail_search", true);
    expect(await isToolDisabled("gmail_search")).toBe(true);
    expect(mockKV["tool:disabled:gmail_search"]).toBe("true");
    expect(emit).toHaveBeenCalledWith("env.changed");
  });

  it("re-enables a tool by deleting the key", async () => {
    mockKV["tool:disabled:gmail_search"] = "true";
    await setToolDisabled("gmail_search", false);
    expect(await isToolDisabled("gmail_search")).toBe(false);
    expect(mockKV["tool:disabled:gmail_search"]).toBeUndefined();
  });

  it("getDisabledTools returns all disabled tool names", async () => {
    mockKV["tool:disabled:gmail_search"] = "true";
    mockKV["tool:disabled:vault_read"] = "true";
    mockKV["other:key"] = "value";

    const disabled = await getDisabledTools();
    expect(disabled).toEqual(new Set(["gmail_search", "vault_read"]));
  });

  it("getDisabledTools returns empty set when nothing is disabled", async () => {
    const disabled = await getDisabledTools();
    expect(disabled.size).toBe(0);
  });
});

describe("tool-toggles — Phase 42 tenant scoping (TEN-03)", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockKV)) delete mockKV[key];
    mockTenantId = null;
    __resetDisabledToolsCacheForTests();
    vi.clearAllMocks();
  });

  it("isolates per-tenant toggles — set under alpha, unset under beta", async () => {
    mockTenantId = "alpha";
    await setToolDisabled("slack_send", true);
    expect(await isToolDisabled("slack_send")).toBe(true);
    // Key lives under alpha's namespace:
    expect(mockKV["tenant:alpha:tool:disabled:slack_send"]).toBe("true");

    mockTenantId = "beta";
    // Beta sees the tool as enabled — their namespace is empty.
    expect(await isToolDisabled("slack_send")).toBe(false);
  });

  it("dual-read carries legacy un-wrapped flags under null tenant", async () => {
    // Seed a pre-v0.11 flag at the bare key.
    mockKV["tool:disabled:legacy_tool"] = "true";

    mockTenantId = null;
    expect(await isToolDisabled("legacy_tool")).toBe(true);
  });

  it("cache is keyed per-tenant — alpha miss doesn't serve beta stale data", async () => {
    // Alpha disables tool; beta should NOT see it in their cache.
    mockTenantId = "alpha";
    await setToolDisabled("shared_tool", true);
    const alphaDisabled = await getDisabledTools();
    expect(alphaDisabled.has("shared_tool")).toBe(true);

    mockTenantId = "beta";
    const betaDisabled = await getDisabledTools();
    expect(betaDisabled.has("shared_tool")).toBe(false);
  });

  it("setToolDisabled under alpha does not write to beta's namespace", async () => {
    mockTenantId = "alpha";
    await setToolDisabled("private_tool", true);

    expect(mockKV["tenant:alpha:tool:disabled:private_tool"]).toBe("true");
    expect(mockKV["tenant:beta:tool:disabled:private_tool"]).toBeUndefined();
    expect(mockKV["tool:disabled:private_tool"]).toBeUndefined();
  });

  it("getDisabledTools under named tenant only returns that tenant's disables", async () => {
    mockKV["tenant:alpha:tool:disabled:a1"] = "true";
    mockKV["tenant:alpha:tool:disabled:a2"] = "true";
    mockKV["tenant:beta:tool:disabled:b1"] = "true";

    mockTenantId = "alpha";
    const alphaDisabled = await getDisabledTools();
    expect(alphaDisabled).toEqual(new Set(["a1", "a2"]));

    mockTenantId = "beta";
    __resetDisabledToolsCacheForTests();
    const betaDisabled = await getDisabledTools();
    expect(betaDisabled).toEqual(new Set(["b1"]));
  });
});

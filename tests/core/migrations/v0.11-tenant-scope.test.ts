/**
 * Tests for the v0.11 tenant-scope dual-read shim.
 *
 * The shim provides:
 * - `dualReadKV(kv, newKey, legacyKey)` — read-through helper that
 *   prefers the new (tenant-wrapped) key and falls back to the legacy
 *   global key during the 2-release transition window. Pure helper —
 *   no writes, no side effects.
 * - `runV011TenantScopeMigration()` — idempotent, per-tenant marker
 *   that logs legacy key counts once on first boot and short-circuits
 *   thereafter.
 *
 * Precedent: `src/core/migrations/v0.10-tenant-prefix.ts` (same
 * inventory-only philosophy, fire-and-forget on boot).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { KVStore } from "@/core/kv-store";

// Mutable reference for the mocked KV. Reset in beforeEach for the
// `runV011TenantScopeMigration` suite. `dualReadKV` tests construct
// their own per-test MemoryKV and don't depend on the mock.
const mockKV: Record<string, string> = {};
let mockBehaviour: "normal" | "broken" = "normal";

function makeMemoryKV(): KVStore & { _map: Map<string, string> } {
  const map = new Map<string, string>();
  const kv: KVStore & { _map: Map<string, string> } = {
    _map: map,
    kind: "filesystem" as const,
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
    delete: async (key) => {
      map.delete(key);
    },
    list: async (prefix) => {
      const all = [...map.keys()];
      return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
    },
    scan: async (cursor, opts) => {
      const match = opts?.match ?? "*";
      const prefix = match.endsWith("*") ? match.slice(0, -1) : match;
      const all = [...map.keys()].filter((k) =>
        match.endsWith("*") ? k.startsWith(prefix) : k === match
      );
      const offset = cursor === "0" ? 0 : parseInt(cursor, 10) || 0;
      const count = opts?.count ?? 100;
      const slice = all.slice(offset, offset + count);
      const nextOffset = offset + count;
      const nextCursor = nextOffset >= all.length ? "0" : String(nextOffset);
      return { cursor: nextCursor, keys: slice };
    },
  };
  return kv;
}

vi.mock("@/core/kv-store", async () => {
  const actual = await vi.importActual<typeof import("@/core/kv-store")>("@/core/kv-store");
  return {
    ...actual,
    getKVStore: () => {
      if (mockBehaviour === "broken") {
        return {
          kind: "filesystem" as const,
          get: async () => {
            throw new Error("boom");
          },
          set: async () => {
            throw new Error("boom");
          },
          delete: async () => undefined,
          list: async () => {
            throw new Error("boom");
          },
        };
      }
      return {
        kind: "filesystem" as const,
        get: async (key: string) => mockKV[key] ?? null,
        set: async (key: string, value: string) => {
          mockKV[key] = value;
        },
        delete: async (key: string) => {
          delete mockKV[key];
        },
        list: async (prefix?: string) => {
          const all = Object.keys(mockKV);
          return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
        },
        scan: async (cursor: string, opts?: { match?: string; count?: number }) => {
          const match = opts?.match ?? "*";
          const prefix = match.endsWith("*") ? match.slice(0, -1) : match;
          const all = Object.keys(mockKV).filter((k) =>
            match.endsWith("*") ? k.startsWith(prefix) : k === match
          );
          const offset = cursor === "0" ? 0 : parseInt(cursor, 10) || 0;
          const count = opts?.count ?? 100;
          const slice = all.slice(offset, offset + count);
          const nextOffset = offset + count;
          const nextCursor = nextOffset >= all.length ? "0" : String(nextOffset);
          return { cursor: nextCursor, keys: slice };
        },
      };
    },
  };
});

import {
  dualReadKV,
  runV011TenantScopeMigration,
  __resetV011MigrationForTests,
  LEGACY_KEY_PREFIXES,
} from "@/core/migrations/v0.11-tenant-scope";
import { requestContext } from "@/core/request-context";

describe("v0.11 tenant-scope shim — dualReadKV", () => {
  it("returns the new-key value when present (no legacy read)", async () => {
    const kv = makeMemoryKV();
    kv._map.set("tenant:alpha:ratelimit:mcp:abc:1", "42");
    kv._map.set("ratelimit:alpha:mcp:abc:1", "99"); // legacy — should be IGNORED

    const result = await dualReadKV(
      kv,
      "tenant:alpha:ratelimit:mcp:abc:1",
      "ratelimit:alpha:mcp:abc:1"
    );
    expect(result).toBe("42");
  });

  it("falls back to legacy when new is null", async () => {
    const kv = makeMemoryKV();
    kv._map.set("ratelimit:alpha:mcp:abc:1", "40");

    const result = await dualReadKV(
      kv,
      "tenant:alpha:ratelimit:mcp:abc:1",
      "ratelimit:alpha:mcp:abc:1"
    );
    expect(result).toBe("40");
  });

  it("returns null when both new and legacy are missing", async () => {
    const kv = makeMemoryKV();

    const result = await dualReadKV(kv, "tenant:alpha:missing", "legacy:missing");
    expect(result).toBeNull();
  });

  it("does not write through to the new key when falling back to legacy (pure helper)", async () => {
    const kv = makeMemoryKV();
    kv._map.set("legacyKey", "v");

    await dualReadKV(kv, "newKey", "legacyKey");

    // newKey should remain absent — dualReadKV is a read-only helper.
    expect(kv._map.has("newKey")).toBe(false);
  });
});

describe("v0.11 tenant-scope shim — runV011TenantScopeMigration", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockKV)) delete mockKV[key];
    mockBehaviour = "normal";
    __resetV011MigrationForTests();
  });

  it("is idempotent: second call within same process is a no-op", async () => {
    // First run: writes the marker.
    await runV011TenantScopeMigration();
    const firstMarker = mockKV["migrations:v0.11-tenant-scope"];
    expect(firstMarker).toBeTruthy();

    // Second run (inside same process, same tenant): short-circuits via
    // in-process flag.
    await runV011TenantScopeMigration();
    const secondMarker = mockKV["migrations:v0.11-tenant-scope"];
    expect(secondMarker).toBe(firstMarker);
  });

  it("writes a per-tenant marker under requestContext.run", async () => {
    await requestContext.run({ tenantId: "alpha" }, async () => {
      await runV011TenantScopeMigration();
    });

    // Per-tenant marker present; null-tenant marker absent.
    expect(mockKV["tenant:alpha:migrations:v0.11-tenant-scope"]).toBeTruthy();
    expect(mockKV["migrations:v0.11-tenant-scope"]).toBeUndefined();
  });

  it("runs per-tenant — alpha migration does not mark beta as migrated", async () => {
    await requestContext.run({ tenantId: "alpha" }, async () => {
      await runV011TenantScopeMigration();
    });

    await requestContext.run({ tenantId: "beta" }, async () => {
      await runV011TenantScopeMigration();
    });

    expect(mockKV["tenant:alpha:migrations:v0.11-tenant-scope"]).toBeTruthy();
    expect(mockKV["tenant:beta:migrations:v0.11-tenant-scope"]).toBeTruthy();
  });

  it("short-circuits via KV marker across process restarts (marker present in KV)", async () => {
    // Simulate a prior process having already written the marker.
    mockKV["migrations:v0.11-tenant-scope"] = JSON.stringify({
      status: "completed",
      at: "2026-04-21T00:00:00Z",
    });
    const before = mockKV["migrations:v0.11-tenant-scope"];

    // Fresh process (flag reset). Migration should read the existing
    // marker and return without rewriting.
    await runV011TenantScopeMigration();

    expect(mockKV["migrations:v0.11-tenant-scope"]).toBe(before);
  });

  it("never throws on KV failure — logs and returns silently", async () => {
    mockBehaviour = "broken";

    await expect(runV011TenantScopeMigration()).resolves.toBeUndefined();
  });
});

describe("v0.11 tenant-scope shim — exports", () => {
  it("exports LEGACY_KEY_PREFIXES with the 4 prefixes the shim dual-reads", () => {
    expect(Array.isArray(LEGACY_KEY_PREFIXES)).toBe(true);
    expect(LEGACY_KEY_PREFIXES).toContain("ratelimit:");
    expect(LEGACY_KEY_PREFIXES).toContain("tool:disabled:");
    expect(LEGACY_KEY_PREFIXES).toContain("mymcp:context:");
    // mymcp:logs is a single key not a prefix, but we include it in the
    // list for inventory-counting symmetry with the other 3 prefixes.
    expect(LEGACY_KEY_PREFIXES).toContain("mymcp:logs");
  });
});

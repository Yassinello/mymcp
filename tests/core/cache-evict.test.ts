/**
 * Tests for the mcp_cache_evict admin tool.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/core/registry", () => ({
  __resetRegistryCacheForTests: vi.fn(),
}));
vi.mock("@/core/events", () => ({
  emit: vi.fn(),
}));
vi.mock("@/core/kv-store", () => ({
  clearKVReadCache: vi.fn(),
}));
vi.mock("@/core/log-store", () => ({
  clearLogStoreBuffer: vi.fn(),
}));

import { handleCacheEvict } from "@/connectors/admin/tools/cache-evict";
import { __resetRegistryCacheForTests } from "@/core/registry";
import { emit } from "@/core/events";
import { clearKVReadCache } from "@/core/kv-store";
import { clearLogStoreBuffer } from "@/core/log-store";

describe("handleCacheEvict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears all caches by default", async () => {
    const result = await handleCacheEvict({});
    expect(__resetRegistryCacheForTests).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("env.changed");
    expect(clearKVReadCache).toHaveBeenCalled();
    expect(clearLogStoreBuffer).toHaveBeenCalled();
    expect(result.content[0].text).toContain("registry");
    expect(result.content[0].text).toContain("kv read cache");
    expect(result.content[0].text).toContain("log store buffer");
  });

  it("clears only registry when scoped", async () => {
    const result = await handleCacheEvict({ scope: "registry" });
    expect(__resetRegistryCacheForTests).toHaveBeenCalled();
    expect(clearKVReadCache).not.toHaveBeenCalled();
    expect(clearLogStoreBuffer).not.toHaveBeenCalled();
    expect(result.content[0].text).toBe("Cache cleared: registry.");
  });

  it("clears only KV when scoped", async () => {
    const result = await handleCacheEvict({ scope: "kv" });
    expect(__resetRegistryCacheForTests).not.toHaveBeenCalled();
    expect(clearKVReadCache).toHaveBeenCalled();
    expect(clearLogStoreBuffer).not.toHaveBeenCalled();
    expect(result.content[0].text).toBe("Cache cleared: kv read cache.");
  });

  it("clears only logs when scoped", async () => {
    const result = await handleCacheEvict({ scope: "logs" });
    expect(__resetRegistryCacheForTests).not.toHaveBeenCalled();
    expect(clearKVReadCache).not.toHaveBeenCalled();
    expect(clearLogStoreBuffer).toHaveBeenCalled();
    expect(result.content[0].text).toBe("Cache cleared: log store buffer.");
  });
});

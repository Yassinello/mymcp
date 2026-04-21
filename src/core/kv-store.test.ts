/**
 * Tests for KVStore scan, mget, and kvScanAll.
 *
 * Uses FilesystemKV via MYMCP_KV_PATH pointed at a temp file.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getKVStore, resetKVStoreCache, kvScanAll } from "./kv-store";

let tmpDir: string;
let kvPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kv-test-"));
  kvPath = path.join(tmpDir, "kv.json");
  process.env.MYMCP_KV_PATH = kvPath;
  resetKVStoreCache();
});

afterEach(async () => {
  delete process.env.MYMCP_KV_PATH;
  resetKVStoreCache();
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("FilesystemKV.scan", () => {
  it("returns all keys when no match pattern is given", async () => {
    const kv = getKVStore();
    await kv.set("a", "1");
    await kv.set("b", "2");
    await kv.set("c", "3");

    const result = await kv.scan!("0");
    expect(result.keys.sort()).toEqual(["a", "b", "c"]);
    // All keys fit in one page — cursor should be "0" (done)
    expect(result.cursor).toBe("0");
  });

  it("filters keys by match glob (trailing *)", async () => {
    const kv = getKVStore();
    await kv.set("ratelimit:a:1", "x");
    await kv.set("ratelimit:b:2", "y");
    await kv.set("health:sample:1", "z");

    const result = await kv.scan!("0", { match: "ratelimit:*" });
    expect(result.keys.sort()).toEqual(["ratelimit:a:1", "ratelimit:b:2"]);
    expect(result.cursor).toBe("0");
  });

  it("paginates with cursor when count is small", async () => {
    const kv = getKVStore();
    for (let i = 0; i < 5; i++) {
      await kv.set(`key:${i}`, String(i));
    }

    // First page: count=2
    const page1 = await kv.scan!("0", { match: "key:*", count: 2 });
    expect(page1.keys).toHaveLength(2);
    expect(page1.cursor).not.toBe("0");

    // Second page
    const page2 = await kv.scan!(page1.cursor, { match: "key:*", count: 2 });
    expect(page2.keys).toHaveLength(2);
    expect(page2.cursor).not.toBe("0");

    // Third page — last key
    const page3 = await kv.scan!(page2.cursor, { match: "key:*", count: 2 });
    expect(page3.keys).toHaveLength(1);
    expect(page3.cursor).toBe("0");

    // All keys collected
    const allKeys = [...page1.keys, ...page2.keys, ...page3.keys].sort();
    expect(allKeys).toEqual(["key:0", "key:1", "key:2", "key:3", "key:4"]);
  });

  it("returns empty when no keys match", async () => {
    const kv = getKVStore();
    await kv.set("a", "1");

    const result = await kv.scan!("0", { match: "zzz:*" });
    expect(result.keys).toEqual([]);
    expect(result.cursor).toBe("0");
  });
});

describe("FilesystemKV.mget", () => {
  it("returns values for existing keys and null for missing", async () => {
    const kv = getKVStore();
    await kv.set("a", "1");
    await kv.set("b", "2");

    const result = await kv.mget!(["a", "b", "c"]);
    expect(result).toEqual(["1", "2", null]);
  });

  it("returns empty array for empty input", async () => {
    const kv = getKVStore();
    const result = await kv.mget!([]);
    expect(result).toEqual([]);
  });
});

describe("kvScanAll", () => {
  it("collects all matching keys across paginated scans", async () => {
    const kv = getKVStore();
    for (let i = 0; i < 10; i++) {
      await kv.set(`prefix:${i}`, String(i));
    }
    await kv.set("other:x", "y");

    const keys = await kvScanAll(kv, "prefix:*");
    expect(keys).toHaveLength(10);
    expect(keys.every((k) => k.startsWith("prefix:"))).toBe(true);
  });

  it("returns all keys when match is *", async () => {
    const kv = getKVStore();
    await kv.set("a", "1");
    await kv.set("b", "2");

    const keys = await kvScanAll(kv, "*");
    expect(keys.sort()).toEqual(["a", "b"]);
  });

  it("falls back to kv.list when scan is not available", async () => {
    const kv = getKVStore();
    await kv.set("x:1", "a");
    await kv.set("x:2", "b");
    await kv.set("y:1", "c");

    // Create a wrapper without scan
    const noScanKv = {
      ...kv,
      scan: undefined,
      // Bind list to original kv
      list: kv.list.bind(kv),
      get: kv.get.bind(kv),
      set: kv.set.bind(kv),
      delete: kv.delete.bind(kv),
    };

    const keys = await kvScanAll(noScanKv, "x:*");
    expect(keys.sort()).toEqual(["x:1", "x:2"]);
  });
});

describe("kvScanAll cycle guard", () => {
  it("throws after MAX_SCAN_ITERATIONS", async () => {
    // Create a mock KV store whose scan never returns cursor "0"
    let callCount = 0;
    const infiniteScanKv = {
      kind: "filesystem" as const,
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      list: async () => [],
      scan: async (_cursor: string, _opts?: { match?: string; count?: number }) => {
        callCount++;
        return { cursor: String(callCount), keys: [`key-${callCount}`] };
      },
    };

    await expect(kvScanAll(infiniteScanKv, "*")).rejects.toThrow("exceeded");
  });
});

describe("backup.ts uses mget and kvScanAll", () => {
  it("exportBackup reads all keys via mget (Phase 42 v2 signature)", async () => {
    const kv = getKVStore();
    await kv.set("key1", "val1");
    await kv.set("key2", "val2");

    // Phase 42 / TEN-04: exportBackup now accepts an options object.
    // Pass the store explicitly to preserve the pre-v0.11 behaviour
    // of scanning the supplied KV as-is.
    const { exportBackup, BACKUP_VERSION } = await import("./backup");
    const backup = await exportBackup({ kv });
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.entries).toEqual({ key1: "val1", key2: "val2" });
  });
});

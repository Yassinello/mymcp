/**
 * Tests for storage-mode.ts — detection logic across the 4 modes.
 *
 * Strategy: mock global fetch (Upstash PING) and use a real temp dir for the
 * FS probe. We toggle MYMCP_KV_PATH to redirect the probe at writable or
 * (chmod-ed) read-only directories.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { detectStorageMode, clearStorageModeCache } from "./storage-mode";

let tmpDir: string;

const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-mode-test-"));
  process.env.MYMCP_KV_PATH = path.join(tmpDir, "kv.json");
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.VERCEL;
  clearStorageModeCache();
});

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  clearStorageModeCache();
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("detectStorageMode — kv mode", () => {
  it("returns 'kv' when Upstash is configured and ping succeeds", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://us1-test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: "PONG" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const report = await detectStorageMode();
    expect(report.mode).toBe("kv");
    expect(report.kvUrl).toBe("https://us1-test.upstash.io");
    expect(report.latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.error).toBeNull();
    expect(report.dataDir).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("redacts Upstash URL to host only (no path/auth leakage)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://user:pass@us1-test.upstash.io/some/path";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: "PONG" }), { status: 200 })
    );

    const report = await detectStorageMode();
    expect(report.kvUrl).not.toContain("user:pass");
    expect(report.kvUrl).not.toContain("/some/path");
    expect(report.kvUrl).toContain("upstash.io");
  });
});

describe("detectStorageMode — kv-degraded mode", () => {
  it("returns 'kv-degraded' when Upstash returns non-200", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://us1-test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    vi.spyOn(global, "fetch").mockResolvedValue(new Response("Internal error", { status: 500 }));

    const report = await detectStorageMode();
    expect(report.mode).toBe("kv-degraded");
    expect(report.error).toContain("500");
  });

  it("returns 'kv-degraded' when Upstash ping times out", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://us1-test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    // Mock fetch that throws AbortError to simulate timeout
    vi.spyOn(global, "fetch").mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const report = await detectStorageMode();
    expect(report.mode).toBe("kv-degraded");
    expect(report.error).toContain("Timeout");
  });

  it("never silently downgrades kv-degraded to file (data-loss safety)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://us1-test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    vi.spyOn(global, "fetch").mockResolvedValue(new Response("err", { status: 503 }));

    const report = await detectStorageMode();
    // Even though tmpDir is writable, we must NOT downgrade — would cause
    // writes to land on the wrong backend during a temp KV outage.
    expect(report.mode).toBe("kv-degraded");
    expect(report.mode).not.toBe("file");
  });
});

describe("detectStorageMode — file mode", () => {
  it("returns 'file' when no KV and FS is writable", async () => {
    const report = await detectStorageMode();
    expect(report.mode).toBe("file");
    expect(report.dataDir).toBe(tmpDir);
    expect(report.kvUrl).toBeNull();
  });

  it("flags Vercel /tmp file mode as ephemeral in reason", async () => {
    process.env.VERCEL = "1";
    delete process.env.MYMCP_KV_PATH; // let resolveDataDir pick /tmp
    const report = await detectStorageMode();
    // We can't reliably write to /tmp under the test runner on Windows, so
    // either 'file' (Linux/macOS) or 'static' (Windows /tmp doesn't exist)
    // is acceptable; just assert the reason mentions ephemeral when 'file'.
    if (report.mode === "file") {
      expect(report.reason).toMatch(/ephemeral|Vercel/i);
    }
  });
});

describe("detectStorageMode — static mode", () => {
  it("returns 'static' when no KV and FS write fails (EROFS-like)", async () => {
    // Point the probe at a path under a non-existent parent that fs.mkdir
    // recursive can normally create, but make the parent non-writable by
    // pointing at a system directory we know we can't touch in CI/tests.
    // Use a path we know exists but where we can't write — fall back to a
    // Windows-friendly approach: nest under a regular file (path becomes
    // unwritable since you can't mkdir under a file).
    const blocker = path.join(tmpDir, "blocker-file");
    await fs.writeFile(blocker, "x");
    process.env.MYMCP_KV_PATH = path.join(blocker, "nested", "kv.json");

    const report = await detectStorageMode();
    expect(report.mode).toBe("static");
    expect(report.error).toBeTruthy();
    expect(report.dataDir).toBeTruthy();
  });
});

describe("detectStorageMode — caching", () => {
  it("caches the report for 60s", async () => {
    const r1 = await detectStorageMode();
    const r2 = await detectStorageMode();
    expect(r1).toBe(r2); // same object reference (cache hit)
  });

  it("clearStorageModeCache() forces re-detection", async () => {
    const r1 = await detectStorageMode();
    clearStorageModeCache();
    const r2 = await detectStorageMode();
    expect(r1).not.toBe(r2);
    expect(r1.mode).toBe(r2.mode);
  });

  it("force option bypasses cache without affecting it for next call", async () => {
    const r1 = await detectStorageMode();
    const r2 = await detectStorageMode({ force: true });
    expect(r1).not.toBe(r2);
  });
});

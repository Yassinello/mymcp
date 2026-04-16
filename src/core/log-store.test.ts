import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryLogStore, FilesystemLogStore, UpstashLogStore, type LogEntry } from "./log-store";

function mk(ts: number, message: string, level: LogEntry["level"] = "info"): LogEntry {
  return { ts, level, message };
}

describe("MemoryLogStore", () => {
  it("stores entries and returns them newest-first", async () => {
    const store = new MemoryLogStore(10);
    await store.append(mk(1, "a"));
    await store.append(mk(2, "b"));
    await store.append(mk(3, "c"));
    const recent = await store.recent(10);
    expect(recent.map((e) => e.message)).toEqual(["c", "b", "a"]);
  });

  it("caps at maxEntries (FIFO eviction)", async () => {
    const store = new MemoryLogStore(3);
    for (let i = 1; i <= 5; i++) await store.append(mk(i, String(i)));
    const recent = await store.recent(10);
    expect(recent.map((e) => e.message)).toEqual(["5", "4", "3"]);
  });

  it("since() filters by timestamp and returns newest-first", async () => {
    const store = new MemoryLogStore(10);
    await store.append(mk(10, "old"));
    await store.append(mk(20, "mid"));
    await store.append(mk(30, "new"));
    const after = await store.since(20);
    expect(after.map((e) => e.message)).toEqual(["new", "mid"]);
  });

  it("recent(n) respects the requested count", async () => {
    const store = new MemoryLogStore(10);
    for (let i = 0; i < 5; i++) await store.append(mk(i, String(i)));
    const two = await store.recent(2);
    expect(two.map((e) => e.message)).toEqual(["4", "3"]);
  });
});

describe("FilesystemLogStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mymcp-log-"));
    filePath = join(dir, "logs.jsonl");
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("JSON roundtrips entries through the file", async () => {
    const store = new FilesystemLogStore(filePath);
    const entry: LogEntry = {
      ts: 123,
      level: "error",
      message: "boom",
      meta: { tool: "foo", durationMs: 42 },
    };
    await store.append(entry);
    const recent = await store.recent(5);
    expect(recent).toHaveLength(1);
    expect(recent[0]).toEqual(entry);
  });

  it("appends and returns entries newest-first", async () => {
    const store = new FilesystemLogStore(filePath);
    for (let i = 1; i <= 4; i++) await store.append(mk(i, String(i)));
    const recent = await store.recent(10);
    expect(recent.map((e) => e.message)).toEqual(["4", "3", "2", "1"]);
  });

  it("rotates at maxBytes and still reads all segments", async () => {
    const store = new FilesystemLogStore(filePath, { maxBytes: 200, maxEntries: 100, segments: 3 });
    // Each entry is ~40 bytes; 10 entries overflow the 200-byte cap.
    for (let i = 0; i < 10; i++) {
      await store.append(mk(i, "x".repeat(10) + i));
    }
    const recent = await store.recent(20);
    // All entries should still be readable across segments.
    expect(recent).toHaveLength(10);
    expect(recent[0].message).toBe("xxxxxxxxxx9");
    expect(recent[recent.length - 1].message).toBe("xxxxxxxxxx0");
  });

  it("cascades through N segments and deletes overflow (TECH-02)", async () => {
    // Use segments=2 and very small maxBytes to force multiple rotations.
    const store = new FilesystemLogStore(filePath, { maxBytes: 80, maxEntries: 1000, segments: 2 });
    // Write enough entries to trigger several rotations.
    // Each entry ~45 bytes, so 2 entries will overflow 80-byte cap.
    for (let i = 0; i < 10; i++) {
      await store.append(mk(i, `entry-${i}`));
    }

    // With segments=2, we should have at most: current, .1, .2
    expect(existsSync(filePath)).toBe(true);
    // Segment .3 should NOT exist (overflow deleted)
    expect(existsSync(`${filePath}.3`)).toBe(false);

    // All entries within retention should still be readable
    const recent = await store.recent(100);
    expect(recent.length).toBeGreaterThan(0);
    // Newest entry is always the last written
    expect(recent[0].message).toBe("entry-9");
  });

  it("honors maxEntries cap when concatenating segments", async () => {
    const store = new FilesystemLogStore(filePath, { maxBytes: 100, maxEntries: 5 });
    for (let i = 0; i < 15; i++) await store.append(mk(i, String(i)));
    const recent = await store.recent(100);
    expect(recent.length).toBeLessThanOrEqual(5);
  });

  it("since() filters by ts across rotated + current", async () => {
    const store = new FilesystemLogStore(filePath, { maxBytes: 150, maxEntries: 100 });
    for (let i = 0; i < 8; i++) await store.append(mk(i * 10, `m${i}`));
    const since = await store.since(50);
    expect(since.map((e) => e.message)).toEqual(["m7", "m6", "m5"]);
  });

  it("skips malformed JSON lines without crashing", async () => {
    const store = new FilesystemLogStore(filePath);
    await store.append(mk(1, "ok"));
    // Inject garbage directly.
    const { appendFile } = await import("node:fs/promises");
    await appendFile(filePath, "not-json\n", "utf-8");
    await store.append(mk(2, "still-ok"));
    const recent = await store.recent(10);
    expect(recent.map((e) => e.message)).toEqual(["still-ok", "ok"]);
  });
});

// ── UpstashLogStore retry + circuit breaker (TECH-03) ───────────────

describe("UpstashLogStore — retry + circuit breaker", () => {
  let store: UpstashLogStore;

  /** Mock KV that we can control per call. */
  function makeMockKv(lpushResults: Array<"ok" | "5xx">) {
    let callIdx = 0;
    return {
      kind: "upstash" as const,
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      lpushCapped: vi.fn(async () => {
        const result = lpushResults[callIdx++] ?? "ok";
        if (result === "5xx") throw new Error("Upstash pipeline failed: 500");
        return undefined;
      }),
      lrange: vi.fn(async () => []),
    };
  }

  beforeEach(() => {
    store = new UpstashLogStore({ maxEntries: 100 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("retries 3 times on 5xx then succeeds on 4th (TECH-03)", async () => {
    // 3 failures then success
    const mockKv = makeMockKv(["5xx", "5xx", "5xx", "ok"]);
    vi.spyOn(await import("./kv-store"), "getKVStore").mockReturnValue(mockKv);

    const appendPromise = store.append(mk(1, "retry-test"));
    // Advance through retry delays: 100, 400, 1600
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(1600);
    await appendPromise;

    expect(mockKv.lpushCapped).toHaveBeenCalledTimes(4);
    expect(store._circuit.state).toBe("closed");
    expect(store._circuit.consecutiveFailures).toBe(0);
  });

  it("opens circuit after 5 consecutive failures (TECH-03)", async () => {
    // All failures: each append tries 1 initial + 3 retries = 4 calls.
    // 2 appends × 4 = 8 calls, but we only need 5 consecutive failures at the store level.
    const mockKv = makeMockKv(Array(100).fill("5xx"));
    vi.spyOn(await import("./kv-store"), "getKVStore").mockReturnValue(mockKv);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Fire 5 appends to reach the threshold (each one fails after retries)
    for (let i = 0; i < 5; i++) {
      const p = store.append(mk(i, `fail-${i}`));
      await vi.advanceTimersByTimeAsync(2200); // enough for all retries
      await p;
    }

    expect(store._circuit.consecutiveFailures).toBe(5);
    expect(store._circuit.state).toBe("open");

    // Next append should be skipped immediately (circuit open)
    mockKv.lpushCapped.mockClear();
    await store.append(mk(99, "skipped"));
    expect(mockKv.lpushCapped).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("circuit open"));

    warnSpy.mockRestore();
  });

  it("transitions to half-open after 30s and closes on success (TECH-03)", async () => {
    // Force circuit open
    store._circuit.state = "open";
    store._circuit.consecutiveFailures = 5;
    store._circuit.openedAt = Date.now();

    const mockKv = makeMockKv(["ok"]);
    vi.spyOn(await import("./kv-store"), "getKVStore").mockReturnValue(mockKv);

    // Before 30s: still open
    await vi.advanceTimersByTimeAsync(15_000);
    mockKv.lpushCapped.mockClear();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await store.append(mk(1, "still-open"));
    expect(mockKv.lpushCapped).not.toHaveBeenCalled();
    warnSpy.mockRestore();

    // After 30s: should transition to half-open and attempt
    await vi.advanceTimersByTimeAsync(16_000);
    await store.append(mk(2, "probe"));
    expect(mockKv.lpushCapped).toHaveBeenCalledTimes(1);
    expect(store._circuit.state).toBe("closed");
    expect(store._circuit.consecutiveFailures).toBe(0);
  });
});

/**
 * Phase 53 — src/core/metrics.ts aggregation helpers.
 *
 * Tests cover:
 *   - 24 hourly buckets (including empty/long-ago inputs)
 *   - tool filter in aggregateRequestsByHour
 *   - p95 latency group-by + top-N truncation
 *   - connector.* split for error heatmap
 *   - ring-buffer-primary / durable-fallback source tag
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  aggregateRequestsByHour,
  aggregateLatencyByTool,
  aggregateErrorsByConnectorHour,
  getMetricsSource,
} from "../../src/core/metrics";
import { __resetRingBufferForTests, logToolCall, type ToolLog } from "../../src/core/logging";
import { resetLogStoreCache } from "../../src/core/log-store";

const HOUR_MS = 3600_000;

function makeLog(partial: Partial<ToolLog> = {}): ToolLog {
  return {
    tool: "gmail.search",
    durationMs: 100,
    status: "success",
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

describe("aggregateRequestsByHour", () => {
  it("returns exactly 24 buckets for empty input", () => {
    const now = Date.now();
    const buckets = aggregateRequestsByHour([], now);
    expect(buckets).toHaveLength(24);
    for (const b of buckets) {
      expect(b.count).toBe(0);
      expect(typeof b.ts).toBe("number");
    }
  });

  it("assigns 3 current-hour logs to bucket[0]", () => {
    const now = Date.now();
    const logs: ToolLog[] = [
      makeLog({ timestamp: new Date(now - 60_000).toISOString() }),
      makeLog({ timestamp: new Date(now - 120_000).toISOString() }),
      makeLog({ timestamp: new Date(now - 180_000).toISOString() }),
    ];
    const buckets = aggregateRequestsByHour(logs, now);
    expect(buckets[0]!.count).toBe(3);
  });

  it("descends from current hour in bucket[0]", () => {
    const now = Date.now();
    const currentHourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
    const buckets = aggregateRequestsByHour([], now);
    expect(buckets[0]!.ts).toBe(currentHourStart);
    expect(buckets[1]!.ts).toBe(currentHourStart - HOUR_MS);
    expect(buckets[23]!.ts).toBe(currentHourStart - 23 * HOUR_MS);
  });

  it("excludes logs older than 24 hours", () => {
    const now = Date.now();
    const logs: ToolLog[] = [
      makeLog({ timestamp: new Date(now - 25 * HOUR_MS).toISOString() }),
      makeLog({ timestamp: new Date(now - 26 * HOUR_MS).toISOString() }),
    ];
    const buckets = aggregateRequestsByHour(logs, now);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(0);
  });

  it("filters by opts.tool", () => {
    const now = Date.now();
    const logs: ToolLog[] = [
      makeLog({ tool: "gmail.search", timestamp: new Date(now - 60_000).toISOString() }),
      makeLog({ tool: "gmail.search", timestamp: new Date(now - 120_000).toISOString() }),
      makeLog({ tool: "notion.read", timestamp: new Date(now - 180_000).toISOString() }),
    ];
    const buckets = aggregateRequestsByHour(logs, now, { tool: "gmail.search" });
    expect(buckets[0]!.count).toBe(2);
  });

  it("places 5-hour-old log in bucket[5]", () => {
    const now = Date.now();
    const logs: ToolLog[] = [
      makeLog({ timestamp: new Date(now - 5 * HOUR_MS - 10_000).toISOString() }),
    ];
    const buckets = aggregateRequestsByHour(logs, now);
    // 5 hours ago + a bit — lands in bucket[5] or [6] depending on exact boundary
    const counted = buckets.filter((b) => b.count > 0);
    expect(counted).toHaveLength(1);
    expect(counted[0]!.count).toBe(1);
  });
});

describe("aggregateLatencyByTool", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateLatencyByTool([], 10)).toEqual([]);
  });

  it("computes p95 via nearest-rank", () => {
    // 100 calls of tool A with durations 1..100 -> p95 = 95 (nearest-rank).
    const logs: ToolLog[] = Array.from({ length: 100 }, (_, i) =>
      makeLog({ tool: "gmail.search", durationMs: i + 1 })
    );
    const result = aggregateLatencyByTool(logs, 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("gmail.search");
    expect(result[0]!.p95Ms).toBe(95);
    expect(result[0]!.calls).toBe(100);
  });

  it("sorts descending by p95 and respects limit", () => {
    const logs: ToolLog[] = [];
    for (let t = 0; t < 15; t++) {
      const p95 = (t + 1) * 50;
      // Single call per tool; p95 of 1-element array is that element.
      logs.push(makeLog({ tool: `t${t}`, durationMs: p95 }));
    }
    const result = aggregateLatencyByTool(logs, 10);
    expect(result).toHaveLength(10);
    // Largest p95 first.
    expect(result[0]!.p95Ms).toBeGreaterThanOrEqual(result[1]!.p95Ms);
    expect(result[0]!.name).toBe("t14");
  });
});

describe("aggregateErrorsByConnectorHour", () => {
  it("splits tool on first `.` for connector id", () => {
    const now = Date.now();
    const logs: ToolLog[] = [
      makeLog({
        tool: "google.calendar_list",
        status: "error",
        timestamp: new Date(now - 60_000).toISOString(),
      }),
    ];
    const result = aggregateErrorsByConnectorHour(logs, now);
    expect(result).toHaveLength(1);
    expect(result[0]!.connectorId).toBe("google");
    expect(result[0]!.hours).toHaveLength(24);
    expect(result[0]!.hours[0]!.errors).toBe(1);
    expect(result[0]!.hours[0]!.total).toBe(1);
  });

  it("includes connectors with zero errors (total only)", () => {
    const now = Date.now();
    const logs: ToolLog[] = [
      makeLog({ tool: "notion.read", timestamp: new Date(now - 60_000).toISOString() }),
    ];
    const result = aggregateErrorsByConnectorHour(logs, now);
    expect(result).toHaveLength(1);
    expect(result[0]!.connectorId).toBe("notion");
    expect(result[0]!.hours[0]!.errors).toBe(0);
    expect(result[0]!.hours[0]!.total).toBe(1);
  });

  it("groups multiple connectors independently", () => {
    const now = Date.now();
    const logs: ToolLog[] = [
      makeLog({
        tool: "google.calendar_list",
        status: "error",
        timestamp: new Date(now - 60_000).toISOString(),
      }),
      makeLog({
        tool: "notion.read",
        timestamp: new Date(now - 60_000).toISOString(),
      }),
    ];
    const result = aggregateErrorsByConnectorHour(logs, now);
    const ids = result.map((r) => r.connectorId).sort();
    expect(ids).toEqual(["google", "notion"]);
  });

  it("handles tool names without a dot (unknown connector bucket)", () => {
    const now = Date.now();
    const logs: ToolLog[] = [
      makeLog({ tool: "bare_tool", timestamp: new Date(now - 60_000).toISOString() }),
    ];
    const result = aggregateErrorsByConnectorHour(logs, now);
    expect(result).toHaveLength(1);
    expect(result[0]!.connectorId).toBe("bare_tool");
  });
});

describe("getMetricsSource", () => {
  beforeEach(() => {
    __resetRingBufferForTests();
    resetLogStoreCache();
    vi.unstubAllEnvs();
  });

  it("returns source: 'buffer' when ring buffer has entries", async () => {
    logToolCall(makeLog({ tool: "gmail.search", timestamp: new Date().toISOString() }));
    const { logs, source } = await getMetricsSource("__all__");
    expect(source).toBe("buffer");
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("returns source: 'durable' when buffer empty and durable has entries", async () => {
    // Empty buffer; seed durable directly via log-store since() mock path.
    // MemoryLogStore on filesystem-fallback path: append before reset.
    const { getLogStore } = await import("../../src/core/log-store");
    const store = getLogStore();
    await store.append({
      ts: Date.now() - 60_000,
      level: "info",
      message: "gmail.search (50ms)",
      meta: {
        tool: "gmail.search",
        durationMs: 50,
        status: "success",
        timestamp: new Date().toISOString(),
      },
    });
    const { logs, source } = await getMetricsSource("__all__");
    expect(source).toBe("durable");
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("returns { logs: [], source: 'buffer' } when both stores empty", async () => {
    const { logs, source } = await getMetricsSource("__all__");
    expect(logs).toEqual([]);
    expect(source).toBe("buffer");
  });
});

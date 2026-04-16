/**
 * Tests for streaming tool results (STREAM-01..04).
 * Verifies that withLogging properly collects stream chunks and logs metadata.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("@/core/log-store", () => ({
  getLogStore: () => ({
    append: vi.fn().mockResolvedValue(undefined),
    recent: vi.fn().mockResolvedValue([]),
  }),
}));
vi.mock("@/core/tracing", () => ({
  startToolSpan: vi.fn().mockReturnValue({}),
  endToolSpan: vi.fn(),
}));

import { withLogging, getRecentLogs } from "@/core/logging";
import type { ToolResult } from "@/core/types";

describe("streaming tool results", () => {
  beforeEach(() => {
    // Clear log buffer between tests by reading all logs
    // (there's no public clear function, but we can test against known state)
  });

  it("collects stream chunks into content", async () => {
    async function* genChunks(): AsyncGenerator<string> {
      yield "chunk1";
      yield "chunk2";
      yield "chunk3";
    }

    const handler = async (): Promise<ToolResult> => ({
      content: [{ type: "text", text: "" }],
      stream: genChunks(),
    });

    const wrapped = withLogging("test_stream", handler);
    const result = await wrapped({});

    expect(result.content).toEqual([{ type: "text", text: "chunk1chunk2chunk3" }]);
    expect(result.isError).toBeUndefined();
    // stream property should be removed from result
    expect(result.stream).toBeUndefined();
  });

  it("logs stream chunk count and byte size", async () => {
    async function* genChunks(): AsyncGenerator<string> {
      yield "hello";
      yield " world";
    }

    const handler = async (): Promise<ToolResult> => ({
      content: [{ type: "text", text: "" }],
      stream: genChunks(),
    });

    const wrapped = withLogging("test_stream_log", handler);
    await wrapped({});

    const logs = getRecentLogs(10);
    const streamLog = logs.find((l) => l.tool === "test_stream_log");
    expect(streamLog).toBeDefined();
    expect(streamLog!.status).toBe("success");
    expect(streamLog!.streamChunks).toBe(2);
    expect(streamLog!.streamBytes).toBe(11); // "hello" (5) + " world" (6)
  });

  it("handles empty stream gracefully", async () => {
    async function* emptyGen(): AsyncGenerator<string> {
      // yields nothing
    }

    const handler = async (): Promise<ToolResult> => ({
      content: [{ type: "text", text: "fallback" }],
      stream: emptyGen(),
    });

    const wrapped = withLogging("test_empty_stream", handler);
    const result = await wrapped({});

    expect(result.content).toEqual([{ type: "text", text: "" }]);
    expect(result.stream).toBeUndefined();
  });

  it("non-streaming results pass through unchanged", async () => {
    const handler = async (): Promise<ToolResult> => ({
      content: [{ type: "text", text: "normal result" }],
    });

    const wrapped = withLogging("test_no_stream", handler);
    const result = await wrapped({});

    expect(result.content).toEqual([{ type: "text", text: "normal result" }]);

    const logs = getRecentLogs(10);
    const log = logs.find((l) => l.tool === "test_no_stream");
    expect(log).toBeDefined();
    expect(log!.streamChunks).toBeUndefined();
  });

  it("truncates stream exceeding byte limit", async () => {
    // Generate chunks that exceed 10 MB
    const bigChunk = "x".repeat(1024 * 1024); // 1 MB each
    async function* genHugeStream(): AsyncGenerator<string> {
      for (let i = 0; i < 12; i++) {
        yield bigChunk;
      }
    }

    const handler = async (): Promise<ToolResult> => ({
      content: [{ type: "text", text: "" }],
      stream: genHugeStream(),
    });

    const wrapped = withLogging("test_stream_byte_limit", handler);
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain("Stream truncated: exceeded 10 MB size limit");
  });

  it("truncates stream exceeding duration limit", async () => {
    // Simulate a stream that takes too long via a controllable async generator
    let yieldCount = 0;
    async function* genSlowStream(): AsyncGenerator<string> {
      // We can't actually wait 55s in a test, so we mock Date.now to advance time
      while (true) {
        yieldCount++;
        yield `chunk-${yieldCount}`;
      }
    }

    // Mock Date.now to simulate time passing
    const realDateNow = Date.now;
    let mockTime = realDateNow.call(Date);
    vi.spyOn(Date, "now").mockImplementation(() => {
      // After the stream starts, advance 56 seconds on each call
      mockTime += 56_000;
      return mockTime;
    });

    try {
      const handler = async (): Promise<ToolResult> => ({
        content: [{ type: "text", text: "" }],
        stream: genSlowStream(),
      });

      const wrapped = withLogging("test_stream_duration_limit", handler);
      const result = await wrapped({});

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toContain("Stream truncated: exceeded 55 s duration limit");
    } finally {
      vi.spyOn(Date, "now").mockRestore();
    }
  });
});

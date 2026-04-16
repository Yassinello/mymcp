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
});

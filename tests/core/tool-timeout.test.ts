/**
 * T10 fold-in (Phase 38): MYMCP_TOOL_TIMEOUT enforcement at the transport.
 *
 * getToolTimeout() was defined but never called pre-v0.10. Now wired
 * into withLogging via Promise.race so a slow handler returns a
 * ToolTimeoutError with errorCode=TOOL_TIMEOUT instead of being killed
 * by Vercel's 60s lambda reaper.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { withLogging, ToolTimeoutError } from "@/core/logging";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("tool timeout enforcement (T10)", () => {
  const saved: string | undefined = process.env.MYMCP_TOOL_TIMEOUT;

  beforeEach(() => {
    delete process.env.MYMCP_TOOL_TIMEOUT;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.MYMCP_TOOL_TIMEOUT;
    else process.env.MYMCP_TOOL_TIMEOUT = saved;
  });

  it("a fast handler runs to completion", async () => {
    process.env.MYMCP_TOOL_TIMEOUT = "1000";
    const wrapped = withLogging("fast_tool", async () => {
      await sleep(50);
      return { content: [{ type: "text" as const, text: "ok" }] };
    });
    const result = await wrapped({});
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toMatchObject({ type: "text", text: "ok" });
  });

  it("a slow handler is aborted at the timeout boundary", async () => {
    process.env.MYMCP_TOOL_TIMEOUT = "150";
    const wrapped = withLogging("slow_tool", async () => {
      await sleep(1500);
      return { content: [{ type: "text" as const, text: "never" }] };
    });
    const started = Date.now();
    const result = await wrapped({});
    const elapsed = Date.now() - started;
    expect(result.isError).toBe(true);
    // Expect result body carries TOOL_TIMEOUT code
    expect((result as { errorCode?: string }).errorCode).toBe("TOOL_TIMEOUT");
    // Abort should land near the timeout — give the Node event loop a
    // generous margin but still clearly under the 1500ms handler.
    expect(elapsed).toBeLessThan(1000);
  });

  it("ToolTimeoutError has the required shape", () => {
    const e = new ToolTimeoutError("my_tool", 500);
    expect(e.errorCode).toBe("TOOL_TIMEOUT");
    expect(e.toolName).toBe("my_tool");
    expect(e.timeoutMs).toBe(500);
    expect(e.message).toContain("my_tool");
    expect(e.message).toContain("500ms");
  });

  it("a subsequent call after a timeout is not poisoned by leaked setTimeout", async () => {
    process.env.MYMCP_TOOL_TIMEOUT = "100";
    const slow = withLogging("slow_tool", async () => {
      await sleep(500);
      return { content: [{ type: "text" as const, text: "late" }] };
    });
    const fast = withLogging("fast_tool", async () => {
      await sleep(10);
      return { content: [{ type: "text" as const, text: "quick" }] };
    });
    const r1 = await slow({});
    expect(r1.isError).toBe(true);
    const r2 = await fast({});
    expect(r2.isError).toBeUndefined();
    expect(r2.content[0]).toMatchObject({ type: "text", text: "quick" });
  });
});

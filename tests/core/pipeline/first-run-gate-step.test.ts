/**
 * first-run-gate-step unit tests — PIPE-02.
 *
 * Matches the behavior of the inline gate that used to live in
 * `[transport]/route.ts:170` bit-for-bit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { firstRunGateStep } from "@/core/pipeline/first-run-gate-step";
import { __resetFirstRunForTests } from "@/core/first-run";
import type { PipelineContext } from "@/core/pipeline/types";

function makeCtx(): PipelineContext {
  return {
    request: new Request("https://test.local/api/mcp", { method: "POST" }),
    tenantId: null,
    tokenId: null,
    requestId: "req-1",
  };
}

describe("firstRunGateStep (PIPE-02)", () => {
  const OLD_TOKEN = process.env.MCP_AUTH_TOKEN;

  beforeEach(() => {
    __resetFirstRunForTests();
  });

  afterEach(() => {
    if (OLD_TOKEN === undefined) delete process.env.MCP_AUTH_TOKEN;
    else process.env.MCP_AUTH_TOKEN = OLD_TOKEN;
  });

  it("returns 503 JSON when in first-run mode (no MCP_AUTH_TOKEN, no bootstrap)", async () => {
    delete process.env.MCP_AUTH_TOKEN;
    const next = vi.fn(async () => new Response("never"));
    const res = await firstRunGateStep(makeCtx(), next);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not yet initialized/i);
    expect(body.error).toMatch(/\/welcome/);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("calls next() when an MCP_AUTH_TOKEN is configured (not first-run)", async () => {
    process.env.MCP_AUTH_TOKEN = "test-token-abc";
    const next = vi.fn(async () => new Response("ok", { status: 200 }));
    const res = await firstRunGateStep(makeCtx(), next);
    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

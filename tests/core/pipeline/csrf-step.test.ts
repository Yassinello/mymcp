/**
 * csrf-step unit tests — PIPE-02.
 *
 * Covers the contract of `checkCsrf` via the step wrapper:
 *  - GET/HEAD/OPTIONS → next()
 *  - POST without Origin → next() (non-browser caller)
 *  - POST with mismatched Origin → 403
 */
import { describe, it, expect, vi } from "vitest";
import { composeRequestPipeline } from "@/core/pipeline";
import { csrfStep } from "@/core/pipeline/csrf-step";

describe("csrfStep (PIPE-02)", () => {
  it("lets GET pass regardless of Origin", async () => {
    const next = vi.fn(async () => new Response("ok"));
    const pipeline = composeRequestPipeline([csrfStep], next);
    const res = await pipeline(new Request("https://test.local/api/x", { method: "GET" }));
    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalled();
  });

  it("POST without Origin header passes (curl/server-to-server)", async () => {
    const next = vi.fn(async () => new Response("ok"));
    const pipeline = composeRequestPipeline([csrfStep], next);
    const res = await pipeline(
      new Request("https://test.local/api/x", {
        method: "POST",
        headers: { host: "test.local" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("POST with mismatched Origin returns 403", async () => {
    const pipeline = composeRequestPipeline([csrfStep], async () => new Response("never"));
    const res = await pipeline(
      new Request("http://foo.local/api/x", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "foo.local" },
      })
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/CSRF/i);
  });

  it("POST with matching Origin passes", async () => {
    const pipeline = composeRequestPipeline([csrfStep], async () => new Response("ok"));
    const res = await pipeline(
      new Request("http://test.local/api/x", {
        method: "POST",
        headers: { origin: "http://test.local", host: "test.local" },
      })
    );
    expect(res.status).toBe(200);
  });
});

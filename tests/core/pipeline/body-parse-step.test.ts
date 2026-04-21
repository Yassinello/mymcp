/**
 * body-parse-step unit tests — PIPE-02.
 *
 * Covers:
 *  - JSON payload within limit → ctx.parsedBody = parsedObject
 *  - Content-Length > maxBytes → 413
 *  - Streamed body > maxBytes → 413 (reader.cancel)
 *  - Invalid JSON → ctx.parsedBody = rawString (webhook fallback)
 *  - Empty body → ctx.parsedBody = ""
 */
import { describe, it, expect } from "vitest";
import { composeRequestPipeline } from "@/core/pipeline";
import { bodyParseStep } from "@/core/pipeline/body-parse-step";

describe("bodyParseStep (PIPE-02)", () => {
  it("parses JSON body within limit into ctx.parsedBody", async () => {
    let seen: unknown;
    const step = bodyParseStep({ maxBytes: 1_048_576 });
    const pipeline = composeRequestPipeline([step], async (ctx) => {
      seen = ctx.parsedBody;
      return new Response("ok", { status: 200 });
    });

    const payload = { foo: 1, bar: "hello" };
    const res = await pipeline(
      new Request("https://test.local/api/x", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual(payload);
  });

  it("returns 413 when Content-Length exceeds maxBytes", async () => {
    const step = bodyParseStep({ maxBytes: 100 });
    const pipeline = composeRequestPipeline([step], async () => new Response("ok"));

    // Use a Uint8Array body so the Request pre-computes a Content-Length
    // header that we can trip.
    const bigBody = new Uint8Array(1000);
    const res = await pipeline(
      new Request("https://test.local/api/x", {
        method: "POST",
        body: bigBody,
      })
    );
    expect(res.status).toBe(413);
    const err = (await res.json()) as { error: string };
    expect(err.error).toBe("Payload too large");
  });

  it("returns 413 when streamed body exceeds maxBytes (even without Content-Length)", async () => {
    const step = bodyParseStep({ maxBytes: 10 });
    const pipeline = composeRequestPipeline([step], async () => new Response("ok"));

    // Streaming body without Content-Length — we need a ReadableStream
    // the Request wraps. Test that the step aborts on the oversize chunk.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("xxxxxxxxxxxx")); // >10 bytes
        controller.close();
      },
    });
    const res = await pipeline(
      new Request("https://test.local/api/x", {
        method: "POST",
        body: stream,
        // @ts-expect-error Node Request experimental: duplex must be 'half' when sending a stream
        duplex: "half",
      })
    );
    expect(res.status).toBe(413);
  });

  it("falls back to raw string on invalid JSON (webhook non-JSON payloads)", async () => {
    let seen: unknown;
    const step = bodyParseStep();
    const pipeline = composeRequestPipeline([step], async (ctx) => {
      seen = ctx.parsedBody;
      return new Response("ok");
    });
    await pipeline(
      new Request("https://test.local/api/x", {
        method: "POST",
        body: "not-json-content",
      })
    );
    expect(seen).toBe("not-json-content");
  });

  it("empty body sets ctx.parsedBody to empty string", async () => {
    let seen: unknown = "unset";
    const step = bodyParseStep();
    const pipeline = composeRequestPipeline([step], async (ctx) => {
      seen = ctx.parsedBody;
      return new Response("ok");
    });
    await pipeline(new Request("https://test.local/api/x", { method: "POST" }));
    expect(seen).toBe("");
  });
});

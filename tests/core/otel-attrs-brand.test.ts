/**
 * Phase 50 / BRAND-03 — OTel span attribute rename.
 *
 * Behavioral contract:
 *  - Default (no legacy flag): attributes use `kebab.*` prefix only.
 *  - Flag set (`MYMCP_EMIT_LEGACY_OTEL_ATTRS=1` OR
 *    `KEBAB_EMIT_LEGACY_OTEL_ATTRS=1`): BOTH `kebab.*` and `mymcp.*`
 *    attributes are emitted with the same value.
 *
 * Unit-level: exercises `brandSpanAttrs()` + `applyBrandSpanAttrs()`
 * helpers directly. Span-level integration covered by the existing
 * tracing tests that run under the noop-span mode.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { brandSpanAttrs, brandSpanName } from "@/core/tracing";

describe("Phase 50 / BRAND-03 — OTel attribute rebrand", () => {
  beforeEach(() => {
    delete process.env.KEBAB_EMIT_LEGACY_OTEL_ATTRS;
    delete process.env.MYMCP_EMIT_LEGACY_OTEL_ATTRS;
  });

  afterEach(() => {
    delete process.env.KEBAB_EMIT_LEGACY_OTEL_ATTRS;
    delete process.env.MYMCP_EMIT_LEGACY_OTEL_ATTRS;
  });

  it("default mode: emits kebab.* only, no mymcp.*", () => {
    const attrs = brandSpanAttrs({
      "tool.name": "gmail_search",
      "connector.id": "google",
      "request.id": "abc",
    });

    expect(attrs).toHaveProperty("kebab.tool.name", "gmail_search");
    expect(attrs).toHaveProperty("kebab.connector.id", "google");
    expect(attrs).toHaveProperty("kebab.request.id", "abc");
    expect(attrs).not.toHaveProperty("mymcp.tool.name");
    expect(attrs).not.toHaveProperty("mymcp.connector.id");
    expect(attrs).not.toHaveProperty("mymcp.request.id");
  });

  it("KEBAB_EMIT_LEGACY_OTEL_ATTRS=1 — emits BOTH kebab.* and mymcp.*", () => {
    process.env.KEBAB_EMIT_LEGACY_OTEL_ATTRS = "1";

    const attrs = brandSpanAttrs({
      "tool.name": "gmail_search",
      "kv.op": "set",
    });

    expect(attrs).toHaveProperty("kebab.tool.name", "gmail_search");
    expect(attrs).toHaveProperty("mymcp.tool.name", "gmail_search");
    expect(attrs).toHaveProperty("kebab.kv.op", "set");
    expect(attrs).toHaveProperty("mymcp.kv.op", "set");
  });

  it("MYMCP_EMIT_LEGACY_OTEL_ATTRS=1 — ALSO enables legacy emission (alias resolution)", () => {
    process.env.MYMCP_EMIT_LEGACY_OTEL_ATTRS = "1";

    const attrs = brandSpanAttrs({
      status: "ok",
    });

    expect(attrs).toHaveProperty("kebab.status", "ok");
    expect(attrs).toHaveProperty("mymcp.status", "ok");
  });

  it("numeric + boolean attribute values — dual-emission preserves types", () => {
    process.env.KEBAB_EMIT_LEGACY_OTEL_ATTRS = "1";

    const attrs = brandSpanAttrs({
      duration_ms: 123,
      "status.ok": true,
    });

    expect(attrs["kebab.duration_ms"]).toBe(123);
    expect(attrs["mymcp.duration_ms"]).toBe(123);
    expect(attrs["kebab.status.ok"]).toBe(true);
    expect(attrs["mymcp.status.ok"]).toBe(true);
  });

  it("brandSpanName — default mode prefixes with kebab.", () => {
    expect(brandSpanName("auth.check")).toBe("kebab.auth.check");
    expect(brandSpanName("kv.write")).toBe("kebab.kv.write");
    expect(brandSpanName("bootstrap.rehydrate")).toBe("kebab.bootstrap.rehydrate");
  });

  it("brandSpanName — idempotent on already-prefixed names", () => {
    // Accept legacy or modern prefix input; return the modern form.
    expect(brandSpanName("mymcp.auth.check")).toBe("kebab.auth.check");
    expect(brandSpanName("kebab.auth.check")).toBe("kebab.auth.check");
  });

  it("flag only triggers on '1' or 'true' — other values don't enable", () => {
    process.env.KEBAB_EMIT_LEGACY_OTEL_ATTRS = "false";
    let attrs = brandSpanAttrs({ "tool.name": "x" });
    expect(attrs).not.toHaveProperty("mymcp.tool.name");

    process.env.KEBAB_EMIT_LEGACY_OTEL_ATTRS = "0";
    attrs = brandSpanAttrs({ "tool.name": "x" });
    expect(attrs).not.toHaveProperty("mymcp.tool.name");
  });

  it("brandSpanAttrs accepts empty input", () => {
    const attrs = brandSpanAttrs({});
    expect(Object.keys(attrs)).toHaveLength(0);
  });
});

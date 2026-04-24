import { describe, it, expect } from "vitest";
import { redactAuth } from "@/connectors/api/lib/redact-auth";

describe("redactAuth", () => {
  it("redacts bearer token", () => {
    expect(redactAuth({ type: "bearer", token: "secret-token" })).toEqual({
      type: "bearer",
      token: "***",
    });
  });

  it("redacts api_key_header value, preserves headerName", () => {
    expect(
      redactAuth({ type: "api_key_header", headerName: "X-Api-Key", value: "secret" })
    ).toEqual({ type: "api_key_header", headerName: "X-Api-Key", value: "***" });
  });

  it("redacts basic password, preserves username", () => {
    expect(redactAuth({ type: "basic", username: "admin", password: "s3cr3t" })).toEqual({
      type: "basic",
      username: "admin",
      password: "***",
    });
  });

  it("returns unknown auth types unchanged", () => {
    const custom = { type: "custom", data: "some-value" };
    expect(redactAuth(custom)).toBe(custom);
  });

  it("returns null/undefined unchanged", () => {
    expect(redactAuth(null)).toBeNull();
    expect(redactAuth(undefined)).toBeUndefined();
  });

  it("returns non-objects unchanged", () => {
    expect(redactAuth("plain-string")).toBe("plain-string");
  });
});

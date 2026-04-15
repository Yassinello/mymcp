/**
 * Regression tests for `isLoopbackRequest` — v0.6 HIGH-1.
 *
 * The bug: previously, `x-forwarded-for` and `x-real-ip` headers were
 * trusted on every non-Vercel deploy, so any remote caller could claim
 * loopback by sending `x-forwarded-for: 127.0.0.1` — bypassing the
 * first-run admin guard on self-hosted instances.
 *
 * Fix: only consult forwarded headers when `MYMCP_TRUST_URL_HOST=1`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isLoopbackRequest } from "./request-utils";

function req(headers: Record<string, string>, url = "http://example.com/api/setup/test"): Request {
  return new Request(url, { headers });
}

describe("isLoopbackRequest — forwarded header trust", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VERCEL;
    delete process.env.MYMCP_TRUST_URL_HOST;
  });
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns false when x-forwarded-for claims 127.0.0.1 on an untrusted deploy", () => {
    // No VERCEL, no MYMCP_TRUST_URL_HOST: must not trust the header.
    expect(isLoopbackRequest(req({ "x-forwarded-for": "127.0.0.1" }))).toBe(false);
  });

  it("returns false when x-real-ip claims ::1 on an untrusted deploy", () => {
    expect(isLoopbackRequest(req({ "x-real-ip": "::1" }))).toBe(false);
  });

  it("still returns false when x-forwarded-for is a public IP on an untrusted deploy", () => {
    expect(isLoopbackRequest(req({ "x-forwarded-for": "8.8.8.8" }))).toBe(false);
  });

  it("honors x-forwarded-for: 127.0.0.1 when MYMCP_TRUST_URL_HOST=1", () => {
    process.env.MYMCP_TRUST_URL_HOST = "1";
    expect(isLoopbackRequest(req({ "x-forwarded-for": "127.0.0.1" }))).toBe(true);
  });

  it("rejects x-forwarded-for: 8.8.8.8 even when MYMCP_TRUST_URL_HOST=1", () => {
    process.env.MYMCP_TRUST_URL_HOST = "1";
    expect(isLoopbackRequest(req({ "x-forwarded-for": "8.8.8.8" }))).toBe(false);
  });

  it("never trusts forwarded headers on Vercel", () => {
    process.env.VERCEL = "1";
    process.env.MYMCP_TRUST_URL_HOST = "1";
    expect(isLoopbackRequest(req({ "x-forwarded-for": "127.0.0.1" }))).toBe(false);
  });

  it("honors URL host http://localhost when MYMCP_TRUST_URL_HOST=1", () => {
    process.env.MYMCP_TRUST_URL_HOST = "1";
    expect(isLoopbackRequest(req({}, "http://localhost:3000/api/setup/test"))).toBe(true);
  });

  it("ignores URL host http://localhost when MYMCP_TRUST_URL_HOST is unset", () => {
    expect(isLoopbackRequest(req({}, "http://localhost:3000/api/setup/test"))).toBe(false);
  });
});

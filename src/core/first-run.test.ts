import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import {
  isFirstRunMode,
  isBootstrapActive,
  getOrCreateClaim,
  isClaimer,
  bootstrapToken,
  clearBootstrap,
  __resetFirstRunForTests,
  __internals,
} from "./first-run";

const ORIGINAL_TOKEN = process.env.MCP_AUTH_TOKEN;

function makeRequest(cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  return new Request("http://localhost/api/welcome/claim", { headers });
}

beforeEach(() => {
  delete process.env.MCP_AUTH_TOKEN;
  __resetFirstRunForTests();
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.MCP_AUTH_TOKEN;
  } else {
    process.env.MCP_AUTH_TOKEN = ORIGINAL_TOKEN;
  }
  __resetFirstRunForTests();
  try {
    if (existsSync(__internals.BOOTSTRAP_PATH)) unlinkSync(__internals.BOOTSTRAP_PATH);
  } catch {
    // ignore
  }
});

describe("isFirstRunMode", () => {
  it("is true when MCP_AUTH_TOKEN is unset", () => {
    expect(isFirstRunMode()).toBe(true);
  });
  it("is false when MCP_AUTH_TOKEN is set", () => {
    process.env.MCP_AUTH_TOKEN = "x".repeat(32);
    expect(isFirstRunMode()).toBe(false);
  });
});

describe("getOrCreateClaim", () => {
  it("creates a new claim with cookie on first call", () => {
    const result = getOrCreateClaim(makeRequest());
    expect(result.isNewClaim).toBe(true);
    expect(result.isClaimer).toBe(true);
    expect(result.claimId).toMatch(/^[0-9a-f]{64}$/);
    expect(result.cookieToSet).toBeTruthy();
  });

  it("recognizes the same claimer via cookie", () => {
    const first = getOrCreateClaim(makeRequest());
    const cookieValue = encodeURIComponent(first.cookieToSet || "");
    const second = getOrCreateClaim(makeRequest(`mymcp_firstrun_claim=${cookieValue}`));
    expect(second.isNewClaim).toBe(false);
    expect(second.isClaimer).toBe(true);
    expect(second.claimId).toBe(first.claimId);
  });

  it("locks out a second visitor with no cookie", () => {
    getOrCreateClaim(makeRequest());
    const other = getOrCreateClaim(makeRequest());
    expect(other.isClaimer).toBe(false);
  });

  it("rejects a request with a forged/unsigned cookie", () => {
    getOrCreateClaim(makeRequest());
    const forged = getOrCreateClaim(makeRequest("mymcp_firstrun_claim=garbage"));
    expect(forged.isClaimer).toBe(false);
  });
});

describe("isClaimer", () => {
  it("true for the original claimer", () => {
    const c = getOrCreateClaim(makeRequest());
    const cookie = `mymcp_firstrun_claim=${encodeURIComponent(c.cookieToSet || "")}`;
    expect(isClaimer(makeRequest(cookie))).toBe(true);
  });
  it("false for an unrelated visitor", () => {
    getOrCreateClaim(makeRequest());
    expect(isClaimer(makeRequest())).toBe(false);
  });
});

describe("bootstrapToken", () => {
  it("generates a 64-char hex token and mutates process.env", () => {
    const c = getOrCreateClaim(makeRequest());
    const { token } = bootstrapToken(c.claimId);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(process.env.MCP_AUTH_TOKEN).toBe(token);
    expect(isBootstrapActive()).toBe(true);
  });

  it("is idempotent for the same claim id", () => {
    const c = getOrCreateClaim(makeRequest());
    const a = bootstrapToken(c.claimId);
    const b = bootstrapToken(c.claimId);
    expect(a.token).toBe(b.token);
  });

  it("persists to the bootstrap /tmp file", () => {
    const c = getOrCreateClaim(makeRequest());
    bootstrapToken(c.claimId);
    expect(existsSync(__internals.BOOTSTRAP_PATH)).toBe(true);
  });
});

describe("clearBootstrap", () => {
  it("removes in-memory and on-disk state", () => {
    const c = getOrCreateClaim(makeRequest());
    bootstrapToken(c.claimId);
    clearBootstrap();
    expect(isBootstrapActive()).toBe(false);
    expect(existsSync(__internals.BOOTSTRAP_PATH)).toBe(false);
  });
});

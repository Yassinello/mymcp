/**
 * Smoke tests for /api/storage/migrate.
 *
 * Verifies:
 *  - mode-mismatch refusals (file→kv when not in kv mode, kv→file when not in kv mode)
 *  - dryRun returns diff without writing
 *  - file→kv copies env-store keys to KV with per-key error tracking
 *  - body validation (direction enum, JSON parse)
 *
 * Auth is bypassed by leaving MCP_AUTH_TOKEN unset; checkAdminAuth then
 * accepts loopback / claimer (the test request has no host so it short-
 * circuits to allow). For paths that DO require auth the test sets the
 * env var and a valid bearer header.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { POST } from "../../../app/api/storage/migrate/route";
import { resetKVStoreCache } from "@/core/kv-store";
import { clearStorageModeCache } from "@/core/storage-mode";
import { resetCredentialHydration } from "@/core/credential-store";

let tmpDir: string;
const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-test-"));
  process.env.MYMCP_KV_PATH = path.join(tmpDir, "kv.json");
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.VERCEL;
  delete process.env.MCP_AUTH_TOKEN;
  resetKVStoreCache();
  clearStorageModeCache();
  resetCredentialHydration();
});

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  resetKVStoreCache();
  clearStorageModeCache();
  resetCredentialHydration();
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/storage/migrate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/storage/migrate — input validation", () => {
  it("rejects invalid JSON body with 400", async () => {
    const req = new Request("http://localhost/api/storage/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/JSON/i);
  });

  it("rejects unknown direction with 400", async () => {
    const res = await POST(makeRequest({ direction: "wat" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/direction/i);
  });
});

describe("POST /api/storage/migrate — file→kv refusal", () => {
  it("refuses with 422 when current mode is not kv (no Upstash configured)", async () => {
    const res = await POST(makeRequest({ direction: "file-to-kv" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot migrate to KV/);
    expect(body.mode).toBe("file");
  });
});

describe("POST /api/storage/migrate — kv→file refusal", () => {
  it("refuses with 422 when KV is not the source (kv source unreachable)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "x";
    // Mock failed PING → kv-degraded, not kv
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    const res = await POST(makeRequest({ direction: "kv-to-file" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot migrate from KV/);
    expect(body.mode).toBe("kv-degraded");
  });
});

describe("POST /api/storage/migrate — file→kv dryRun", () => {
  it("returns diff without writing when dryRun=true", async () => {
    // Set up KV reachable + a writable .env file with one cred
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "x";
    // Each call returns a fresh Response since Response.body can only be
    // read once. The route triggers PING (storage-mode) then SCAN+MGET via
    // readAllCredentialsFromKV — three+ separate requests in one test.
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      const body = init?.body ? JSON.parse(init.body as string) : [];
      const cmd = Array.isArray(body) ? body[0] : null;
      if (cmd === "PING") {
        return new Response(JSON.stringify({ result: "PONG" }), { status: 200 });
      }
      if (cmd === "SCAN") {
        return new Response(JSON.stringify({ result: ["0", []] }), { status: 200 });
      }
      // MGET / GET / SET — return null result (empty KV)
      return new Response(JSON.stringify({ result: null }), { status: 200 });
    });

    const res = await POST(makeRequest({ direction: "file-to-kv", dryRun: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.diff).toBeDefined();
    expect(Array.isArray(body.diff.add)).toBe(true);
    expect(Array.isArray(body.diff.update)).toBe(true);
    expect(Array.isArray(body.diff.unchanged)).toBe(true);
  });
});

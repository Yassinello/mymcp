/**
 * v0.6 / A1 — Settings storage schism.
 *
 * Verifies that the four user-facing settings (displayName, timezone,
 * locale, contextPath) are now backed by KVStore, not EnvStore:
 *
 * 1. KV value beats env when both are set (precedence).
 * 2. Env falls through when KV is empty (migration bootstrap).
 * 3. Saving via the dashboard env route goes to KV, not EnvStore.write().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getInstanceConfig,
  getInstanceConfigAsync,
  saveInstanceConfig,
  resetInstanceConfigCache,
  SETTINGS_KV_KEYS,
} from "../../src/core/config";
import { getKVStore, resetKVStoreCache } from "../../src/core/kv-store";

describe("v0.6 settings storage (A1)", () => {
  let tmpDir: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mymcp-test-"));
    process.env.MYMCP_KV_DIR = tmpDir; // not actually read — we pin cwd instead
    // FilesystemKV resolves path.resolve(process.cwd(), "data", "kv.json")
    // so redirect cwd via env var. Simpler: stub process.cwd().
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    resetKVStoreCache();
    resetInstanceConfigCache();

    for (const k of [
      "MYMCP_DISPLAY_NAME",
      "MYMCP_TIMEZONE",
      "MYMCP_LOCALE",
      "MYMCP_CONTEXT_PATH",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "VERCEL",
    ] as const) {
      originalEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetKVStoreCache();
    resetInstanceConfigCache();
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("falls back to defaults when KV and env are empty", async () => {
    const cfg = await getInstanceConfigAsync();
    expect(cfg.displayName).toBe("User");
    expect(cfg.timezone).toBe("UTC");
    expect(cfg.locale).toBe("en-US");
    expect(cfg.contextPath).toBe("System/context.md");
  });

  it("falls back to env vars when KV is empty", async () => {
    process.env.MYMCP_DISPLAY_NAME = "Yassine";
    process.env.MYMCP_TIMEZONE = "Europe/Paris";
    const cfg = await getInstanceConfigAsync();
    expect(cfg.displayName).toBe("Yassine");
    expect(cfg.timezone).toBe("Europe/Paris");
    expect(cfg.locale).toBe("en-US");
  });

  it("migrates env -> KV on first async read (idempotent)", async () => {
    process.env.MYMCP_DISPLAY_NAME = "Yassine";
    process.env.MYMCP_LOCALE = "fr-FR";
    await getInstanceConfigAsync();

    const kv = getKVStore();
    expect(await kv.get(SETTINGS_KV_KEYS.displayName)).toBe("Yassine");
    expect(await kv.get(SETTINGS_KV_KEYS.locale)).toBe("fr-FR");

    // Idempotent: change env, reread. Migration must NOT overwrite KV.
    process.env.MYMCP_DISPLAY_NAME = "Someone Else";
    resetInstanceConfigCache();
    const again = await getInstanceConfigAsync();
    expect(again.displayName).toBe("Yassine");
  });

  it("KV value takes precedence over env", async () => {
    process.env.MYMCP_TIMEZONE = "UTC";
    const kv = getKVStore();
    await kv.set(SETTINGS_KV_KEYS.timezone, "Asia/Tokyo");

    resetInstanceConfigCache();
    const cfg = await getInstanceConfigAsync();
    expect(cfg.timezone).toBe("Asia/Tokyo");
  });

  it("saveInstanceConfig persists to KV and refreshes sync cache", async () => {
    await saveInstanceConfig({ displayName: "Alice", timezone: "America/New_York" });
    const kv = getKVStore();
    expect(await kv.get(SETTINGS_KV_KEYS.displayName)).toBe("Alice");
    expect(await kv.get(SETTINGS_KV_KEYS.timezone)).toBe("America/New_York");

    // After async refresh the sync read returns the new values.
    await getInstanceConfigAsync();
    const sync = getInstanceConfig();
    expect(sync.displayName).toBe("Alice");
    expect(sync.timezone).toBe("America/New_York");
  });

  it("PUT /api/config/env routes the four settings to KV, not EnvStore", async () => {
    // Mock EnvStore.write so we can assert it's NOT called for KV-backed
    // keys. Dynamic import after mocks.
    const envStore = await import("../../src/core/env-store");
    const writeSpy = vi.fn(async () => ({ written: 0 }));
    vi.spyOn(envStore, "getEnvStore").mockReturnValue({
      kind: "filesystem",
      read: async () => ({}),
      write: writeSpy,
    } as unknown as ReturnType<typeof envStore.getEnvStore>);

    const { PUT } = await import("../../app/api/config/env/route");

    // Loopback bypass + no MCP_AUTH_TOKEN so checkAdminAuth lets us through.
    delete process.env.MCP_AUTH_TOKEN;
    const req = new Request("http://127.0.0.1/api/config/env", {
      method: "PUT",
      headers: { "Content-Type": "application/json", origin: "http://127.0.0.1" },
      body: JSON.stringify({
        vars: {
          MYMCP_DISPLAY_NAME: "Yassine",
          MYMCP_TIMEZONE: "Europe/Paris",
          MYMCP_LOCALE: "fr-FR",
          MYMCP_CONTEXT_PATH: "Notes/me.md",
        },
      }),
    });

    const res = await PUT(req);
    const json = (await res.json()) as { ok: boolean; kvWritten?: number };
    expect(json.ok).toBe(true);
    // EnvStore.write should NOT have been called at all — every field was KV-backed.
    expect(writeSpy).not.toHaveBeenCalled();
    expect(json.kvWritten).toBe(4);

    const kv = getKVStore();
    expect(await kv.get(SETTINGS_KV_KEYS.displayName)).toBe("Yassine");
    expect(await kv.get(SETTINGS_KV_KEYS.contextPath)).toBe("Notes/me.md");
  });

  it("PUT /api/config/env still calls EnvStore for non-KV-backed keys", async () => {
    const envStore = await import("../../src/core/env-store");
    const writeSpy = vi.fn(async () => ({ written: 1 }));
    vi.spyOn(envStore, "getEnvStore").mockReturnValue({
      kind: "filesystem",
      read: async () => ({}),
      write: writeSpy,
    } as unknown as ReturnType<typeof envStore.getEnvStore>);

    const { PUT } = await import("../../app/api/config/env/route");
    delete process.env.MCP_AUTH_TOKEN;
    const req = new Request("http://127.0.0.1/api/config/env", {
      method: "PUT",
      headers: { "Content-Type": "application/json", origin: "http://127.0.0.1" },
      body: JSON.stringify({
        vars: {
          MYMCP_DISPLAY_NAME: "Yassine", // KV
          SLACK_BOT_TOKEN: "xoxb-test", // env
        },
      }),
    });

    const res = await PUT(req);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    // Only the non-KV key reached EnvStore.
    expect(writeSpy).toHaveBeenCalledWith({ SLACK_BOT_TOKEN: "xoxb-test" });
  });
});

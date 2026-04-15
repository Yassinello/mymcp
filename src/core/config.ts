import type { InstanceConfig } from "./types";
import { getKVStore } from "./kv-store";

/**
 * Reads instance configuration.
 *
 * v0.6 (A1): the four user settings (`displayName`, `timezone`, `locale`,
 * `contextPath`) now live in KVStore by default. Precedence on read:
 *   1. KVStore value (if set)
 *   2. Environment variable (legacy / bootstrap)
 *   3. Hard-coded default
 *
 * Because many call sites are synchronous (tool handlers), we keep a
 * module-level cache populated by `getInstanceConfigAsync()` on the first
 * async entry (pages, admin status, settings save). Synchronous callers
 * read from the cache or, on cold start, fall back to env/defaults.
 *
 * Framework-level: this module defines WHAT config exists.
 * Instance-level: values come from KV/env.
 */

const KV_KEYS = {
  displayName: "settings:displayName",
  timezone: "settings:timezone",
  locale: "settings:locale",
  contextPath: "settings:contextPath",
} as const;

export const SETTINGS_KV_KEYS = KV_KEYS;

/** Keys routed to KVStore instead of EnvStore when saved from the dashboard. */
export const SETTINGS_ENV_KEYS = [
  "MYMCP_DISPLAY_NAME",
  "MYMCP_TIMEZONE",
  "MYMCP_LOCALE",
  "MYMCP_CONTEXT_PATH",
] as const;

function envConfig(): InstanceConfig {
  return {
    timezone: process.env.MYMCP_TIMEZONE || "UTC",
    locale: process.env.MYMCP_LOCALE || "en-US",
    displayName: process.env.MYMCP_DISPLAY_NAME || "User",
    contextPath: process.env.MYMCP_CONTEXT_PATH || "System/context.md",
  };
}

let cached: InstanceConfig | null = null;

/**
 * Synchronous read of instance config. Returns the last value loaded from
 * KV via `getInstanceConfigAsync()`; on cold start (before any async
 * entry) falls back to env/defaults. Tool handlers can rely on this for
 * locale/timezone formatting without awaiting KV on every call.
 */
export function getInstanceConfig(): InstanceConfig {
  return cached ?? envConfig();
}

/** Test-only: reset the module cache. */
export function resetInstanceConfigCache(): void {
  cached = null;
}

/**
 * Async read: consult KVStore, fall back to env, fall back to defaults.
 * Also refreshes the sync cache so subsequent sync calls see the latest.
 *
 * One-time migration: if KV is empty for a key but env has a value, copy
 * env → KV so the dashboard can start managing it without losing state.
 */
export async function getInstanceConfigAsync(): Promise<InstanceConfig> {
  const env = envConfig();
  let kv;
  try {
    kv = getKVStore();
  } catch {
    cached = env;
    return env;
  }

  const [kvDisplay, kvTz, kvLocale, kvCtx] = await Promise.all([
    kv.get(KV_KEYS.displayName),
    kv.get(KV_KEYS.timezone),
    kv.get(KV_KEYS.locale),
    kv.get(KV_KEYS.contextPath),
  ]);

  // One-time env → KV migration per key. Idempotent: if KV already has a
  // value we never touch it.
  const migrations: Array<Promise<void>> = [];
  if (kvDisplay === null && process.env.MYMCP_DISPLAY_NAME) {
    migrations.push(kv.set(KV_KEYS.displayName, process.env.MYMCP_DISPLAY_NAME));
  }
  if (kvTz === null && process.env.MYMCP_TIMEZONE) {
    migrations.push(kv.set(KV_KEYS.timezone, process.env.MYMCP_TIMEZONE));
  }
  if (kvLocale === null && process.env.MYMCP_LOCALE) {
    migrations.push(kv.set(KV_KEYS.locale, process.env.MYMCP_LOCALE));
  }
  if (kvCtx === null && process.env.MYMCP_CONTEXT_PATH) {
    migrations.push(kv.set(KV_KEYS.contextPath, process.env.MYMCP_CONTEXT_PATH));
  }
  if (migrations.length > 0) {
    await Promise.all(migrations).catch(() => {
      /* best-effort migration; next read will retry */
    });
  }

  const resolved: InstanceConfig = {
    displayName: kvDisplay ?? env.displayName,
    timezone: kvTz ?? env.timezone,
    locale: kvLocale ?? env.locale,
    contextPath: kvCtx ?? env.contextPath,
  };
  cached = resolved;
  return resolved;
}

/**
 * Persist one or more settings to KVStore. Clears the sync cache so the
 * next read picks up the new value.
 */
export async function saveInstanceConfig(patch: Partial<InstanceConfig>): Promise<void> {
  const kv = getKVStore();
  const writes: Array<Promise<void>> = [];
  if (patch.displayName !== undefined) writes.push(kv.set(KV_KEYS.displayName, patch.displayName));
  if (patch.timezone !== undefined) writes.push(kv.set(KV_KEYS.timezone, patch.timezone));
  if (patch.locale !== undefined) writes.push(kv.set(KV_KEYS.locale, patch.locale));
  if (patch.contextPath !== undefined) writes.push(kv.set(KV_KEYS.contextPath, patch.contextPath));
  await Promise.all(writes);
  cached = null;
}

/** Default tool timeout in ms. Override via MYMCP_TOOL_TIMEOUT env var. */
export function getToolTimeout(): number {
  const raw = process.env.MYMCP_TOOL_TIMEOUT;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return 30_000; // 30s default
}

/** Webhook URL for error notifications. If set, POST is sent on tool failure. */
export function getErrorWebhookUrl(): string | undefined {
  return process.env.MYMCP_ERROR_WEBHOOK_URL || undefined;
}

/**
 * Parse MYMCP_ENABLED_PACKS if set.
 * Returns undefined if not set (all packs auto-activate by env vars).
 * Returns Set of pack IDs if set (only listed packs are considered).
 */
export function getEnabledPacksOverride(): Set<string> | undefined {
  const raw = process.env.MYMCP_ENABLED_PACKS;
  if (!raw) return undefined;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

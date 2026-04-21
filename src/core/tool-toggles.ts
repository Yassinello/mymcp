/**
 * Per-tool enable/disable toggles via KV.
 *
 * Tools are enabled by default. Disabled tools have KV key
 * `tool:disabled:<toolName>` set to `"true"`. The transport route
 * checks this before registering each tool on the MCP server.
 *
 * **Phase 42 (TEN-03) — tenant-scoped toggles:**
 *
 * Reads + writes now flow through `getContextKVStore()`, so the bare
 * key `tool:disabled:<name>` auto-wraps to
 * `tenant:<id>:tool:disabled:<name>` under a tenant context.
 * Null-tenant deploys keep the bare key shape (back-compat).
 *
 * Legacy (pre-v0.11) un-wrapped flags are read transparently via
 * `dualReadKV` during the 2-release transition window. Writes ALWAYS
 * go to the new (tenant-wrapped) key. Legacy-key DELETE is deferred
 * to v0.13.
 *
 * The 5s in-memory cache is keyed per-tenant so tenant A's cache miss
 * doesn't serve tenant B's stale data. `env.changed` clears every
 * tenant's cache — a connector-level toggle is operator-wide.
 *
 * `getDisabledToolsForTenant(tenantId)` remains the explicit-tenant
 * admin helper for cross-tenant views.
 */

import { getTenantKVStore } from "./kv-store";
import { getContextKVStore, getCurrentTenantId } from "./request-context";
import { dualReadKV } from "./migrations/v0.11-tenant-scope";
import { emit, on } from "./events";

const KEY_PREFIX = "tool:disabled:";

// MEDIUM-4 / Phase 42: per-tenant cache. Tenant A's miss doesn't
// surface tenant B's stale data. The cache also covers the null-tenant
// (default) case via the "__null__" sentinel key.
const DISABLED_TOOLS_TTL_MS = 5_000;
const cachedDisabledTools = new Map<string, { at: number; value: Set<string> }>();

// Invalidate every tenant's cache on env.changed (covers setToolDisabled
// and any other mutation that affects toggle state).
on("env.changed", () => {
  cachedDisabledTools.clear();
});

function tenantKey(): string {
  return getCurrentTenantId() ?? "__null__";
}

/** Check if a specific tool is disabled via KV (per-tenant, dual-read). */
export async function isToolDisabled(toolName: string): Promise<boolean> {
  const kv = getContextKVStore();
  const newKey = `${KEY_PREFIX}${toolName}`;
  // Legacy key: pre-v0.11 flags were written without any tenant
  // prefix. Dual-read so operators upgrading from v0.10 keep seeing
  // their existing toggles.
  const legacyKey = `${KEY_PREFIX}${toolName}`;
  const val = await dualReadKV(kv, newKey, legacyKey);
  return val === "true";
}

/**
 * Set or clear the disabled flag for a tool. Writes to the current
 * tenant's namespace only. Emits env.changed to invalidate every
 * tenant's cache (registered toolset may need re-registration).
 */
export async function setToolDisabled(toolName: string, disabled: boolean): Promise<void> {
  const kv = getContextKVStore();
  if (disabled) {
    await kv.set(`${KEY_PREFIX}${toolName}`, "true");
  } else {
    await kv.delete(`${KEY_PREFIX}${toolName}`);
  }
  emit("env.changed");
}

/** Test-only: reset every tenant's disabled-tools cache. */
export function __resetDisabledToolsCacheForTests(): void {
  cachedDisabledTools.clear();
}

/**
 * Get all disabled tool names for the current tenant. Cached with 5s
 * TTL, keyed per-tenant.
 */
export async function getDisabledTools(): Promise<Set<string>> {
  const now = Date.now();
  const key = tenantKey();
  const cached = cachedDisabledTools.get(key);
  if (cached && now - cached.at < DISABLED_TOOLS_TTL_MS) {
    return cached.value;
  }

  const kv = getContextKVStore();
  const keys = await kv.list(KEY_PREFIX);
  const disabled = new Set<string>();
  for (const k of keys) {
    const toolName = k.slice(KEY_PREFIX.length);
    disabled.add(toolName);
  }
  cachedDisabledTools.set(key, { at: now, value: disabled });
  return disabled;
}

/**
 * Get disabled tools scoped to a specific tenant — explicit-tenant
 * admin helper for cross-tenant views (e.g. a root-operator dashboard
 * that lists tenants' disabled toggles). Not cached — these lookups
 * are infrequent and avoid mixing per-tenant cache state.
 *
 * Phase 42 note: `getDisabledTools()` (no-arg) now routes through
 * `getContextKVStore()` and is the preferred path for in-tenant
 * reads. This helper is retained for the admin cross-tenant scenario
 * and continues to use `getTenantKVStore(tenantId)` explicitly.
 */
export async function getDisabledToolsForTenant(tenantId: string): Promise<Set<string>> {
  const kv = getTenantKVStore(tenantId);
  const keys = await kv.list(KEY_PREFIX);
  const disabled = new Set<string>();
  for (const key of keys) {
    // Tenant KV list returns keys with tenant prefix stripped
    const toolName = key.slice(KEY_PREFIX.length);
    disabled.add(toolName);
  }
  return disabled;
}

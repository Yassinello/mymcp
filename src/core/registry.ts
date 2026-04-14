import type { ConnectorManifest, ConnectorState } from "./types";
import { getEnabledPacksOverride } from "./config";
import { on } from "./events";

// Import all pack manifests — static, deterministic, no auto-discovery
import { googleConnector } from "@/connectors/google/manifest";
import { vaultConnector } from "@/connectors/vault/manifest";
import { browserConnector } from "@/connectors/browser/manifest";
import { adminConnector } from "@/connectors/admin/manifest";
import { slackConnector } from "@/connectors/slack/manifest";
import { notionConnector } from "@/connectors/notion/manifest";
import { composioConnector } from "@/connectors/composio/manifest";
import { skillsConnector } from "@/connectors/skills/manifest";
import { paywallConnector } from "@/connectors/paywall/manifest";
import { apifyConnector } from "@/connectors/apify/manifest";
import { githubConnector } from "@/connectors/github/manifest";
import { linearConnector } from "@/connectors/linear/manifest";
import { airtableConnector } from "@/connectors/airtable/manifest";

export const ALL_CONNECTORS: ConnectorManifest[] = [
  googleConnector,
  vaultConnector,
  browserConnector,
  slackConnector,
  notionConnector,
  composioConnector,
  skillsConnector,
  paywallConnector,
  apifyConnector,
  githubConnector,
  linearConnector,
  airtableConnector,
  adminConnector,
];

// ── Cached registry resolution ──────────────────────────────────────
//
// `resolveRegistry()` is called on every dashboard render + every MCP
// request. Prior to v0.5 phase 15 it iterated all 13 connectors and
// re-scanned process.env every call. The cached wrapper reactively
// invalidates via the events bus — subscribing to `env.changed` and
// `connector.toggled` so hot env writes still take effect immediately
// without a restart.
//
// Cache key is implicit (no args) — the function depends only on
// process.env, which we re-scan on miss.

let cachedRegistry: ConnectorState[] | null = null;

function invalidateRegistryCache(): void {
  cachedRegistry = null;
}

// Register once, idempotently. Subsequent imports are safe because the
// module is evaluated once per process.
on("env.changed", invalidateRegistryCache);
on("connector.toggled", invalidateRegistryCache);

/**
 * Test-only escape hatch for resetting the registry cache between
 * tests that mutate process.env directly. Production code should rely
 * on emit("env.changed").
 */
export function __resetRegistryCacheForTests(): void {
  cachedRegistry = null;
}

/**
 * Resolve which packs are enabled based on env vars.
 *
 * Logic:
 * 1. If MYMCP_ENABLED_PACKS is set → only listed packs are considered
 * 2. If MYMCP_DISABLE_<PACK> is "true" → pack is force-disabled
 * 3. If all requiredEnvVars are present → pack is active
 * 4. Otherwise → pack is inactive with reason
 */
export function resolveRegistry(): ConnectorState[] {
  if (cachedRegistry !== null) return cachedRegistry;
  const state = resolveRegistryUncached();
  cachedRegistry = state;
  return state;
}

function resolveRegistryUncached(): ConnectorState[] {
  const enabledOverride = getEnabledPacksOverride();

  return ALL_CONNECTORS.map((pack) => {
    // Check explicit enable list (if set)
    if (enabledOverride && !enabledOverride.has(pack.id)) {
      return {
        manifest: pack,
        enabled: false,
        reason: `not listed in MYMCP_ENABLED_PACKS`,
      };
    }

    // Check force-disable
    const disableKey = `MYMCP_DISABLE_${pack.id.toUpperCase()}`;
    if (process.env[disableKey] === "true") {
      return {
        manifest: pack,
        enabled: false,
        reason: `disabled via ${disableKey}`,
      };
    }

    // Custom activation predicate (takes precedence over requiredEnvVars)
    if (pack.isActive) {
      const result = pack.isActive(process.env);
      if (!result.active) {
        return {
          manifest: pack,
          enabled: false,
          reason: result.reason || "inactive",
        };
      }
      return { manifest: pack, enabled: true, reason: "active" };
    }

    // Check required env vars (default AND semantics)
    const missing = pack.requiredEnvVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      return {
        manifest: pack,
        enabled: false,
        reason: `missing env: ${missing.join(", ")}`,
      };
    }

    return { manifest: pack, enabled: true, reason: "active" };
  });
}

/** Get only the enabled packs */
export function getEnabledPacks(): ConnectorState[] {
  return resolveRegistry().filter((p) => p.enabled);
}

/** Log registry state to console at startup */
export function logRegistryState(): void {
  const packs = resolveRegistry();
  const enabled = packs.filter((p) => p.enabled);
  const disabled = packs.filter((p) => !p.enabled);

  console.log(`[MyMCP] Registry: ${enabled.length}/${packs.length} packs active`);
  for (const p of enabled) {
    console.log(`[MyMCP]   ✓ ${p.manifest.label} (${p.manifest.tools.length} tools)`);
  }
  for (const p of disabled) {
    console.log(`[MyMCP]   ✗ ${p.manifest.label} — ${p.reason}`);
  }
}

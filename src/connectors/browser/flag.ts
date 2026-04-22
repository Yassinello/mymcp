/**
 * Phase 44 SCM-01: feature flag gating Stagehand v2-compat vs v3 dispatch.
 * Phase 51 LANG-01: default flipped to v3 (langsmith CVEs no longer reachable
 * through the default browser-connector path).
 *
 * Environment:
 *   - KEBAB_BROWSER_CONNECTOR_V2 unset / "1" / "true"   → v3 (default, clean langsmith)
 *   - KEBAB_BROWSER_CONNECTOR_V2 = "0" / "false"        → v2 (explicit opt-out, rollback)
 *
 * Flag-name history note: the `_V2` token still tracks the milestone ID
 * ("the V2-vs-V3 toggle"); since Phase 51 the semantics are inverted so
 * that unset resolves to the vetted v3 path. Unknown non-"0"/"false"
 * values fail safe to v3 (the secure default).
 *
 * See .planning/phases/44-supply-chain/MIGRATION-NOTES.md for v3 surface
 * analysis and .planning/phases/51-langsmith-default-on/ for the flip.
 */

import { getConfig } from "@/core/config-facade";

export type BrowserConnectorVersion = "v2" | "v3";

export function getBrowserConnectorVersion(): BrowserConnectorVersion {
  const raw = getConfig("KEBAB_BROWSER_CONNECTOR_V2");
  if (raw === "0" || raw === "false") return "v2";
  return "v3";
}

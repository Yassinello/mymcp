/**
 * First-run / zero-config bootstrap for Vercel deploys.
 *
 * Problem: We want users to click "Deploy to Vercel" with NO env vars
 * pre-filled, then land on /welcome to generate their auth token. But Vercel
 * serverless does not hot-reload env vars — even writing via the REST API
 * only takes effect on the next cold start.
 *
 * Solution (in-memory bridge):
 * 1. The first browser to POST /api/welcome/claim gets a signed cookie
 *    representing a "claim" on this instance. Only the claimer can later
 *    initialize the token.
 * 2. On init, we generate a 32-byte hex token, mutate process.env so the
 *    current Node instance sees it immediately, AND persist a small JSON
 *    descriptor to /tmp (per-instance, ~15min). Subsequent requests on the
 *    same warm instance work seamlessly.
 * 3. Cold starts re-hydrate from /tmp if the file is still present. Once the
 *    user has manually pasted the token into Vercel and triggered a redeploy,
 *    process.env.MCP_AUTH_TOKEN is set "for real" and the bootstrap state is
 *    cleared.
 *
 * This module is the single source of truth for first-run state.
 *
 * v0.11 Phase 41 (T20 fold-in): rehydrate is no longer triggered at
 * module load. The previous `rehydrateBootstrapFromTmp();` line at the
 * bottom of this file made test order depend on a disk-I/O side effect
 * (ARCH-AUDIT §3 / POST-V0.10-AUDIT §B.7). The composable request
 * pipeline's `rehydrateStep` (src/core/pipeline/rehydrate-step.ts) is
 * now the single deterministic entry point — every request-handling
 * path rehydrates exactly once at the pipeline boundary via
 * `rehydrateBootstrapAsync()`, and `withBootstrapRehydrate` remains a
 * valid backwards-compat wrapper for routes that haven't migrated.
 * This module is therefore SIDE-EFFECT FREE at module load.
 *
 * Barrel re-export — implementation split across 3 sub-modules:
 *   ./first-run/claim.ts     — claim primitives (cookie, Map)
 *   ./first-run/bootstrap.ts — bootstrap lifecycle (mint, flush, rehydrate)
 *   ./first-run/obs.ts       — rehydrate observability (OBS-01/OBS-02)
 */

export * from "./first-run/claim";
export * from "./first-run/bootstrap";
export * from "./first-run/obs";

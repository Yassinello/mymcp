"use client";

/**
 * Welcome entry point — thin shim after the Phase 45 UX-01 refactor.
 *
 * Before Phase 45 Task 5 (UX-01b): this file was a 2207-LOC
 * god-component. The welcome-flow wizard state, 4 step JSX subtrees,
 * fetch-effect clusters, and helper closures all lived in one
 * module, which made unit tests impossible without JSX-grep
 * contracts (Phase 40 FOLLOW-UP A/B).
 *
 * After Task 5: the implementation is re-homed under
 * `./WelcomeShell.tsx` as a named export. `welcome-client.tsx`
 * preserves its historical default-export contract (imported by
 * `app/welcome/page.tsx`) by re-exporting `WelcomeShell` as the
 * default component. No prop shape changed.
 *
 * The companion infrastructure landed in Tasks 1-4 (state reducer,
 * step components, hooks, pure modules) is dormant until a future
 * phase migrates the JSX subtrees from `WelcomeShell.tsx` into the
 * per-step files. The split is structural only — this file is the
 * mount shim; `WelcomeShell.tsx` holds the live render tree.
 */
import { WelcomeShell } from "./WelcomeShell";
import type { WelcomeClientProps } from "./WelcomeShell";

export default function WelcomeClient(props: WelcomeClientProps) {
  return <WelcomeShell {...props} />;
}

"use client";

import { useCallback, useEffect } from "react";
import { KebabLogo } from "../components/kebab-logo";
import {
  WelcomeStateProvider,
  useWelcomeDispatch,
  useWelcomeState,
  type WelcomeState,
} from "./WelcomeStateContext";
import { StorageStep } from "./steps/storage";
import { MintStep } from "./steps/mint";
import { TestStep } from "./steps/test";
import { AlreadyInitializedPanel } from "./steps/already-initialized";
import { useClaimStatus } from "./hooks/useClaimStatus";

type ClaimStatus = "loading" | "new" | "claimer" | "claimed-by-other" | "already-initialized";

interface WelcomeClientProps {
  initialBootstrap: boolean;
  /**
   * True when MYMCP_RECOVERY_RESET=1 is set on the deployment. Surfaces a
   * blocking banner at the top of the wizard — minting a token in this
   * state hands the user a doomed credential, since every cold lambda
   * wipes the bootstrap.
   */
  recoveryResetActive?: boolean;
  previewMode?: boolean;
  previewToken?: string;
  previewInstanceUrl?: string;
}

type StorageMode = "kv" | "file" | "static" | "kv-degraded";

type WizardStep = 1 | 2 | 3;

export type { WelcomeClientProps };

/**
 * Derive the `WelcomeStateProvider` initial state from incoming client
 * props. Preview mode pre-seeds `claim = "claimer"` + the real
 * `previewToken` so the mint step renders read-only against a live
 * instance without firing `/init`. All other fields default via
 * `initialWelcomeState`.
 *
 * Phase 47 Task 1 (WIRE-02): the provider is wired at the shell root
 * but the orchestrator still owns the legacy `useState` chain (dual-
 * path during migration). Per-step commits (Tasks 2–5) retire legacy
 * state entry by entry; Task 6 collapses the inner body into a pure
 * reducer reader.
 */
function deriveProviderInitial(props: WelcomeClientProps): Partial<WelcomeState> {
  return {
    claim: props.previewMode ? "claimer" : "loading",
    step: "storage",
    token: props.previewMode ? (props.previewToken ?? null) : null,
    instanceUrl: props.previewMode ? (props.previewInstanceUrl ?? "") : "",
    tokenSaved: Boolean(props.initialBootstrap),
    permanent: Boolean(props.previewMode),
  };
}

export function WelcomeShell(props: WelcomeClientProps) {
  return (
    <WelcomeStateProvider initial={deriveProviderInitial(props)}>
      <WelcomeShellInner {...props} />
    </WelcomeStateProvider>
  );
}

function WelcomeShellInner({
  initialBootstrap,
  recoveryResetActive = false,
  previewMode = false,
  previewToken = "",
  previewInstanceUrl = "",
}: WelcomeClientProps) {
  // Phase 47 WIRE-01a dual-path boundary: step, storage, ack fully migrate
  // to the reducer via `<StorageStep />`. Legacy useState remains for
  // token / mint / test / claim until Tasks 3–5 migrate those steps.
  const reducerState = useWelcomeState();
  const dispatch = useWelcomeDispatch();
  // `state.step` is a string ("storage" | "mint" | "test" | "done"); the
  // legacy stepper uses a 1|2|3 numeric index. Adapter below.
  const stepString = reducerState.step;
  const step: WizardStep = stepString === "storage" ? 1 : stepString === "mint" ? 2 : 3;
  const setStep = useCallback(
    (next: WizardStep) => {
      dispatch({
        type: "STEP_SET",
        step: next === 1 ? "storage" : next === 2 ? "mint" : "test",
      });
    },
    [dispatch]
  );

  // Step 0: claim the instance via the shared `useClaimStatus` hook
  // (Phase 47 WIRE-01d). Preview mode bypasses the hook by seeding
  // the reducer initial state with claim="claimer" — the hook still
  // runs but the ClaimStatus result is ignored here.
  const claimHook = useClaimStatus(previewMode ? "claimer" : "loading");
  const claim: ClaimStatus = previewMode ? "claimer" : claimHook.claim;
  // Bridge: mirror hook result into reducer so `state.claim` is the
  // single read surface for step components (e.g. isTerminal predicate).
  useEffect(() => {
    if (previewMode) return;
    if (claim === "loading") return;
    // Reducer's `WelcomeState.claim` only accepts "claimer" |
    // "waiting" | "already-initialized" | "loading" — map the hook's
    // wider vocabulary ("new" | "claimed-by-other") to reducer-
    // compatible values. "new" → "claimer" (both mean first-mover);
    // "claimed-by-other" stays unmapped (orchestrator handles the
    // dedicated "Instance locked" render path and never dispatches).
    if (claim === "new" || claim === "claimer") {
      dispatch({ type: "CLAIM_RESOLVED", claim: "claimer" });
    } else if (claim === "already-initialized") {
      dispatch({ type: "CLAIM_RESOLVED", claim: "already-initialized" });
    }
  }, [claim, previewMode, dispatch]);

  // Surface hook-level fetch errors via the reducer's error channel.
  useEffect(() => {
    if (claimHook.error) {
      dispatch({ type: "ERROR_SET", error: "Could not reach this instance. Try refreshing." });
    }
  }, [claimHook.error, dispatch]);

  // Storage detection + ack + Upstash polling now live inside
  // <StorageStep /> (Phase 47 WIRE-01a). The reducer's
  // `state.storage.{mode,healthy,durable}` is the single read surface
  // for mint + test step gates below.
  const storageReady = reducerState.storage.healthy;
  const durableBackend = Boolean(reducerState.storage.durable);

  // Mint + copy/download/auto-init + permanent-poll now live inside
  // <MintStep /> (Phase 47 WIRE-01b). The reducer's
  // `state.{token,tokenSaved,permanent,autoMagic,error}` is the
  // single read surface for mint UI + downstream gates.
  const token = reducerState.token;
  const permanent = reducerState.permanent;
  const tokenSaved = reducerState.tokenSaved;
  // Test MCP fetch + skipTest transient now live inside <TestStep />
  // (Phase 47 WIRE-01c). The reducer's `state.testStatus` /
  // `state.testError` are the authoritative read surface.
  const testStatus = reducerState.testStatus;

  // ── Render branches ─────────────────────────────────────────────────

  if (claim === "loading") {
    return (
      <Shell>
        <p className="text-slate-400">Connecting to this instance…</p>
      </Shell>
    );
  }

  if (claim === "already-initialized") {
    return (
      <Shell>
        <AlreadyInitializedPanel skipClaimSync />
        <RecoveryFooter />
      </Shell>
    );
  }

  if (claim === "claimed-by-other") {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-white mb-2">Instance locked</h1>
        <p className="text-slate-400">
          Another browser is currently initializing this instance. Wait for them to finish, or
          contact the operator who deployed it.
        </p>
      </Shell>
    );
  }

  // Persistence gate. Durable backends (KV, persistent file) store the
  // token in the actual storage layer, not in Vercel env vars — so
  // `permanent` (the status flag for "token landed in real env vars")
  // never flips on no-auto-magic deploys, yet the instance is fully
  // durable. Treat durable-backend + minted-token as equivalent to
  // permanent for UI gating: step-2 Continue unlocks on mint, step-3
  // Test MCP is callable immediately, no 15-minute bootstrap-TTL wait.
  //
  // Phase 47 WIRE-01a: `durableBackend` is derived from the reducer's
  // `state.storage.durable` (bridged from StorageStep's polling hook).
  const persistenceReady = permanent || durableBackend;
  // Legacy shape used by the still-inline step 2 renderer during the
  // dual-path migration. Reducer-mode translates back to the file|kv|…
  // vocabulary that renderStepToken expects.
  const legacyStorageMode: StorageMode | null =
    reducerState.storage.mode === "upstash"
      ? "kv"
      : reducerState.storage.mode === "filesystem"
        ? "file"
        : reducerState.storage.mode === "memory" && reducerState.storage.healthy
          ? "static"
          : null;
  const legacyStorageEphemeral =
    reducerState.storage.mode === "filesystem" && !reducerState.storage.durable;

  // claim === "new" or "claimer" — render the 3-step wizard.
  // ── 3-step wizard ──────────────────────────────────────────────────
  // step 1 = Storage (detect + optional Upstash install)
  // step 2 = Auth token (mint on click + save UX + ack)
  // step 3 = Connect (snippet, MCP test, optional starter skill)
  //
  // The storage-first order means the token gets minted into the chosen
  // backend: Upstash → durable across cold starts; durable file → also
  // persistent; ack'd ephemeral → user was warned it won't survive. The
  // prior order (token first, storage second) created a window where
  // freshly-minted tokens lived only in lambda-local /tmp and silently
  // vanished on Vercel's container recycle, trapping users in a
  // "locked out of my own instance" state.
  return (
    <Shell wide>
      {previewMode && (
        <div className="mb-6 rounded-lg border border-purple-800 bg-purple-950/40 px-4 py-3 text-sm text-purple-200">
          <strong className="font-semibold">Preview mode</strong> — read-only rendering against your
          live instance. No state is mutated. Close this tab when done.
        </div>
      )}

      {recoveryResetActive && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          <p className="font-semibold mb-1">⚠ MYMCP_RECOVERY_RESET=1 is still set</p>
          <p className="text-xs leading-relaxed text-red-200/90">
            Every cold lambda on this deployment wipes the bootstrap (it&apos;s the recovery escape
            hatch). Any token you mint right now will vanish within a few minutes, and the instance
            will silently drop back to first-run mode. <strong>Remove the env var</strong> from
            Vercel Settings → Environment Variables, redeploy, then reload this page before running
            through the wizard.
          </p>
        </div>
      )}

      <WizardStepper
        current={step}
        storageReady={Boolean(storageReady)}
        tokenSavedConfirmed={Boolean(token) && tokenSaved && persistenceReady}
        testOk={testStatus === "ok"}
        onGoTo={(target) => {
          // Forward navigation requires the prior step's gate to be met.
          // Backward navigation is always allowed (revisit storage, or
          // re-view the token once it's been shown).
          if (target < step) {
            setStep(target);
            return;
          }
          if (target === 2 && storageReady) setStep(2);
          else if (target === 3 && storageReady && tokenSaved && persistenceReady) setStep(3);
        }}
      />

      <div className="mt-8">
        {step === 1 && <StorageStep onContinue={() => setStep(2)} />}

        {step === 2 && (
          <MintStep
            initialBootstrap={initialBootstrap}
            previewMode={previewMode}
            previewToken={previewToken}
            previewInstanceUrl={previewInstanceUrl}
            recoveryResetActive={recoveryResetActive}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
            storageMode={legacyStorageMode}
            storageEphemeral={legacyStorageEphemeral}
          />
        )}

        {step === 3 && <TestStep durableBackend={durableBackend} onBack={() => setStep(2)} />}
      </div>

      <RecoveryFooter />
    </Shell>
  );
}

// ── Step renderers ─────────────────────────────────────────────────────
// Phase 47 WIRE-01b: renderStepToken + TokenGenerateExplainer +
// TokenDisplayPanel + TokenSaveChecklist + TokenPersistencePanel
// moved to app/welcome/steps/mint.tsx. Step 2 now renders via
// <MintStep />.
//
// Phase 47 WIRE-01a: renderStepStorage + its helper components
// (WelcomeStorageStep / StorageStatusLine / UpstashPrimaryCta /
// UpstashCheckPanel / AdvancedOption / StorageBackendsExplainer)
// moved to app/welcome/steps/storage.tsx. Step 1 now renders via
// <StorageStep />.

// Phase 47 WIRE-01c: renderStepConnect + TestMcpPanel + TokenUsagePanel
// + StarterSkillsPanel + MultiClientNote moved to
// app/welcome/steps/test.tsx. Step 3 now renders via <TestStep />.

// ── Wizard chrome ──────────────────────────────────────────────────────

function WizardStepper({
  current,
  storageReady,
  tokenSavedConfirmed,
  testOk,
  onGoTo,
}: {
  current: WizardStep;
  storageReady: boolean;
  tokenSavedConfirmed: boolean;
  testOk: boolean;
  onGoTo: (step: WizardStep) => void;
}) {
  const steps: { n: WizardStep; label: string; done: boolean }[] = [
    { n: 1, label: "Storage", done: storageReady },
    { n: 2, label: "Auth token", done: tokenSavedConfirmed },
    { n: 3, label: "Connect", done: testOk },
  ];
  return (
    <ol className="flex items-center gap-2 sm:gap-3 flex-wrap" aria-label="Setup progress">
      {steps.map((s, i) => {
        const isCurrent = current === s.n;
        const reachable =
          s.n === 1 ||
          (s.n === 2 && storageReady) ||
          (s.n === 3 && storageReady && tokenSavedConfirmed) ||
          s.n < current; // backward always allowed
        return (
          <li key={s.n} className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => reachable && onGoTo(s.n)}
              disabled={!reachable}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isCurrent
                  ? "bg-blue-500/20 text-blue-200 ring-1 ring-blue-500/40"
                  : s.done
                    ? "text-emerald-300 hover:bg-emerald-950/40"
                    : reachable
                      ? "text-slate-300 hover:bg-slate-800/60"
                      : "text-slate-600 cursor-not-allowed"
              }`}
            >
              <span
                aria-hidden
                className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                  s.done
                    ? "bg-emerald-500 text-white"
                    : isCurrent
                      ? "bg-blue-500 text-white"
                      : "bg-slate-800 text-slate-400"
                }`}
              >
                {s.done ? "✓" : s.n}
              </span>
              <span>{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <span aria-hidden className="text-slate-700 text-xs">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Phase 47 WIRE-01c: StepHeader + StepFooter were orchestrator-local
// helpers for the inline step renderers; each step component now
// declares its own chrome. Removed with the step-3 migration.

// Phase 47 WIRE-01a: UpstashCheckPanel / WelcomeStorageStep /
// StorageStatusLine / UpstashPrimaryCta / AdvancedOption /
// StorageBackendsExplainer moved to app/welcome/steps/storage.tsx.
//
// Phase 47 WIRE-01c: TestMcpPanel / TokenUsagePanel / MultiClientNote
// / StarterSkillsPanel moved to app/welcome/steps/test.tsx.

// Phase 47 WIRE-01d: AlreadyInitializedPanel moved to
// app/welcome/steps/already-initialized.tsx (includes the "Lost your
// token?" details). Orchestrator wraps it in <Shell> + <RecoveryFooter>.

function RecoveryFooter() {
  return (
    <details className="mt-12 text-xs text-slate-600">
      <summary className="cursor-pointer hover:text-slate-400">Locked out? Recover access</summary>
      <p className="mt-2 leading-relaxed">
        If you&apos;ve lost access to this instance, set{" "}
        <code className="text-slate-500">MYMCP_RECOVERY_RESET=1</code> in your Vercel project&apos;s
        environment variables and trigger a redeploy. After the new deployment boots, the bootstrap
        state will be cleared and you can claim this instance again from <code>/welcome</code>.
        Remove <code className="text-slate-500">MYMCP_RECOVERY_RESET</code> after recovery —
        otherwise it resets on every cold start.
      </p>
    </details>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Brand bar: logo + name pinned top-left so the product identity is
          visible throughout the wizard flow. Full-width so the mark anchors
          to the viewport edge instead of shifting with each step's narrow
          content column. */}
      <header className="border-b border-slate-900/80 px-6 py-4">
        <div className="flex items-center gap-2.5 text-white">
          <KebabLogo size={26} className="text-amber-400" />
          <span className="font-mono text-lg font-bold tracking-tight">Kebab MCP</span>
        </div>
      </header>
      {/* The wizard layout needs more horizontal room for the 3-card storage
          chooser; max-w-3xl gives enough breathing room without becoming a
          wide-and-thin desktop layout that's hard to scan. The narrow
          variant (max-w-xl) is kept for early-flow pages like "Generate
          token" where there's only one CTA to focus on. */}
      <div className={`mx-auto px-6 py-12 sm:py-16 ${wide ? "max-w-3xl" : "max-w-xl"}`}>
        <p className="text-xs font-mono text-blue-400 mb-4 tracking-wider uppercase">
          First-run setup
        </p>
        {children}
      </div>
    </div>
  );
}

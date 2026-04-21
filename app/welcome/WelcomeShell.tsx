"use client";

import { useCallback, useEffect, useState } from "react";
import { KebabLogo } from "../components/kebab-logo";
import { McpClientSnippets } from "../components/mcp-client-snippets";
import { extractTokenFromInput } from "@/core/welcome-url-parser";
import {
  WelcomeStateProvider,
  useWelcomeDispatch,
  useWelcomeState,
  type WelcomeState,
} from "./WelcomeStateContext";
import { StorageStep } from "./steps/storage";
import { MintStep } from "./steps/mint";

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

  const [claim, setClaim] = useState<ClaimStatus>(previewMode ? "claimer" : "loading");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [skipTest, setSkipTest] = useState(false);

  // Step 1: claim the instance. The previous auto-init-on-bootstrap
  // branch now lives inside <MintStep /> (Phase 47 WIRE-01b), which
  // fires mint.mint() on mount when `initialBootstrap && state.token === null`.
  useEffect(() => {
    if (previewMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/welcome/claim", { method: "POST" });
        const data = (await res.json()) as { status: ClaimStatus };
        if (cancelled) return;
        setClaim(data.status);
      } catch {
        if (!cancelled) {
          dispatch({ type: "ERROR_SET", error: "Could not reach this instance. Try refreshing." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewMode, dispatch]);

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
  const instanceUrl = reducerState.instanceUrl;
  const permanent = reducerState.permanent;
  const tokenSaved = reducerState.tokenSaved;

  const runMcpTest = useCallback(async () => {
    if (!token) return;
    setTestStatus("testing");
    setTestError(null);
    try {
      const res = await fetch("/api/welcome/test-mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setTestStatus("ok");
      } else {
        setTestStatus("fail");
        setTestError(data.error || "MCP test failed");
      }
    } catch {
      setTestStatus("fail");
      setTestError("Network error");
    }
  }, [token]);

  // ── Render branches ─────────────────────────────────────────────────

  if (claim === "loading") {
    return (
      <Shell>
        <p className="text-slate-400">Connecting to this instance…</p>
      </Shell>
    );
  }

  if (claim === "already-initialized") {
    return <AlreadyInitializedPanel />;
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

        {step === 3 &&
          renderStepConnect({
            token,
            instanceUrl,
            persistenceReady,
            testStatus,
            testError,
            runMcpTest,
            skipTest,
            setSkipTest,
            onBack: () => setStep(2),
          })}
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

function renderStepConnect(props: {
  token: string | null;
  instanceUrl: string;
  persistenceReady: boolean;
  testStatus: "idle" | "testing" | "ok" | "fail";
  testError: string | null;
  runMcpTest: () => void;
  skipTest: boolean;
  setSkipTest: (v: boolean) => void;
  onBack: () => void;
}) {
  const {
    token,
    instanceUrl,
    persistenceReady,
    testStatus,
    testError,
    runMcpTest,
    skipTest,
    setSkipTest,
    onBack,
  } = props;
  // persistenceReady means "token is durable" — either permanent (Vercel
  // env var via auto-magic) OR KV/file-backed (survives cold starts on
  // its own). Both are safe to hand off to an MCP client. skipTest only
  // bypasses the probe, not the persistence gate.
  const canContinue = persistenceReady && (testStatus === "ok" || skipTest);

  return (
    <section>
      <StepHeader
        title="Connect your AI client"
        subtitle="Add Kebab MCP to your client's MCP server config, then verify it works."
      />

      {token && <TokenUsagePanel token={token} instanceUrl={instanceUrl} />}
      <MultiClientNote />

      <TestMcpPanel
        persistenceReady={persistenceReady}
        testStatus={testStatus}
        testError={testError}
        runMcpTest={runMcpTest}
      />

      {token && <StarterSkillsPanel />}

      <StepFooter
        secondary={{ label: "← Auth token", onClick: onBack }}
        primary={{
          label: canContinue ? "Open dashboard →" : "Test your MCP connection first",
          enabled: canContinue,
          // Pass the token as `?token=` so the middleware sets the
          // `mymcp_admin_token` cookie on the first hit. Without this,
          // /config is admin-gated and returns 401 the moment we land
          // — the user finishes welcome only to be told "Unauthorized".
          // The middleware redirects to a cookied URL after validating,
          // so the token is in the address bar for one request tops.
          href: canContinue && token ? `/config?token=${encodeURIComponent(token)}` : undefined,
        }}
        tertiary={
          !canContinue && !skipTest
            ? {
                label: "Skip test and continue anyway",
                onClick: () => setSkipTest(true),
              }
            : undefined
        }
      />
    </section>
  );
}

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

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">{title}</h1>
      <p className="text-sm text-slate-400 leading-relaxed">{subtitle}</p>
    </header>
  );
}

function StepFooter({
  primary,
  secondary,
  tertiary,
}: {
  primary: { label: string; enabled: boolean; onClick?: () => void; href?: string };
  secondary?: { label: string; onClick: () => void };
  tertiary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        {secondary && (
          <button
            type="button"
            onClick={secondary.onClick}
            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1.5"
          >
            {secondary.label}
          </button>
        )}
        {tertiary && (
          <button
            type="button"
            onClick={tertiary.onClick}
            className="text-xs text-slate-600 hover:text-slate-400 underline"
          >
            {tertiary.label}
          </button>
        )}
      </div>
      {primary.href ? (
        <a
          href={primary.enabled ? primary.href : undefined}
          aria-disabled={!primary.enabled}
          onClick={(e) => {
            if (!primary.enabled) e.preventDefault();
          }}
          className={`inline-block px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
            primary.enabled
              ? "bg-blue-500 hover:bg-blue-400 text-white"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          {primary.label}
        </a>
      ) : (
        <button
          type="button"
          onClick={primary.enabled ? primary.onClick : undefined}
          disabled={!primary.enabled}
          className={`inline-block px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
            primary.enabled
              ? "bg-blue-500 hover:bg-blue-400 text-white cursor-pointer"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          {primary.label}
        </button>
      )}
    </div>
  );
}

// Phase 47 WIRE-01a: UpstashCheckPanel / WelcomeStorageStep /
// StorageStatusLine / UpstashPrimaryCta / AdvancedOption /
// StorageBackendsExplainer moved to app/welcome/steps/storage.tsx.

function TestMcpPanel({
  persistenceReady,
  testStatus,
  testError,
  runMcpTest,
}: {
  persistenceReady: boolean;
  testStatus: "idle" | "testing" | "ok" | "fail";
  testError: string | null;
  runMcpTest: () => void;
}) {
  return (
    <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <p className="text-sm font-semibold text-white mb-1">Verify your install</p>
      <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
        Test that your token authenticates against <code className="font-mono">/api/mcp</code> on
        this instance. Once it passes, the dashboard unlocks.
      </p>

      <ol className="space-y-2 mb-4 text-xs">
        <li className="flex items-center gap-2">
          <span aria-hidden>{persistenceReady ? "✓" : "⏳"}</span>
          <span className={persistenceReady ? "text-emerald-300" : "text-amber-300"}>
            {persistenceReady
              ? "Token persisted (durable across cold starts)"
              : "Waiting for Vercel redeploy (auto-polling)…"}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden>{testStatus === "ok" ? "✓" : testStatus === "fail" ? "✗" : "□"}</span>
          <span
            className={
              testStatus === "ok"
                ? "text-emerald-300"
                : testStatus === "fail"
                  ? "text-red-300"
                  : "text-slate-400"
            }
          >
            {testStatus === "idle" && "MCP endpoint not tested yet"}
            {testStatus === "testing" && "Testing MCP endpoint…"}
            {testStatus === "ok" && "MCP endpoint responded — install confirmed"}
            {testStatus === "fail" && `Test failed: ${testError ?? "unknown error"}`}
          </span>
        </li>
      </ol>

      <button
        type="button"
        onClick={runMcpTest}
        disabled={!persistenceReady || testStatus === "testing"}
        className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 px-4 py-2 rounded-md text-xs font-semibold transition-colors"
      >
        {testStatus === "testing"
          ? "Testing…"
          : testStatus === "ok"
            ? "Re-run test"
            : "Test MCP connection"}
      </button>
      {!persistenceReady && (
        <span className="ml-3 text-[11px] text-slate-600">
          (enabled once persistence is confirmed)
        </span>
      )}
    </div>
  );
}

function TokenUsagePanel({ token, instanceUrl }: { token: string; instanceUrl: string }) {
  const baseUrl = instanceUrl || "https://YOUR-INSTANCE.vercel.app";

  return (
    <div className="mb-8 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <p className="text-sm font-semibold text-white mb-3">How to use this token</p>
      <McpClientSnippets baseUrl={baseUrl} token={token} theme="welcome" />
    </div>
  );
}

interface StarterSkill {
  id: string;
  name: string;
  description: string;
  icon: string;
}

function StarterSkillsPanel() {
  const [skills, setSkills] = useState<StarterSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/welcome/starter-skills", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = (await res.json()) as { skills: StarterSkill[] };
        if (!cancelled) {
          setSkills(data.skills || []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/welcome/starter-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setInstalled((s) => {
          const next = new Set(s);
          next.add(id);
          return next;
        });
      } else {
        setError(data.error || "Install failed");
      }
    } catch {
      setError("Network error");
    }
    setBusy(null);
  };

  if (loading) return null;
  if (skills.length === 0) return null;

  return (
    <div className="mb-8 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
        <p className="text-sm font-semibold text-white">Or skip credentials — start with a skill</p>
        <span className="text-[11px] text-slate-500">No connector setup required</span>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
        Skills are reusable prompt templates exposed to your AI client as MCP tools. These three
        starters work in any client without needing Google, Notion, GitHub, or any other
        credentials. Install one now to feel the value, then come back to set up real connectors
        when you&apos;re ready.
      </p>
      <ul className="space-y-2">
        {skills.map((s) => {
          const done = installed.has(s.id);
          return (
            <li
              key={s.id}
              className="flex items-start gap-3 rounded-md border border-slate-800 bg-slate-950 p-3"
            >
              <span className="text-xl leading-none mt-0.5" aria-hidden>
                {s.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">
                  <code className="font-mono text-blue-300">skill_{s.name}</code>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">{s.description}</p>
              </div>
              <button
                type="button"
                onClick={() => !done && install(s.id)}
                disabled={done || busy === s.id}
                className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  done
                    ? "bg-emerald-900/60 text-emerald-300 cursor-default"
                    : "bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-50"
                }`}
              >
                {done ? "Installed ✓" : busy === s.id ? "Installing…" : "Install"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="mt-3 text-[11px] text-red-300">
          {error} — you can also add starter skills later from /config → Skills.
        </p>
      )}
    </div>
  );
}

function MultiClientNote() {
  return (
    <div className="mb-8 rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-3">
      <p className="text-xs font-semibold text-slate-300 mb-1">One token, any number of clients</p>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        The same token works in <strong className="text-slate-300">every</strong> MCP client —
        Claude Desktop, Claude Code, Cursor, ChatGPT, etc. Just paste it everywhere. Use multiple
        comma-separated tokens (in the{" "}
        <code className="font-mono text-slate-400">MCP_AUTH_TOKEN</code> env var) only if you want
        to revoke one client without breaking the others.
      </p>
    </div>
  );
}

/**
 * Shown when the caller lands on /welcome but claim returns
 * "already-initialized" (the server sees a durable token). We can't
 * forward to /config automatically because middleware admin-gates it
 * and we don't have the cookie yet — but we can accept the user's
 * saved token and hand off via `?token=`, which the middleware turns
 * into a `mymcp_admin_token` cookie + clean redirect.
 *
 * Without this form, the link back to /config produces a bare 401 at
 * the very end of an otherwise-smooth flow.
 */
// Note: extractTokenFromInput lives in `src/core/welcome-url-parser.ts`
// (extracted in Phase 45 Task 1 / UX-02a). It's imported at the top of
// this file so the regression suite can reach it directly instead of
// maintaining a parallel re-implementation.

function AlreadyInitializedPanel() {
  const [tokenInput, setTokenInput] = useState("");
  const extracted = extractTokenFromInput(tokenInput);
  const href = extracted ? `/config?token=${encodeURIComponent(extracted)}` : undefined;
  const inputLooksLikeUrl = /^https?:\/\//i.test(tokenInput.trim());
  return (
    <Shell>
      <h1 className="text-2xl font-bold text-white mb-2">Already initialized</h1>
      <p className="text-slate-400 mb-6 leading-relaxed">
        This instance has a durable token — setup is done. Paste your saved token OR the full MCP
        URL below to unlock the dashboard. We&apos;ll set the cookie and strip the token from the
        URL on the next hop so nothing leaks into your browser history.
      </p>
      <label className="block mb-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
        Your auth token (or full MCP URL)
      </label>
      <input
        type="password"
        value={tokenInput}
        onChange={(e) => setTokenInput(e.target.value)}
        placeholder="64-char hex OR https://…/api/mcp?token=…"
        autoComplete="off"
        spellCheck={false}
        className="w-full font-mono text-sm bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-blue-200 focus:outline-none focus:border-blue-600 mb-2"
      />
      {inputLooksLikeUrl && extracted && (
        <p className="text-[11px] text-emerald-400 mb-4">
          ✓ Detected MCP URL — token extracted from the <code className="font-mono">?token=</code>{" "}
          parameter.
        </p>
      )}
      {inputLooksLikeUrl && !extracted && (
        <p className="text-[11px] text-amber-400 mb-4">
          URL detected but no <code className="font-mono">?token=</code> parameter found — paste the
          token directly, or the full URL that contains it.
        </p>
      )}
      {!inputLooksLikeUrl && <div className="mb-4" />}
      <a
        href={href}
        aria-disabled={!href}
        onClick={(e) => {
          if (!href) e.preventDefault();
        }}
        className={`inline-block px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
          href
            ? "bg-blue-500 hover:bg-blue-400 text-white"
            : "bg-slate-800 text-slate-500 cursor-not-allowed"
        }`}
      >
        Open dashboard →
      </a>
      <details className="mt-8 text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-300">Lost your token?</summary>
        <p className="mt-2 leading-relaxed">
          Check the password manager where you saved it during /welcome, or look for{" "}
          <code className="font-mono">MCP_AUTH_TOKEN</code> in your Vercel project env vars if
          auto-magic wrote it. If it&apos;s truly gone, use the Recover-access flow below to wipe
          state and mint a new one — just remember any MCP clients still using the old token will
          need to be updated.
        </p>
      </details>
      <RecoveryFooter />
    </Shell>
  );
}

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

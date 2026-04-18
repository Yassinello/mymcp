"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { McpClientSnippets } from "../components/mcp-client-snippets";

type ClaimStatus = "loading" | "new" | "claimer" | "claimed-by-other" | "already-initialized";

interface InitResponse {
  ok: boolean;
  token: string;
  instanceUrl: string;
  autoMagic?: boolean;
  envWritten?: boolean;
  redeployTriggered?: boolean;
  redeployError?: string;
}

interface AutoMagicState {
  autoMagic: boolean;
  envWritten: boolean;
  redeployTriggered: boolean;
  redeployError?: string;
}

interface StatusResponse {
  initialized: boolean;
  permanent: boolean;
  isBootstrap: boolean;
}

interface WelcomeClientProps {
  initialBootstrap: boolean;
  previewMode?: boolean;
  previewToken?: string;
  previewInstanceUrl?: string;
}

type StorageMode = "kv" | "file" | "static" | "kv-degraded";

interface StorageStatus {
  mode: StorageMode;
  reason: string;
  dataDir: string | null;
  kvUrl: string | null;
  error: string | null;
  /** True only for file mode on Vercel /tmp — saves vanish on cold start. */
  ephemeral?: boolean;
  /** ISO timestamp from the server — used by the UI to show "last checked X seconds ago". */
  detectedAt?: string;
}

type WizardStep = 1 | 2 | 3;

type AckValue = "static" | "ephemeral" | null;
/**
 * Cookie name is versioned. v2 used `mymcp.storage.ack` with boolean "1"
 * (always meant static-mode ack, because v2 didn't differentiate
 * ephemeral). v3 uses `mymcp.storage.ack.v3` with semantic values. V2
 * cookies are explicitly NOT honored post-upgrade: the v2 → v3 UX is
 * materially different (3-card educational view, ephemeral-aware), so
 * users deserve to see the new flow once. The old cookie is also
 * cleared on first v3 mount to avoid ambiguity.
 */
const ACK_COOKIE = "mymcp.storage.ack.v3";
const LEGACY_ACK_COOKIE = "mymcp.storage.ack";

function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Persist the user's acknowledgment of a non-ideal storage mode.
 *
 *   - "static" → user explicitly chose env-vars-only (no runtime saves).
 *   - "ephemeral" → user knows Vercel /tmp is temporary and accepts it.
 *
 * Scoped to the MODE it was given in: if the instance later flips to a
 * different non-ideal mode, the user is re-prompted because it's a
 * different decision. Cookie + localStorage for durability under strict
 * browser privacy settings (Brave shields, Safari ITP).
 */
function readAck(): AckValue {
  if (typeof document === "undefined") return null;
  for (const raw of document.cookie.split(";")) {
    const c = raw.trim();
    if (c.startsWith(`${ACK_COOKIE}=`)) {
      const value = c.slice(ACK_COOKIE.length + 1);
      if (value === "static" || value === "ephemeral") return value;
    }
  }
  try {
    const ls = window.localStorage.getItem(ACK_COOKIE);
    if (ls === "static" || ls === "ephemeral") return ls as AckValue;
  } catch {
    // localStorage blocked — fine, cookie is the source of truth
  }
  return null;
}

/**
 * Clear any legacy v2 cookie / localStorage key so it can't silently gate
 * a user on v3 who was v2-acked before the UX overhaul.
 */
function purgeLegacyAck(): void {
  deleteCookie(LEGACY_ACK_COOKIE);
  try {
    window.localStorage.removeItem(LEGACY_ACK_COOKIE);
  } catch {
    // ignore
  }
}

function writeAck(value: "static" | "ephemeral"): { persisted: boolean } {
  if (typeof document === "undefined") return { persisted: false };
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const secureFlag = isHttps ? "; Secure" : "";
  // Shorter TTL than v2 (30 days instead of 1 year). Storage modes change
  // more often than users expect — an instance moved between deploys, a
  // user set up Upstash and forgot. Forcing a re-confirm once a month
  // catches stale acks that misrepresent the current decision.
  document.cookie = `${ACK_COOKIE}=${value}; path=/; max-age=2592000; samesite=lax${secureFlag}`;
  const cookieOk = document.cookie.split(";").some((c) => c.trim() === `${ACK_COOKIE}=${value}`);
  let storageOk: boolean;
  try {
    window.localStorage.setItem(ACK_COOKIE, value);
    storageOk = window.localStorage.getItem(ACK_COOKIE) === value;
  } catch {
    storageOk = false;
  }
  return { persisted: cookieOk || storageOk };
}

/** Remove the current ack. Called when the user transitions to a healthy mode. */
function clearAck(): void {
  deleteCookie(ACK_COOKIE);
  try {
    window.localStorage.removeItem(ACK_COOKIE);
  } catch {
    // ignore
  }
}

export default function WelcomeClient({
  initialBootstrap,
  previewMode = false,
  previewToken = "",
  previewInstanceUrl = "",
}: WelcomeClientProps) {
  const [claim, setClaim] = useState<ClaimStatus>(previewMode ? "claimer" : "loading");
  const [token, setToken] = useState<string | null>(previewMode ? previewToken : null);
  const [instanceUrl, setInstanceUrl] = useState<string>(previewMode ? previewInstanceUrl : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [permanent, setPermanent] = useState(previewMode);
  const [autoMagicState, setAutoMagicState] = useState<AutoMagicState | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [skipTest, setSkipTest] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [storageChecking, setStorageChecking] = useState(false);
  const [ack, setAck] = useState<AckValue>(null);
  const [ackPersisted, setAckPersisted] = useState(true);
  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  /**
   * Active "Upstash setup in progress" mode. Triggered when the user clicks
   * "I added Upstash — recheck" in step 2. While true, we auto-poll the
   * detection endpoint every 5s for 120s instead of the ambient 20s rhythm,
   * showing a visible countdown so the user knows we're actively checking
   * for Vercel's redeploy to land. Without this, the user clicked "recheck"
   * once, saw nothing change, and assumed the button was broken.
   */
  const [upstashCheckActive, setUpstashCheckActive] = useState(false);
  const [upstashCheckSecondsLeft, setUpstashCheckSecondsLeft] = useState(0);
  const [lastCheckOutcome, setLastCheckOutcome] = useState<
    | { kind: "idle" }
    | { kind: "no-change"; at: number }
    | { kind: "mode-changed"; from: StorageMode; to: StorageMode; at: number }
    | { kind: "timeout"; at: number }
  >({ kind: "idle" });

  // Hydrate ack flag from cookie/localStorage on mount (avoid SSR mismatch by
  // reading post-mount). Also nuke any leftover v2 cookie — v3 has a
  // materially different UX and a v2-acked user should see it at least once.
  useEffect(() => {
    purgeLegacyAck();
    setAck(readAck());
  }, []);

  // Auto-clear ack when the mode transitions to a healthy state. If the
  // user acks ephemeral, then sets up Upstash (mode becomes kv), then later
  // removes Upstash and drops to static, we want them re-prompted — not
  // silently ready because of a stale ephemeral ack from six months ago.
  useEffect(() => {
    if (!storageStatus) return;
    const healthyMode =
      storageStatus.mode === "kv" || (storageStatus.mode === "file" && !storageStatus.ephemeral);
    if (healthyMode && ack !== null) {
      clearAck();
      setAck(null);
    }
  }, [storageStatus, ack]);

  // Step 1: claim the instance. If we re-enter with bootstrap already active
  // (user came back to /welcome before the redeploy), auto-call init so we
  // can re-display the token without forcing them to click again. /init is
  // idempotent and returns the existing token.
  useEffect(() => {
    if (previewMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/welcome/claim", { method: "POST" });
        const data = (await res.json()) as { status: ClaimStatus };
        if (cancelled) return;
        setClaim(data.status);
        if (
          !cancelled &&
          initialBootstrap &&
          (data.status === "claimer" || data.status === "new")
        ) {
          try {
            const initRes = await fetch("/api/welcome/init", { method: "POST" });
            const initData = (await initRes.json()) as InitResponse | { error: string };
            if (!cancelled && initRes.ok && "token" in initData) {
              setToken(initData.token);
              setInstanceUrl(initData.instanceUrl || window.location.origin);
              setAutoMagicState({
                autoMagic: Boolean(initData.autoMagic),
                envWritten: Boolean(initData.envWritten),
                redeployTriggered: Boolean(initData.redeployTriggered),
                redeployError: initData.redeployError,
              });
            }
          } catch {
            // Silent — user can still click "Initialize" manually below.
          }
        }
      } catch {
        if (!cancelled) setError("Could not reach this instance. Try refreshing.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialBootstrap, previewMode]);

  // Poll status to detect "permanent" state (env var set in Vercel + redeployed).
  useEffect(() => {
    if (previewMode) return;
    if (permanent) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/welcome/status");
        const data = (await res.json()) as StatusResponse;
        if (data.permanent) setPermanent(true);
      } catch {
        // Ignore transient errors.
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [permanent, previewMode]);

  // Load the unified storage mode (kv / file / static / kv-degraded).
  // This replaces the legacy isolated "Upstash configured?" check and feeds
  // the welcome storage step + the MCP-client step list.
  const [storageFailures, setStorageFailures] = useState(0);
  const loadStorageStatus = useCallback(async (force = false) => {
    setStorageChecking(true);
    try {
      const res = await fetch(`/api/storage/status${force ? "?force=1" : ""}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setStorageFailures((n) => n + 1);
        return;
      }
      const data = (await res.json()) as StorageStatus;
      setStorageStatus(data);
      setStorageFailures(0);
    } catch {
      // Count failures so the UI can offer a "continue anyway" escape
      // hatch after repeated detection errors (network partition, 500
      // loop). Without this, a user with a flaky network is stuck on
      // Welcome with the Continue button permanently disabled.
      setStorageFailures((n) => n + 1);
    } finally {
      setStorageChecking(false);
    }
  }, []);

  // Initial load on mount, refresh after token issued (so we re-fetch with
  // bearer cookie set by /init), and auto-refresh every 20s while the page
  // is open and the user hasn't yet reached a settled mode.
  useEffect(() => {
    void loadStorageStatus(false);
  }, [loadStorageStatus, token]);

  useEffect(() => {
    // Ambient polling — 20s rhythm while in transient (non-settled) modes.
    // The active "Upstash setup in progress" mode owns its own faster poll
    // (5s, see effect below) so when both are conditional-true we'd skip
    // this one to avoid duplicate fetches.
    if (upstashCheckActive) return;
    if (!storageStatus) return;
    const { mode, ephemeral } = storageStatus;
    if (mode === "kv") return;
    if (mode === "file" && !ephemeral) return;
    if (mode === "file" && ephemeral && ack === "ephemeral") return;
    if (mode === "static" && ack === "static") return;
    const id = setInterval(() => loadStorageStatus(true), 20_000);
    return () => clearInterval(id);
  }, [storageStatus, ack, loadStorageStatus, upstashCheckActive]);

  // Active Upstash-setup polling — split across three single-purpose
  // effects to avoid React setState-in-updater anti-patterns and to keep
  // each concern testable in isolation.
  //
  // Effect 1: 1 Hz countdown decrement. Pure state update, no side effects.
  // Effect 2: 5 s polling cadence — separate setInterval, fires the fetch.
  // Effect 3: timeout watcher — when countdown hits 0, close the loop.
  //
  // Why three effects: previously a single setInterval(1000ms) tried to do
  // all three jobs inside a setState updater function (`setSecondsLeft(prev
  // => { ... fire side-effects ... })`). React updaters must be pure and
  // can be invoked twice under StrictMode/concurrent rendering, which would
  // double-fire timeout/poll side-effects. Splitting separates the pure
  // tick from the side-effect-bearing reactions.
  useEffect(() => {
    if (!upstashCheckActive) return;
    const id = setInterval(() => {
      setUpstashCheckSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [upstashCheckActive]);

  useEffect(() => {
    if (!upstashCheckActive) return;
    // Poll cadence — 5s. The first fetch fires at t=5s, NOT immediately.
    // Vercel takes 60+ seconds to redeploy after Upstash integration; an
    // immediate fetch gives no useful information and (combined with the
    // mode-change effect below) caused a spurious "Upstash not detected
    // yet" flash at t=~0.5s, making the user think the button was broken.
    const id = setInterval(() => loadStorageStatus(true), 5000);
    return () => clearInterval(id);
  }, [upstashCheckActive, loadStorageStatus]);

  useEffect(() => {
    if (!upstashCheckActive) return;
    if (upstashCheckSecondsLeft > 0) return;
    // Timeout — close the loop. Use a functional setState so a successful
    // mode-change that landed in the SAME render batch isn't overwritten
    // by the timeout outcome. Order matters: clear active flag first so
    // subsequent effects don't keep firing.
    setUpstashCheckActive(false);
    setLastCheckOutcome((prev) =>
      prev.kind === "mode-changed" && prev.to === "kv" ? prev : { kind: "timeout", at: Date.now() }
    );
  }, [upstashCheckSecondsLeft, upstashCheckActive]);

  // Detect mode transition (e.g., file-ephemeral → kv after Upstash setup
  // completes). Depends ONLY on `storageStatus` so the effect fires only
  // when a fetch actually completed (storageStatus reference changes).
  // We read `upstashCheckActive` via a ref to avoid spurious re-runs when
  // the user toggles the active loop — a previous version depended on
  // both, which caused the no-change branch to fire the instant
  // startUpstashCheck flipped the flag, even though no fetch had landed.
  const prevModeRef = useRef<StorageMode | null>(null);
  const upstashActiveRef = useRef(upstashCheckActive);
  useEffect(() => {
    upstashActiveRef.current = upstashCheckActive;
  }, [upstashCheckActive]);
  useEffect(() => {
    if (!storageStatus) return;
    const prev = prevModeRef.current;
    const curr = storageStatus.mode;
    if (prev === null) {
      // First load — record current mode but don't surface any outcome.
    } else if (prev !== curr) {
      setLastCheckOutcome({ kind: "mode-changed", from: prev, to: curr, at: Date.now() });
      if (upstashActiveRef.current && curr === "kv") {
        setUpstashCheckActive(false);
      }
    } else if (upstashActiveRef.current) {
      // Same mode after a fetch during active upstash setup — surface
      // "still waiting" so the user knows we DID just check.
      setLastCheckOutcome({ kind: "no-change", at: Date.now() });
    }
    prevModeRef.current = curr;
  }, [storageStatus]);

  const startUpstashCheck = useCallback(() => {
    // Reset outcome so any stale "no-change" or "timeout" from a previous
    // session disappears. The first poll fires at t=5s — no immediate
    // fetch, because Vercel takes 60+ seconds to redeploy after Upstash
    // integration and an immediate fetch was producing a confusing "not
    // detected yet" flash at t=0.5s.
    setLastCheckOutcome({ kind: "idle" });
    setUpstashCheckSecondsLeft(120);
    setUpstashCheckActive(true);
  }, []);

  const stopUpstashCheck = useCallback(() => {
    setUpstashCheckActive(false);
  }, []);

  // No auto-skip step 1: removed because it could yank the token mid-read
  // for users on a fast Vercel deploy. Re-entering users who already have
  // a permanent token are routed to /config via the "already-initialized"
  // claim branch (line ~507) and never see the wizard at all, so manual
  // Continue on step 1 is the right behavior for the only path that
  // reaches it (first-time setup).

  const acknowledge = useCallback((value: "static" | "ephemeral") => {
    const { persisted } = writeAck(value);
    setAckPersisted(persisted);
    setAck(value);
  }, []);

  // "Ready" = user has a durable storage strategy. KV always ready. File
  // only ready when non-ephemeral OR when user explicitly acked ephemeral.
  // Static only ready when acked. Degraded never ready. Also: if we've
  // failed to detect the mode 3+ times in a row, treat as ready so the
  // user isn't trapped on welcome by a flaky network — server-side saves
  // still validate independently.
  const detectionTrapped = storageStatus === null && storageFailures >= 3;
  const storageReady =
    storageStatus?.mode === "kv" ||
    (storageStatus?.mode === "file" && !storageStatus.ephemeral) ||
    (storageStatus?.mode === "file" && storageStatus.ephemeral && ack === "ephemeral") ||
    (storageStatus?.mode === "static" && ack === "static") ||
    detectionTrapped;

  // Ack/mode mismatch: an existing ack stored for a different non-ideal
  // mode (e.g. user acked "static" in a previous session, instance later
  // flipped to file-ephemeral). storageReady will correctly gate them, but
  // we owe them a hint explaining why the "Continue" button is greyed out
  // despite a previous ack.
  const ackMismatch = Boolean(
    ack !== null &&
    storageStatus &&
    !(storageStatus.mode === "kv") &&
    !(storageStatus.mode === "file" && !storageStatus.ephemeral) &&
    !(storageStatus.mode === "file" && storageStatus.ephemeral && ack === "ephemeral") &&
    !(storageStatus.mode === "static" && ack === "static")
  );

  const initialize = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/welcome/init", { method: "POST" });
      const data = (await res.json()) as InitResponse | { error: string };
      if (!res.ok || !("token" in data)) {
        setError(("error" in data && data.error) || "Initialization failed.");
        return;
      }
      setToken(data.token);
      setInstanceUrl(data.instanceUrl || window.location.origin);
      setAutoMagicState({
        autoMagic: Boolean(data.autoMagic),
        envWritten: Boolean(data.envWritten),
        redeployTriggered: Boolean(data.redeployTriggered),
        redeployError: data.redeployError,
      });
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }, []);

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

  const copyToken = useCallback(async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore.
    }
  }, [token]);

  // Vercel doesn't expose precise team/project slugs at runtime without a
  // VERCEL_TOKEN — we link to the dashboard root and let the user navigate.
  const vercelEnvUrl = "https://vercel.com/dashboard";
  const vercelDeployUrl = "https://vercel.com/dashboard";

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
        <h1 className="text-2xl font-bold text-white mb-2">Already initialized</h1>
        <p className="text-slate-400 mb-6">
          This instance has a permanent token. Head to the dashboard.
        </p>
        <a
          href="/config"
          className="inline-block bg-blue-500 hover:bg-blue-400 text-white px-5 py-2.5 rounded-lg font-semibold text-sm"
        >
          Open dashboard →
        </a>
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

  // claim === "new" or "claimer" — allow init.
  if (!token && !initialBootstrap) {
    return (
      <Shell>
        <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">Welcome to Kebab MCP</h1>
        <p className="text-slate-400 mb-8 leading-relaxed">
          Click below to generate your permanent auth token and unlock this instance. The token will
          be shown once — save it somewhere safe.
        </p>
        {error && (
          <div className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={initialize}
          disabled={busy}
          className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-semibold text-sm transition-colors"
        >
          {busy ? "Generating…" : "Initialize this instance"}
        </button>
        <a href="/config" className="block mt-4 text-sm text-slate-500 hover:text-slate-300">
          Or explore the dashboard first →
        </a>
        <RecoveryFooter />
      </Shell>
    );
  }

  // ── Token-visible state: 3-step wizard ─────────────────────────────
  // Step 1: Auth token (token reveal + Vercel deploy status).
  // Step 2: Storage (the 3-card chooser, ack, upstash setup with active polling).
  // Step 3: Connect (snippet, MCP test, optional starter skill).
  //
  // We split the historically monolithic post-claim render into three
  // focused panels so the user has one job per screen. Step 1 auto-skips
  // when the user re-enters with an already-permanent token (they've
  // already seen and saved the token; landing them back here is friction).
  return (
    <Shell wide>
      {previewMode && (
        <div className="mb-6 rounded-lg border border-purple-800 bg-purple-950/40 px-4 py-3 text-sm text-purple-200">
          <strong className="font-semibold">Preview mode</strong> — read-only rendering against your
          live instance. No state is mutated. Close this tab when done.
        </div>
      )}

      <WizardStepper
        current={step}
        permanent={permanent}
        storageReady={Boolean(storageReady)}
        testOk={testStatus === "ok"}
        onGoTo={(target) => {
          // Forward navigation requires the prior step's gate to be met.
          // Backward navigation is always allowed (revisit the token,
          // change storage choice, etc.).
          if (target < step) {
            setStep(target);
            return;
          }
          if (target === 2 && permanent) setStep(2);
          else if (target === 3 && permanent && storageReady) setStep(3);
        }}
      />

      <div className="mt-8">
        {step === 1 &&
          renderStepToken({
            token,
            copied,
            copyToken,
            permanent,
            autoMagicState,
            vercelEnvUrl,
            vercelDeployUrl,
            onContinue: () => setStep(2),
          })}

        {step === 2 &&
          renderStepStorage({
            storageStatus,
            storageChecking,
            ack,
            ackMismatch,
            ackPersisted,
            detectionTrapped,
            upstashCheckActive,
            upstashCheckSecondsLeft,
            lastCheckOutcome,
            startUpstashCheck,
            stopUpstashCheck,
            loadStorageStatus,
            acknowledge,
            onBack: () => setStep(1),
            onContinue: () => setStep(3),
            storageReady: Boolean(storageReady),
          })}

        {step === 3 &&
          renderStepConnect({
            token,
            instanceUrl,
            permanent,
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
// These are plain functions (not React components) called from the main
// render. Pulling them out keeps the WelcomeClient body focused on state
// and routing; the visual structure of each step lives in its own block.

function renderStepToken(props: {
  token: string | null;
  copied: boolean;
  copyToken: () => void;
  permanent: boolean;
  autoMagicState: AutoMagicState | null;
  vercelEnvUrl: string;
  vercelDeployUrl: string;
  onContinue: () => void;
}) {
  const {
    token,
    copied,
    copyToken,
    permanent,
    autoMagicState,
    vercelEnvUrl,
    vercelDeployUrl,
    onContinue,
  } = props;
  const autoMagicSuccess =
    autoMagicState?.autoMagic && autoMagicState.envWritten && autoMagicState.redeployTriggered;
  const autoMagicPartial =
    autoMagicState?.autoMagic && (!autoMagicState.envWritten || !autoMagicState.redeployTriggered);

  return (
    <section>
      <StepHeader
        title="Save your auth token"
        subtitle="This token authenticates every request from your AI client. You'll see it once."
      />

      {token && (
        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Your permanent token
          </p>
          <div className="flex items-start gap-3">
            <code className="flex-1 break-all text-sm text-blue-300 font-mono">{token}</code>
            <button
              type="button"
              onClick={copyToken}
              className="shrink-0 bg-blue-500 hover:bg-blue-400 text-white px-4 py-1.5 rounded text-xs font-semibold"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-amber-300">
            ⚠ Save it in a password manager now — we won&apos;t show it again.
          </p>
        </div>
      )}

      {autoMagicSuccess ? (
        <div className="mb-6 rounded-lg border border-emerald-800 bg-emerald-950/40 p-4">
          <p className="text-sm font-semibold text-emerald-300 mb-2">
            ✓ Token deployed automatically
          </p>
          <ul className="text-xs text-emerald-200/90 space-y-1">
            <li>✓ Generated and saved</li>
            <li>✓ Written to your Vercel env vars</li>
            <li>
              {permanent
                ? "✓ Redeploy complete — instance is live"
                : "⏳ Vercel is redeploying (~60s)…"}
            </li>
          </ul>
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          {autoMagicPartial && (
            <div className="rounded-md border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
              Auto-deploy partially failed
              {autoMagicState?.redeployError ? ` (${autoMagicState.redeployError})` : ""}. Use the
              manual steps below.
            </div>
          )}
          <p className="text-sm font-semibold text-white">Manual deploy steps</p>
          <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside">
            <li>
              Add this token to Vercel as <code className="text-blue-300">MCP_AUTH_TOKEN</code> →{" "}
              <a
                href={vercelEnvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Open Vercel
              </a>
            </li>
            <li>
              Trigger a redeploy from the Deployments tab →{" "}
              <a
                href={vercelDeployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Open Vercel
              </a>
            </li>
            <li>
              {permanent
                ? "✓ Redeploy detected — your instance is now live"
                : "Wait ~60s. We'll detect when it's live."}
            </li>
          </ol>
        </div>
      )}

      <StepFooter
        primary={{
          label: permanent ? "Continue → Storage" : "Waiting for Vercel redeploy…",
          enabled: permanent,
          onClick: onContinue,
        }}
      />
    </section>
  );
}

function renderStepStorage(props: {
  storageStatus: StorageStatus | null;
  storageChecking: boolean;
  ack: AckValue;
  ackMismatch: boolean;
  ackPersisted: boolean;
  detectionTrapped: boolean;
  upstashCheckActive: boolean;
  upstashCheckSecondsLeft: number;
  lastCheckOutcome:
    | { kind: "idle" }
    | { kind: "no-change"; at: number }
    | { kind: "mode-changed"; from: StorageMode; to: StorageMode; at: number }
    | { kind: "timeout"; at: number };
  startUpstashCheck: () => void;
  stopUpstashCheck: () => void;
  loadStorageStatus: (force: boolean) => Promise<void>;
  acknowledge: (value: "static" | "ephemeral") => void;
  onBack: () => void;
  onContinue: () => void;
  storageReady: boolean;
}) {
  const {
    storageStatus,
    storageChecking,
    ack,
    ackMismatch,
    ackPersisted,
    detectionTrapped,
    upstashCheckActive,
    upstashCheckSecondsLeft,
    lastCheckOutcome,
    startUpstashCheck,
    stopUpstashCheck,
    loadStorageStatus,
    acknowledge,
    onBack,
    onContinue,
    storageReady,
  } = props;

  return (
    <section>
      <StepHeader
        title="Where your data lives"
        subtitle="Pick where Kebab MCP saves your credentials, skills, and context. You can change this later from the dashboard."
      />

      {/* Mode-change celebration — shows briefly after Upstash setup completes */}
      {lastCheckOutcome.kind === "mode-changed" && lastCheckOutcome.to === "kv" && (
        <div className="mb-4 rounded-lg border border-emerald-700 bg-emerald-950/50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-200">
            🎉 Upstash detected — your storage is now persistent
          </p>
          <p className="text-[11px] text-emerald-300/80 mt-1">
            Saves from the dashboard will survive cold starts and redeploys. You can continue.
          </p>
        </div>
      )}

      {/* Active upstash setup — visible countdown so the user knows we're checking */}
      {upstashCheckActive && (
        <UpstashCheckPanel
          secondsLeft={upstashCheckSecondsLeft}
          onStop={stopUpstashCheck}
          lastCheckOutcome={lastCheckOutcome}
        />
      )}

      {/* Timeout — happens when 120s elapsed without detecting Upstash */}
      {!upstashCheckActive && lastCheckOutcome.kind === "timeout" && (
        <div className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/30 p-4">
          <p className="text-sm font-semibold text-amber-200 mb-1">
            Still no Upstash detected after 2 minutes
          </p>
          <ul className="text-[11px] text-amber-200/90 list-disc list-inside space-y-0.5 mb-3">
            <li>
              Confirm the integration was added to <strong>this specific project</strong> in Vercel
            </li>
            <li>
              Check{" "}
              <a
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-400"
              >
                Vercel → Deployments
              </a>{" "}
              — the redeploy may have failed
            </li>
            <li>Try a manual recheck below, or pick a different storage option</li>
          </ul>
          <button
            type="button"
            onClick={startUpstashCheck}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Retry Upstash check
          </button>
        </div>
      )}

      {/* Ack mismatch — user previously acked a different mode */}
      {storageStatus && ackMismatch && (
        <div className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
          <strong className="font-semibold">Your previous choice needs re-confirming.</strong> This
          instance&apos;s storage changed since you last acked — pick an option from the cards below
          to continue.
        </div>
      )}

      {storageStatus ? (
        <WelcomeStorageStep
          status={storageStatus}
          checking={storageChecking}
          ack={ack}
          onRecheck={() => loadStorageStatus(true)}
          onAcknowledge={acknowledge}
          onUpstashSetupStart={startUpstashCheck}
          upstashCheckActive={upstashCheckActive}
        />
      ) : (
        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
          Detecting your storage…
        </div>
      )}

      {ack !== null && !ackPersisted && (
        <div className="mb-4 rounded-lg border border-orange-900/60 bg-orange-950/30 px-4 py-3 text-xs text-orange-200">
          <strong className="font-semibold">Your browser blocked our cookie.</strong> Your choice
          will not persist across reloads — re-confirm if you come back, or unblock cookies for this
          origin.
        </div>
      )}

      {detectionTrapped && (
        <div className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/30 p-4 text-xs text-amber-200">
          <p className="font-semibold mb-1">Storage detection failed</p>
          <p className="leading-relaxed mb-2">
            We couldn&apos;t reach <code className="font-mono">/api/storage/status</code> after
            several tries. Continue is unblocked so a flaky network doesn&apos;t trap you here.
          </p>
          <button
            type="button"
            onClick={() => void loadStorageStatus(true)}
            disabled={storageChecking}
            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 px-3 py-1.5 rounded-md text-xs font-semibold"
          >
            {storageChecking ? "Rechecking…" : "Retry detection"}
          </button>
        </div>
      )}

      <StepFooter
        secondary={{ label: "← Token", onClick: onBack }}
        primary={{
          label: storageReady ? "Continue → Connect" : "Pick or acknowledge a storage option",
          enabled: storageReady,
          onClick: onContinue,
        }}
      />
    </section>
  );
}

function renderStepConnect(props: {
  token: string | null;
  instanceUrl: string;
  permanent: boolean;
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
    permanent,
    testStatus,
    testError,
    runMcpTest,
    skipTest,
    setSkipTest,
    onBack,
  } = props;
  // Both branches require permanent — skipTest only bypasses the test
  // probe, not the underlying "is the token actually deployed" gate.
  // Without this, a user on a stale state (token rotated server-side
  // mid-flow) could click skip and reach /config without a working token.
  const canContinue = permanent && (testStatus === "ok" || skipTest);

  return (
    <section>
      <StepHeader
        title="Connect your AI client"
        subtitle="Add Kebab MCP to your client's MCP server config, then verify it works."
      />

      {token && <TokenUsagePanel token={token} instanceUrl={instanceUrl} />}
      <MultiClientNote />

      <TestMcpPanel
        permanent={permanent}
        testStatus={testStatus}
        testError={testError}
        runMcpTest={runMcpTest}
      />

      {token && <StarterSkillsPanel />}

      <StepFooter
        secondary={{ label: "← Storage", onClick: onBack }}
        primary={{
          label: canContinue ? "Open dashboard →" : "Test your MCP connection first",
          enabled: canContinue,
          href: canContinue ? "/config" : undefined,
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
  permanent,
  storageReady,
  testOk,
  onGoTo,
}: {
  current: WizardStep;
  permanent: boolean;
  storageReady: boolean;
  testOk: boolean;
  onGoTo: (step: WizardStep) => void;
}) {
  const steps: { n: WizardStep; label: string; done: boolean }[] = [
    { n: 1, label: "Auth token", done: permanent },
    { n: 2, label: "Storage", done: storageReady },
    { n: 3, label: "Connect", done: testOk },
  ];
  return (
    <ol className="flex items-center gap-2 sm:gap-3 flex-wrap" aria-label="Setup progress">
      {steps.map((s, i) => {
        const isCurrent = current === s.n;
        const reachable =
          s.n === 1 ||
          (s.n === 2 && permanent) ||
          (s.n === 3 && permanent && storageReady) ||
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

/**
 * Active "I added Upstash — checking…" panel. Shows a visible countdown
 * + optional last-outcome message, with an explicit "Stop checking" escape
 * hatch. Closes the v3.5 UX gap where clicking recheck appeared to do
 * nothing — now the user has continuous, obvious feedback.
 */
function UpstashCheckPanel({
  secondsLeft,
  onStop,
  lastCheckOutcome,
}: {
  secondsLeft: number;
  onStop: () => void;
  lastCheckOutcome:
    | { kind: "idle" }
    | { kind: "no-change"; at: number }
    | { kind: "mode-changed"; from: StorageMode; to: StorageMode; at: number }
    | { kind: "timeout"; at: number };
}) {
  const elapsed = 120 - secondsLeft;
  const pct = Math.min(100, Math.max(0, (elapsed / 120) * 100));
  return (
    <div className="mb-4 rounded-lg border border-blue-900/60 bg-blue-950/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-blue-200">
          Detecting Upstash setup… ({Math.floor(secondsLeft / 60)}m {secondsLeft % 60}s left)
        </p>
        <button
          type="button"
          onClick={onStop}
          className="text-[11px] text-slate-400 hover:text-slate-200 underline"
        >
          Stop checking
        </button>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Vercel typically takes 60–90s to redeploy after the Upstash integration lands. We&apos;re
        rechecking every 5s.
        {lastCheckOutcome.kind === "no-change" && (
          <>
            {" "}
            Last check: {new Date(lastCheckOutcome.at).toLocaleTimeString()} — Upstash not detected
            yet.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Full storage configuration panel inside the welcome flow (v3).
 *
 * **Design principle:** the welcome page is the pedagogical moment. Even
 * when detection resolves a mode automatically, we SHOW the three options
 * with tradeoffs so first-time users learn what's available and what they
 * might be giving up. Compact banner-only rendering is fine for the
 * dashboard (settled state), not here.
 *
 * Mode-specific behavior:
 *   - kv → green confirmation + collapsible "See other options"
 *   - file (non-ephemeral, Docker/dev) → green confirmation + collapsible
 *   - file (ephemeral, Vercel /tmp) → AMBER warning + 3 cards always visible
 *     with explicit "Keep temporary (not recommended)" acknowledgment
 *   - static → 3 cards always visible, ack required to continue
 *   - kv-degraded → red error banner (don't show 3 cards — infra broken)
 */
function WelcomeStorageStep({
  status,
  checking,
  ack,
  onRecheck,
  onAcknowledge,
  onUpstashSetupStart,
  upstashCheckActive,
}: {
  status: StorageStatus;
  checking: boolean;
  ack: AckValue;
  onRecheck: () => void;
  onAcknowledge: (value: "static" | "ephemeral") => void;
  /** Called when the user clicks "I added Upstash" — kicks off the active check loop. */
  onUpstashSetupStart: () => void;
  /** Whether the active upstash setup loop is currently running. */
  upstashCheckActive: boolean;
}) {
  if (status.mode === "kv-degraded") {
    return (
      <div className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 p-5">
        <p className="text-sm font-semibold text-red-300 mb-1">KV configured but unreachable</p>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
          We don&apos;t silently downgrade to file storage during a temporary KV outage — that would
          cause data loss when Upstash recovers. Check that your Upstash database is online and your
          token is valid, then click recheck.
        </p>
        {status.error && (
          <p className="text-[11px] font-mono text-red-200 bg-red-950/60 p-2 rounded mb-3">
            {status.error}
          </p>
        )}
        <button
          type="button"
          onClick={onRecheck}
          disabled={checking}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 px-4 py-2 rounded-md text-xs font-semibold"
        >
          {checking ? "Rechecking…" : "Retry detection"}
        </button>
      </div>
    );
  }

  const settled = status.mode === "kv" || (status.mode === "file" && !status.ephemeral);

  return (
    <div className="mb-8 rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      {/* Header: intent + status */}
      {status.mode === "kv" && (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          ✓ Storage ready — Upstash Redis connected. Saves persist instantly across deploys.
        </div>
      )}
      {status.mode === "file" && !status.ephemeral && (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          ✓ Storage ready — file-based at <code className="font-mono">{status.dataDir}</code>. Saves
          persist locally.
        </div>
      )}
      {status.mode === "file" && status.ephemeral && (
        <div className="rounded-md border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          <p className="font-semibold mb-1">
            ⚠ Your storage is temporary — saves will vanish on cold start
          </p>
          <p className="text-[12px] text-amber-200/90 leading-relaxed">
            Vercel reset <code className="font-mono">/tmp</code> on every container recycle
            (typically every 15–30 min of inactivity). Credentials saved from the dashboard{" "}
            <strong>will be silently lost</strong>. Pick a real storage option below.
          </p>
        </div>
      )}
      {status.mode === "static" && (
        <div>
          <p className="text-sm font-semibold text-white mb-1">Choose your storage strategy</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            This instance has no persistent storage configured. Your filesystem is read-only and no
            KV backend is set up. Pick one of the paths below.
          </p>
        </div>
      )}

      {/* 3-card choice layout — always rendered for ephemeral/static,
          collapsible for settled modes (KV / non-ephemeral file). */}
      {settled ? (
        <details>
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200">
            See all storage options
          </summary>
          <div className="mt-3">
            <StorageChoiceCards
              status={status}
              ack={ack}
              checking={checking}
              onAcknowledge={onAcknowledge}
              onUpstashSetupStart={onUpstashSetupStart}
              upstashCheckActive={upstashCheckActive}
            />
          </div>
        </details>
      ) : (
        <StorageChoiceCards
          status={status}
          ack={ack}
          checking={checking}
          onAcknowledge={onAcknowledge}
          onUpstashSetupStart={onUpstashSetupStart}
          upstashCheckActive={upstashCheckActive}
        />
      )}

      <details className="text-[11px] text-slate-500">
        <summary className="cursor-pointer hover:text-slate-300">
          What&apos;s the difference?
        </summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">
          <p>
            <strong className="text-slate-300">Live database (Upstash):</strong> a hosted
            Redis-compatible store. Saves from the dashboard go straight to Upstash and are
            immediately visible to every connector. Works identically on Vercel, Docker, or any
            other deploy. Free tier covers personal use.
          </p>
          <p>
            <strong className="text-slate-300">Local file:</strong> Kebab MCP writes to{" "}
            <code className="font-mono">./data/kv.json</code> and <code>.env</code> on disk. Great
            for Docker with a mounted volume or local dev. Doesn&apos;t work for multi-instance
            deploys because each instance has its own file.
          </p>
          <p>
            <strong className="text-slate-300">Env vars only:</strong> no dashboard saves. Set
            credentials in your deploy environment (Vercel → Settings → Environment Variables),
            redeploy, done. Good for infra-as-code teams who version everything.
          </p>
        </div>
      </details>
    </div>
  );
}

/**
 * 3-card grid surfacing the storage options with tradeoffs. Highlights the
 * current mode with a badge, recommends the best upgrade when the current
 * one is sub-optimal, and exposes exactly one action per card.
 */
function StorageChoiceCards({
  status,
  ack,
  checking,
  onAcknowledge,
  onUpstashSetupStart,
  upstashCheckActive,
}: {
  status: StorageStatus;
  ack: AckValue;
  checking: boolean;
  onAcknowledge: (value: "static" | "ephemeral") => void;
  onUpstashSetupStart: () => void;
  upstashCheckActive: boolean;
}) {
  const isKv = status.mode === "kv";
  const isFile = status.mode === "file";
  const isEphemeral = isFile && Boolean(status.ephemeral);
  const isStatic = status.mode === "static";
  // KV is "recommended" when the user's current mode is sub-optimal:
  // ephemeral file or static. For healthy kv/file, no recommendation badge.
  const kvRecommended = isEphemeral || isStatic;

  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {/* Card 1 — Live database (Upstash) */}
      <Card
        tone={isKv ? "current" : "default"}
        title="Live database"
        subtitle="(Upstash Redis)"
        currentBadge={isKv}
        recommendedBadge={kvRecommended}
      >
        <ul className="text-[11px] text-slate-400 list-disc list-inside space-y-0.5">
          <li>Instant saves from the dashboard</li>
          <li>Survives cold starts &amp; redeploys</li>
          <li>Works on any host (Vercel, Docker, …)</li>
          <li>Free tier available</li>
        </ul>
        {isKv ? (
          <p className="text-[11px] text-emerald-300 font-medium">Active — nothing to do.</p>
        ) : (
          <>
            <ol className="text-[11px] text-slate-400 list-decimal list-inside space-y-0.5">
              <li>
                Open{" "}
                <a
                  href="https://vercel.com/integrations/upstash"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Vercel → Integrations → Upstash
                </a>
              </li>
              <li>Add the integration to this project</li>
              <li>
                Come back and click below — we&apos;ll auto-detect when Vercel finishes redeploying
                (~60–90s).
              </li>
            </ol>
            {/* Use onUpstashSetupStart instead of plain onRecheck so the
                parent kicks off a 120s active polling loop with a visible
                countdown. The v3.5 bug was that plain onRecheck fired ONE
                fetch and showed nothing visible if the answer was the same,
                making the button feel broken. */}
            <button
              type="button"
              onClick={onUpstashSetupStart}
              disabled={upstashCheckActive || checking}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-md text-xs font-semibold"
            >
              {upstashCheckActive
                ? "Detecting Upstash…"
                : checking
                  ? "Rechecking…"
                  : "I added Upstash — start auto-detect"}
            </button>
          </>
        )}
      </Card>

      {/* Card 2 — Local file.
          When ephemeral, the warning badge IS the current-mode indicator;
          showing both emerald "← Your setup" AND amber "⚠ Temporary" was
          visually contradictory (emerald on amber). Suppress the emerald
          current-badge in the ephemeral case. */}
      <Card
        tone={isFile && !isEphemeral ? "current" : isEphemeral ? "warning" : "default"}
        title="Local file"
        subtitle={isEphemeral ? "(serverless /tmp — temporary!)" : "(Docker / dev)"}
        currentBadge={isFile && !isEphemeral}
        warningBadge={isEphemeral}
      >
        {isEphemeral ? (
          <>
            <ul className="text-[11px] text-amber-200 list-disc list-inside space-y-0.5">
              <li className="font-semibold">⚠ Vercel /tmp resets on every cold start</li>
              <li>Saves look like they work, then silently disappear</li>
              <li>Not viable for real use — only fine if you&apos;re actively testing</li>
            </ul>
            <button
              type="button"
              onClick={() => onAcknowledge("ephemeral")}
              disabled={ack === "ephemeral"}
              className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-amber-200 px-3 py-1.5 rounded-md text-xs font-semibold border border-amber-900/60"
            >
              {ack === "ephemeral"
                ? "Acknowledged — saves are temporary"
                : "I understand, keep temporary storage"}
            </button>
          </>
        ) : (
          <>
            <ul className="text-[11px] text-slate-400 list-disc list-inside space-y-0.5">
              <li>Saves persist across restarts (with a mounted volume)</li>
              <li>Good for single-instance Docker or local dev</li>
              <li>Not suited to multi-instance deploys</li>
              <li>Export .env anytime for backup/migration</li>
            </ul>
            {isFile ? (
              <p className="text-[11px] text-emerald-300 font-medium">
                Active at <code className="font-mono">{status.dataDir}</code>.
              </p>
            ) : (
              <p className="text-[11px] text-slate-500">
                Not available on this deploy — filesystem is read-only.
              </p>
            )}
          </>
        )}
      </Card>

      {/* Card 3 — Env vars only */}
      <Card
        tone={isStatic ? "current" : "default"}
        title="Env vars only"
        subtitle="(no runtime saves)"
        currentBadge={isStatic}
      >
        <ul className="text-[11px] text-slate-400 list-disc list-inside space-y-0.5">
          <li>Set credentials in your deploy env</li>
          <li>Each change requires a redeploy</li>
          <li>Dashboard saves disabled (you get .env stub helpers)</li>
          <li>Fits infra-as-code workflows</li>
        </ul>
        {isStatic ? (
          <button
            type="button"
            onClick={() => onAcknowledge("static")}
            disabled={ack === "static"}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-200 px-3 py-1.5 rounded-md text-xs font-semibold"
          >
            {ack === "static" ? "Acknowledged — env-vars only" : "Continue env-vars only"}
          </button>
        ) : (
          <p className="text-[11px] text-slate-500">
            Switch by removing KV and any writable FS, then redeploy. Rarely what you want.
          </p>
        )}
      </Card>
    </div>
  );
}

function Card({
  tone,
  title,
  subtitle,
  currentBadge,
  recommendedBadge,
  warningBadge,
  children,
}: {
  tone: "current" | "warning" | "default";
  title: string;
  subtitle: string;
  currentBadge?: boolean;
  recommendedBadge?: boolean;
  warningBadge?: boolean;
  children: React.ReactNode;
}) {
  const border =
    tone === "current"
      ? "border-emerald-700/80"
      : tone === "warning"
        ? "border-amber-700/80"
        : "border-slate-700";
  const bg =
    tone === "current"
      ? "bg-emerald-950/30"
      : tone === "warning"
        ? "bg-amber-950/30"
        : "bg-slate-950";
  return (
    <div className={`rounded-md border ${border} ${bg} p-4 space-y-2 flex flex-col`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {currentBadge && (
          <span className="text-[9px] font-semibold text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded uppercase tracking-wide">
            ← Your setup
          </span>
        )}
        {recommendedBadge && (
          <span className="text-[9px] font-semibold text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded uppercase tracking-wide">
            ★ Recommended
          </span>
        )}
        {warningBadge && (
          <span className="text-[9px] font-semibold text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded uppercase tracking-wide">
            ⚠ Temporary
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
      <div className="space-y-2 flex-1">{children}</div>
    </div>
  );
}

function TestMcpPanel({
  permanent,
  testStatus,
  testError,
  runMcpTest,
}: {
  permanent: boolean;
  testStatus: "idle" | "testing" | "ok" | "fail";
  testError: string | null;
  runMcpTest: () => void;
}) {
  return (
    <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <p className="text-sm font-semibold text-white mb-1">Verify your install</p>
      <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
        Test that your token authenticates against <code className="font-mono">/api/mcp</code> on
        this instance. The dashboard unlocks only once the redeploy is live <em>and</em> the test
        passes.
      </p>

      <ol className="space-y-2 mb-4 text-xs">
        <li className="flex items-center gap-2">
          <span aria-hidden>{permanent ? "✓" : "⏳"}</span>
          <span className={permanent ? "text-emerald-300" : "text-amber-300"}>
            {permanent
              ? "Permanent token active in Vercel"
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
        disabled={!permanent || testStatus === "testing"}
        className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 px-4 py-2 rounded-md text-xs font-semibold transition-colors"
      >
        {testStatus === "testing"
          ? "Testing…"
          : testStatus === "ok"
            ? "Re-run test"
            : "Test MCP connection"}
      </button>
      {!permanent && (
        <span className="ml-3 text-[11px] text-slate-600">
          (enabled once the redeploy finishes)
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
      {/* The wizard layout needs more horizontal room for the 3-card storage
          chooser; max-w-3xl gives enough breathing room without becoming a
          wide-and-thin desktop layout that's hard to scan. The narrow
          variant (max-w-xl) is kept for early-flow pages like "Generate
          token" where there's only one CTA to focus on. */}
      <div className={`mx-auto px-6 py-12 sm:py-16 ${wide ? "max-w-3xl" : "max-w-xl"}`}>
        <p className="text-xs font-mono text-blue-400 mb-4 tracking-wider uppercase">
          Kebab MCP · First-run setup
        </p>
        {children}
      </div>
    </div>
  );
}

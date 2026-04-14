"use client";

import { useCallback, useEffect, useState } from "react";
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
        <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">Welcome to MyMCP</h1>
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

  // Token visible: either freshly minted or we re-entered with bootstrap active.
  return (
    <Shell wide>
      {previewMode && (
        <div className="mb-6 rounded-lg border border-purple-800 bg-purple-950/40 px-4 py-3 text-sm text-purple-200">
          <strong className="font-semibold">Preview mode</strong> — read-only rendering against your
          live instance. No state is mutated. Close this tab when done.
        </div>
      )}
      {permanent &&
        !(
          autoMagicState?.autoMagic &&
          autoMagicState.envWritten &&
          autoMagicState.redeployTriggered
        ) && (
          <div className="mb-6 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
            Setup complete — your Vercel deployment is now using the permanent token.
          </div>
        )}

      <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">Your auth token</h1>
      <p className="text-slate-400 mb-6 leading-relaxed">
        This is your permanent token.{" "}
        <span className="text-amber-300 font-medium">
          Save it now — you won&apos;t see it again.
        </span>
      </p>

      {token && (
        <div className="mb-8 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-start gap-3">
            <code className="flex-1 break-all text-sm text-blue-300 font-mono">{token}</code>
            <button
              type="button"
              onClick={copyToken}
              className="shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded text-xs font-semibold"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {(() => {
        const autoMagicSuccess =
          autoMagicState?.autoMagic &&
          autoMagicState.envWritten &&
          autoMagicState.redeployTriggered;
        const autoMagicPartial =
          autoMagicState?.autoMagic &&
          (!autoMagicState.envWritten || !autoMagicState.redeployTriggered);

        if (autoMagicSuccess) {
          return (
            <ol className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span className="text-slate-300">Token generated</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span className="text-slate-300">Written to Vercel env vars</span>
              </li>
              <li className="flex items-start gap-3">
                <span
                  className={permanent ? "text-emerald-400 mt-0.5" : "text-amber-400 mt-0.5"}
                  aria-hidden
                >
                  {permanent ? "✓" : "⏳"}
                </span>
                <span className="text-slate-300">
                  {permanent ? "Redeployed — your instance is permanent." : "Redeploying… (~60s)"}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-slate-500 mt-0.5">□</span>
                <span className="text-slate-300">Configure your MCP client (snippet below)</span>
              </li>
            </ol>
          );
        }

        return (
          <>
            {autoMagicPartial && (
              <div className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
                Auto-deploy partially failed
                {autoMagicState?.redeployError ? ` (${autoMagicState.redeployError})` : ""} — fall
                back to manual steps below.
              </div>
            )}
            <ol className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span className="text-slate-300">Token generated</span>
              </li>
              <li className="flex items-start gap-3">
                <span
                  className={permanent ? "text-emerald-400 mt-0.5" : "text-slate-500 mt-0.5"}
                  aria-hidden
                >
                  {permanent ? "✓" : "□"}
                </span>
                <span className="text-slate-300">
                  Add token to Vercel as <code className="text-blue-300">MCP_AUTH_TOKEN</code> →{" "}
                  <a
                    href={vercelEnvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Open Vercel dashboard
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span
                  className={permanent ? "text-emerald-400 mt-0.5" : "text-slate-500 mt-0.5"}
                  aria-hidden
                >
                  {permanent ? "✓" : "□"}
                </span>
                <span className="text-slate-300">
                  Redeploy from the Deployments tab →{" "}
                  <a
                    href={vercelDeployUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Open Vercel dashboard
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-slate-500 mt-0.5">□</span>
                <span className="text-slate-300">Configure your MCP client (snippet below)</span>
              </li>
            </ol>
          </>
        );
      })()}

      {token && <TokenUsagePanel token={token} instanceUrl={instanceUrl} />}
      <MultiClientNote />

      {token && <StarterSkillsPanel />}

      <TestMcpPanel
        permanent={permanent}
        testStatus={testStatus}
        testError={testError}
        runMcpTest={runMcpTest}
      />

      {(() => {
        const canContinue = (permanent && testStatus === "ok") || skipTest;
        return (
          <div className="flex items-center gap-4">
            <a
              href={canContinue ? "/config" : undefined}
              aria-disabled={!canContinue}
              onClick={(e) => {
                if (!canContinue) e.preventDefault();
              }}
              className={`inline-block px-6 py-3 rounded-lg font-semibold text-sm transition-colors ${
                canContinue
                  ? "bg-blue-500 hover:bg-blue-400 text-white cursor-pointer"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              Continue to dashboard →
            </a>
            {!canContinue && !skipTest && (
              <button
                type="button"
                onClick={() => setSkipTest(true)}
                className="text-xs text-slate-600 hover:text-slate-400 underline"
              >
                Skip test and continue anyway
              </button>
            )}
          </div>
        );
      })()}
      <RecoveryFooter />
    </Shell>
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
        <p className="text-sm font-semibold text-white">
          Or skip credentials — start with a skill
        </p>
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
      <div className={`mx-auto px-6 py-20 ${wide ? "max-w-2xl" : "max-w-xl"}`}>
        <p className="text-xs font-mono text-blue-400 mb-4 tracking-wider uppercase">
          MyMCP · First-run setup
        </p>
        {children}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type ClaimStatus = "loading" | "new" | "claimer" | "claimed-by-other" | "already-initialized";

interface InitResponse {
  ok: boolean;
  token: string;
  instanceUrl: string;
}

interface StatusResponse {
  initialized: boolean;
  permanent: boolean;
  isBootstrap: boolean;
}

export default function WelcomeClient({ initialBootstrap }: { initialBootstrap: boolean }) {
  const [claim, setClaim] = useState<ClaimStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [instanceUrl, setInstanceUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [permanent, setPermanent] = useState(false);

  // Step 1: claim the instance. If we re-enter with bootstrap already active
  // (user came back to /welcome before the redeploy), auto-call init so we
  // can re-display the token without forcing them to click again. /init is
  // idempotent and returns the existing token.
  useEffect(() => {
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
  }, [initialBootstrap]);

  // Poll status to detect "permanent" state (env var set in Vercel + redeployed).
  useEffect(() => {
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
  }, [permanent]);

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
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }, []);

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
      </Shell>
    );
  }

  // Token visible: either freshly minted or we re-entered with bootstrap active.
  return (
    <Shell wide>
      {permanent && (
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

      <ol className="space-y-4 mb-8">
        <li className="flex items-start gap-3">
          <span className="text-emerald-400 mt-0.5">✓</span>
          <span className="text-slate-300">Token generated</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-slate-500 mt-0.5">□</span>
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
          <span className="text-slate-500 mt-0.5">□</span>
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
          <button
            type="button"
            onClick={() => setSnippetOpen((v) => !v)}
            className="text-left text-slate-300 hover:text-white"
          >
            Configure Claude Desktop {snippetOpen ? "↑" : "↓"}
          </button>
        </li>
      </ol>

      {snippetOpen && (
        <pre className="mb-8 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300">
          {JSON.stringify(
            {
              mcpServers: {
                mymcp: {
                  url: `${instanceUrl || "https://YOUR-INSTANCE.vercel.app"}/api/mcp`,
                  headers: { Authorization: `Bearer ${token || "<TOKEN>"}` },
                },
              },
            },
            null,
            2
          )}
        </pre>
      )}

      <a
        href="/config"
        className="inline-block bg-blue-500 hover:bg-blue-400 text-white px-6 py-3 rounded-lg font-semibold text-sm"
      >
        Continue to dashboard →
      </a>
    </Shell>
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

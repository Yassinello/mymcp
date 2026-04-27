"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface InitResponse {
  ok: boolean;
  token: string;
  instanceUrl: string;
  autoMagic?: boolean;
  envWritten?: boolean;
  redeployTriggered?: boolean;
  redeployError?: string;
}

interface StatusResponse {
  initialized: boolean;
  permanent: boolean;
  isBootstrap: boolean;
}

type Phase = "idle" | "minted-manual" | "minted-auto";

/**
 * Sticky amber banner shown when the dashboard is rendered in dry-run mode
 * (no MCP_AUTH_TOKEN set; user reached /config via the welcome claim cookie).
 *
 * Lets the user mint a bootstrap token from inside the dashboard. If the
 * Vercel auto-magic path is available (server returns autoMagic=true), the
 * banner auto-deploys and polls for completion. Otherwise it falls back to
 * the manual paste UX.
 */
export function DryRunBanner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(true);
  const [copied, setCopied] = useState(false);
  const [permanent, setPermanent] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll status when in auto-magic phase until it goes permanent.
  useEffect(() => {
    if (phase !== "minted-auto" || permanent) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/welcome/status");
        const data = (await res.json()) as StatusResponse;
        if (data.permanent) {
          setPermanent(true);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch {
        // Ignore transient errors.
      }
    }, 10_000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [phase, permanent]);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/welcome/init", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as InitResponse | { error: string };
      if (!res.ok || !("token" in data)) {
        setError(("error" in data && data.error) || "Initialization failed.");
        return;
      }
      setToken(data.token);
      const autoOk =
        Boolean(data.autoMagic) && Boolean(data.envWritten) && Boolean(data.redeployTriggered);
      setPhase(autoOk ? "minted-auto" : "minted-manual");
      setShown(true);
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

  if (phase === "idle") {
    return (
      <div className="sticky top-0 z-30 border-b-2 border-orange/60 bg-orange/10 px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 text-sm text-orange-dark">
            <span className="font-semibold">No auth token yet</span> — this instance has no{" "}
            <code className="text-[11px] font-mono">MCP_AUTH_TOKEN</code> set. Mint one to start
            connecting AI clients (Claude, Cursor, Windsurf, ChatGPT, …).
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-orange/20 text-orange-dark border border-orange/50 hover:bg-orange/30 transition-colors disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate token"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red font-mono">{error}</p>}
      </div>
    );
  }

  if (phase === "minted-auto") {
    return (
      <div className="sticky top-0 z-30 border-b-2 border-orange/60 bg-orange/10 px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 text-sm text-orange-dark">
            {permanent ? (
              <>
                <span className="font-semibold">Setup complete</span> — your instance is now
                production-grade.
              </>
            ) : (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-dark animate-pulse mr-2 align-middle" />
                <span className="font-semibold">Token generated.</span> Auto-deploying… (~60s)
              </>
            )}
          </div>
          {token && (
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-orange/20 text-orange-dark border border-orange/50 hover:bg-orange/30 transition-colors"
            >
              {shown ? "Hide token" : "Show token"}
            </button>
          )}
        </div>
        {shown && token && (
          <div className="mt-3 rounded-md border border-orange/40 bg-bg-soft p-3 flex items-start gap-3">
            <code className="flex-1 break-all text-xs text-text font-mono">{token}</code>
            <button
              type="button"
              onClick={copyToken}
              className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded bg-orange/20 text-orange-dark border border-orange/50 hover:bg-orange/30"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // phase === "minted-manual"
  return (
    <div className="sticky top-0 z-30 border-b-2 border-orange/60 bg-orange/10 px-5 py-3">
      <div className="flex items-center gap-4">
        <div className="flex-1 text-sm text-orange-dark">
          <span className="font-semibold">Bootstrap active</span> — paste this into Vercel as{" "}
          <code className="text-xs">MCP_AUTH_TOKEN</code> to make permanent.{" "}
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-80"
          >
            Open Vercel dashboard ↗
          </a>
        </div>
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-orange/20 text-orange-dark border border-orange/50 hover:bg-orange/30 transition-colors"
        >
          {shown ? "Hide token" : "Show token"}
        </button>
      </div>
      {shown && token && (
        <div className="mt-3 rounded-md border border-orange/40 bg-bg-soft p-3 flex items-start gap-3">
          <code className="flex-1 break-all text-xs text-text font-mono">{token}</code>
          <button
            type="button"
            onClick={copyToken}
            className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded bg-orange/20 text-orange-dark border border-orange/50 hover:bg-orange/30"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

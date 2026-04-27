"use client";

import { useEffect, useState } from "react";

type TokenStatus = "pinned" | "persisted-kv" | "in-memory" | "unconfigured";

interface HealthData {
  ok: true;
  tokenStatus: TokenStatus;
  isVercel: boolean;
  vercelAutoMagicAvailable: boolean;
  instanceUrl: string;
}

type State = { kind: "loading" } | { kind: "ready"; data: HealthData } | { kind: "error" };

export function HealthWidget() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config/health", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: HealthData) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "error") return null;

  if (state.kind === "loading") {
    return (
      <section>
        <h2 className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] mb-3">
          Instance health
        </h2>
        <div className="border border-border rounded-lg px-5 py-4 text-xs text-text-muted">
          Loading…
        </div>
      </section>
    );
  }

  const { data } = state;

  return (
    <section>
      <h2 className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] mb-3">
        Instance health
      </h2>
      <div className="border border-border rounded-lg px-5 py-4 flex flex-wrap items-center gap-3">
        <TokenPill status={data.tokenStatus} />
        {data.isVercel && (
          <Pill
            color={data.vercelAutoMagicAvailable ? "green" : "slate"}
            label="Vercel auto-deploy"
            value={data.vercelAutoMagicAvailable ? "Available" : "Manual paste"}
          />
        )}
        <div className="text-[11px] font-mono text-text-muted truncate flex-1 min-w-0">
          {data.instanceUrl}
        </div>
        <TokenAction status={data.tokenStatus} />
      </div>
      <TokenStatusFootnote status={data.tokenStatus} />
    </section>
  );
}

function TokenPill({ status }: { status: TokenStatus }) {
  if (status === "pinned") {
    return <Pill color="green" label="Token" value="Pinned (env)" />;
  }
  if (status === "persisted-kv") {
    return <Pill color="green" label="Token" value="Persistent (KV)" />;
  }
  if (status === "in-memory") {
    return <Pill color="amber" label="Token" value="In-memory only" />;
  }
  return <Pill color="red" label="Token" value="Unconfigured" />;
}

function TokenAction({ status }: { status: TokenStatus }) {
  if (status === "in-memory") {
    return (
      <a
        href="https://vercel.com/integrations/upstash"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-accent hover:underline shrink-0"
      >
        Connect Upstash KV →
      </a>
    );
  }
  if (status === "persisted-kv") {
    return (
      <a href="/welcome" className="text-xs text-text-muted hover:text-text shrink-0">
        Pin to Vercel env →
      </a>
    );
  }
  return null;
}

function TokenStatusFootnote({ status }: { status: TokenStatus }) {
  if (status === "in-memory") {
    return (
      <p className="text-[11px] text-text-dim mt-2 px-1">
        Your token lives only in this lambda&apos;s memory and will be lost on the next cold start.
        Connect an Upstash KV store (Vercel free tier) to make it persistent.
      </p>
    );
  }
  if (status === "persisted-kv") {
    return (
      <p className="text-[11px] text-text-muted mt-2 px-1">
        Token is durably stored in Upstash KV and rehydrated on every cold start. Pinning to Vercel
        env vars is optional — saves one KV round-trip (~30ms) on cold-start latency.
      </p>
    );
  }
  return null;
}

function Pill({
  color,
  label,
  value,
}: {
  color: "green" | "amber" | "red" | "slate";
  label: string;
  value: string;
}) {
  const palette: Record<typeof color, string> = {
    green: "border-green/40 bg-green/10 text-green",
    amber: "border-orange/40 bg-orange/10 text-orange-dark",
    red: "border-red/40 bg-red/10 text-red",
    slate: "border-border bg-bg-soft text-text-muted",
  };
  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[11px] font-medium ${palette[color]}`}
    >
      <span className="opacity-60 uppercase tracking-wide text-[9px]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

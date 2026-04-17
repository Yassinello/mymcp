"use client";

import { useEffect, useState } from "react";

type Mode = "kv" | "file" | "static" | "kv-degraded";

const META: Record<Mode, { label: string; tone: "ok" | "warn" | "error"; title: string }> = {
  kv: { label: "KV", tone: "ok", title: "Storage: Upstash Redis (live saves)" },
  file: { label: "File", tone: "ok", title: "Storage: filesystem (live saves)" },
  static: {
    label: "Static",
    tone: "warn",
    title: "Storage: env-vars only — dashboard saves disabled",
  },
  "kv-degraded": {
    label: "KV ✗",
    tone: "error",
    title: "KV configured but unreachable — saves blocked",
  },
};

/**
 * Compact badge surfacing the live storage mode. Shown in the sidebar so
 * the user always knows what backend their saves are hitting (or whether
 * saves are blocked entirely). Click → /config?tab=storage.
 *
 * Auto-refreshes every 30s in degraded states only — stable modes (kv/file)
 * don't need polling.
 */
export function StorageModeBadge() {
  const [mode, setMode] = useState<Mode | null>(null);

  // Initial fetch — runs once on mount. Separated from the polling effect
  // below so we don't double-fire on the first mode-state change (the
  // pre-fix version refired the whole effect when state went null → kv,
  // hitting the API twice on cold load).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/storage/status?counts=0`, { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { mode?: Mode };
        if (!cancelled && data.mode) setMode(data.mode);
      } catch {
        // Silent — badge stays in last-known state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-poll only in transient states (kv-degraded recovery, static waiting
  // for upstash setup). KV/file are stable — no point burning requests.
  useEffect(() => {
    if (mode !== "kv-degraded" && mode !== "static") return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/storage/status?counts=0&force=1`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { mode?: Mode };
        if (!cancelled && data.mode) setMode(data.mode);
      } catch {
        // Silent
      }
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  if (!mode) {
    return (
      <span
        className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide bg-bg-muted text-text-muted"
        title="Detecting storage mode…"
      >
        …
      </span>
    );
  }

  const meta = META[mode];
  const toneClass =
    meta.tone === "ok"
      ? "bg-green-bg text-green"
      : meta.tone === "warn"
        ? "bg-orange-bg text-orange"
        : "bg-red-bg text-red";

  return (
    <a
      href="/config?tab=storage"
      title={meta.title}
      className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide ${toneClass} hover:opacity-80 transition-opacity`}
    >
      {meta.label}
    </a>
  );
}

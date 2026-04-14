"use client";

import { useState } from "react";

interface PreviewSkill {
  name: string;
  description: string;
  content: string;
  arguments: { name: string; description?: string; required?: boolean }[];
}

interface PreviewResponse {
  ok: boolean;
  skill?: PreviewSkill;
  error?: string;
  warnings?: string[];
}

export function ImportSkillModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<"input" | "preview" | "saving">("input");
  const [preview, setPreview] = useState<PreviewSkill | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPreview = async () => {
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/config/skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url, action: "preview" }),
      });
      const data = (await res.json()) as PreviewResponse;
      if (!data.ok || !data.skill) {
        setError(data.error || "Could not parse the URL into a skill");
        setBusy(false);
        return;
      }
      setPreview(data.skill);
      setWarnings(data.warnings || []);
      setStage("preview");
    } catch {
      setError("Network error");
    }
    setBusy(false);
  };

  const confirmImport = async () => {
    if (!preview) return;
    setStage("saving");
    setError(null);
    try {
      const res = await fetch("/api/config/skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url, action: "save" }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error || "Save failed");
        setStage("preview");
        return;
      }
      await onImported();
    } catch {
      setError("Network error");
      setStage("preview");
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-xl rounded-lg border border-border bg-bg-sidebar shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Import skill from URL</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-dim hover:text-text text-sm"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {stage === "input" && (
          <div className="space-y-3">
            <p className="text-xs text-text-dim">
              Paste a raw GitHub URL (e.g.{" "}
              <code className="font-mono text-text-muted">
                https://raw.githubusercontent.com/owner/repo/main/skill.md
              </code>
              ) or a <code className="font-mono text-text-muted">skills.sh</code> skill page. The
              URL is fetched server-side with a 1 MB cap and SSRF protection.
            </p>
            <input
              type="url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/..."
              className="w-full bg-bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none"
            />
            {error && (
              <div className="bg-red-bg border border-red/20 rounded-md p-3 text-xs text-red">
                {error}
              </div>
            )}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={fetchPreview}
                disabled={busy || !url.trim()}
                className="bg-accent text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-accent/90 disabled:opacity-60"
              >
                {busy ? "Fetching…" : "Preview"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-medium px-4 py-1.5 rounded-md bg-bg-muted hover:bg-border-light text-text-dim"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {stage === "preview" && preview && (
          <div className="space-y-3">
            <p className="text-xs text-text-dim">
              Review the parsed skill. If it looks right, click{" "}
              <strong className="text-text">Import</strong> to add it to your skills as a remote
              skill (it will be re-fetched from the URL on each invocation).
            </p>

            {warnings.length > 0 && (
              <div className="bg-orange-bg border border-orange/20 rounded-md p-3 text-xs text-orange space-y-1">
                {warnings.map((w, i) => (
                  <p key={i}>⚠ {w}</p>
                ))}
              </div>
            )}

            <div className="border border-border rounded-md p-3 bg-bg space-y-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  Name
                </p>
                <p className="text-sm font-mono text-text">{preview.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  Description
                </p>
                <p className="text-xs text-text-dim">{preview.description || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  Arguments
                </p>
                {preview.arguments.length === 0 ? (
                  <p className="text-xs text-text-muted italic">none</p>
                ) : (
                  <ul className="text-xs text-text-dim space-y-0.5">
                    {preview.arguments.map((a) => (
                      <li key={a.name}>
                        <code className="font-mono text-text">{a.name}</code>
                        {a.required && <span className="text-red"> *</span>}
                        {a.description && <span className="ml-1.5">— {a.description}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  Content preview
                </p>
                <pre className="text-[11px] font-mono text-text-dim bg-bg-muted border border-border rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                  {preview.content.slice(0, 1000)}
                  {preview.content.length > 1000 && "\n…"}
                </pre>
              </div>
            </div>

            {error && (
              <div className="bg-red-bg border border-red/20 rounded-md p-3 text-xs text-red">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={confirmImport}
                className="bg-accent text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-accent/90"
              >
                Import
              </button>
              <button
                type="button"
                onClick={() => setStage("input")}
                className="text-sm font-medium px-4 py-1.5 rounded-md bg-bg-muted hover:bg-border-light text-text-dim"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {stage === "saving" && (
          <div className="py-6 text-center text-sm text-text-dim">Saving…</div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { renderMarkdown } from "@/core/markdown-lite";

export interface DocEntry {
  slug: string;
  title: string;
  summary: string;
  content: string;
}

export function DocumentationTab({ docs }: { docs: DocEntry[] }) {
  const [active, setActive] = useState<string>(docs[0]?.slug ?? "");
  const current = docs.find((d) => d.slug === active) ?? docs[0];

  if (!current) {
    return (
      <div className="border border-border rounded-lg p-6">
        <p className="text-sm text-text-dim">No documentation files found.</p>
        <p className="text-xs text-text-muted mt-2">
          Add markdown files to <code>content/docs/</code> in the repo and redeploy.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-8 lg:gap-10">
      {/* TOC — sticky on desktop, inlined on mobile */}
      <aside className="lg:sticky lg:top-10 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
          On this page
        </p>
        <ul className="space-y-0.5">
          {docs.map((d) => (
            <li key={d.slug}>
              <button
                type="button"
                onClick={() => setActive(d.slug)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                  d.slug === current.slug
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-text-dim hover:bg-bg-muted hover:text-text"
                }`}
              >
                {d.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Content — capped at a comfortable reading column even when the
          shell is wide, so long lines stay scannable. */}
      <article className="prose-mymcp max-w-3xl min-w-0">
        <h2 className="text-2xl font-bold text-text mb-1">{current.title}</h2>
        <p className="text-sm text-text-muted mb-6">{current.summary}</p>
        <div
          className="text-sm text-text-dim leading-relaxed space-y-3"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(current.content) }}
        />
      </article>
    </div>
  );
}

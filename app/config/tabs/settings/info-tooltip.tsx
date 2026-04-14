"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Click-activated tooltip with rich body text.
 *
 * Why click-not-hover: hover tooltips lose touch users and can't render
 * multi-paragraph bodies. The (i) icon stays unobtrusive, the popover
 * appears on click and dismisses on outside-click or Escape.
 */
export function InfoTooltip({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-4 h-4 rounded-full border border-text-muted text-text-muted text-[10px] font-bold hover:border-accent hover:text-accent flex items-center justify-center transition-colors"
        aria-label={`Help: ${title}`}
      >
        i
      </button>
      {open && (
        <div className="absolute z-20 left-6 top-0 w-72 rounded-md border border-border bg-bg-sidebar shadow-xl p-3 text-left">
          <p className="text-xs font-semibold text-text mb-1">{title}</p>
          <p className="text-[11px] text-text-dim leading-relaxed">{body}</p>
        </div>
      )}
    </div>
  );
}

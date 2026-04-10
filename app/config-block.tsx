"use client";

import { useState } from "react";

export function ConfigBlock({
  title,
  subtitle,
  config,
}: {
  title: string;
  subtitle: string;
  config: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="tool-card" style={{ position: "relative" }}>
      <div className="tool-header">
        <span className="tool-name">{title}</span>
        <span className="badge badge-dim">{subtitle}</span>
      </div>
      <div className="connection-block" style={{ marginTop: "0.75rem" }}>
        <pre>{config}</pre>
      </div>
      <button
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: "1.25rem",
          right: "1.25rem",
          background: copied ? "var(--green)" : "var(--accent)",
          color: "white",
          border: "none",
          padding: "0.4rem 1rem",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "0.8rem",
          fontWeight: 600,
          transition: "background 0.2s",
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

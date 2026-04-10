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
    <div className="border border-border rounded-lg p-4 relative group">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-semibold text-sm">{title}</span>
          <span className="text-text-muted text-xs ml-2">{subtitle}</span>
        </div>
        <button
          onClick={handleCopy}
          className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${
            copied
              ? "bg-green-bg text-green"
              : "bg-bg-muted text-text-dim hover:bg-border-light hover:text-text"
          }`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono text-text-dim overflow-x-auto">
        {config}
      </pre>
    </div>
  );
}

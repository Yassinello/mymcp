"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "../sidebar";

interface ToolInfo {
  name: string;
  description: string;
}

interface PackInfo {
  id: string;
  label: string;
  enabled: boolean;
  tools: ToolInfo[];
}

export default function PlaygroundPage() {
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [selectedTool, setSelectedTool] = useState("");
  const [paramsJson, setParamsJson] = useState("{}");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    fetch(`/api/admin/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => setPacks(data.packs?.filter((p: PackInfo) => p.enabled) || []))
      .catch(() => setError("Failed to load tools. Check admin auth."));
  }, []);

  const allTools = packs.flatMap((p) => p.tools);

  async function callTool() {
    if (!selectedTool) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const params = JSON.parse(paramsJson);
      const token = new URLSearchParams(window.location.search).get("token") || "";
      const res = await fetch("/api/admin/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tool: selectedTool, params }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(JSON.stringify(data.result, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Call failed");
    } finally {
      setLoading(false);
    }
  }

  const selectedInfo = allTools.find((t) => t.name === selectedTool);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-8 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Playground</h1>
            <p className="text-text-dim mt-1">Test any active tool with custom parameters.</p>
          </div>

          {/* Tool selector */}
          <div className="border border-border rounded-lg p-5 mb-4">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] mb-2 block">
              Tool
            </label>
            <select
              value={selectedTool}
              onChange={(e) => {
                setSelectedTool(e.target.value);
                setResult(null);
                setError(null);
              }}
              className="w-full bg-bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">Select a tool...</option>
              {packs.map((pack) => (
                <optgroup key={pack.id} label={pack.label}>
                  {pack.tools.map((tool) => (
                    <option key={tool.name} value={tool.name}>
                      {tool.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {selectedInfo && (
              <p className="text-sm text-text-dim mt-2">
                {selectedInfo.description.slice(0, 200)}
                {selectedInfo.description.length > 200 ? "..." : ""}
              </p>
            )}
          </div>

          {/* Params */}
          <div className="border border-border rounded-lg p-5 mb-4">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] mb-2 block">
              Parameters (JSON)
            </label>
            <textarea
              value={paramsJson}
              onChange={(e) => setParamsJson(e.target.value)}
              rows={5}
              className="w-full bg-bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder='{"query": "example"}'
            />
            <button
              onClick={callTool}
              disabled={!selectedTool || loading}
              className={`mt-3 px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTool && !loading
                  ? "bg-accent text-white hover:bg-accent/90 cursor-pointer"
                  : "bg-bg-muted text-text-muted cursor-not-allowed"
              }`}
            >
              {loading ? "Running..." : "Call Tool"}
            </button>
          </div>

          {/* Result */}
          {(result || error) && (
            <div className="border border-border rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-semibold text-sm">Result</span>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    error ? "text-red bg-red-bg" : "text-green bg-green-bg"
                  }`}
                >
                  {error ? "Error" : "Success"}
                </span>
              </div>
              <pre
                className={`bg-bg-muted rounded-md p-4 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap ${
                  error ? "text-red" : "text-text-dim"
                }`}
              >
                {error || result}
              </pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

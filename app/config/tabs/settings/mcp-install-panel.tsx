"use client";

import { useState } from "react";

type Client =
  | "claude-desktop-connector"
  | "claude-desktop-config"
  | "claude-code"
  | "cursor"
  | "other";

const CLIENT_LABELS: Record<Client, string> = {
  "claude-desktop-connector": "Claude Desktop · Connector UI",
  "claude-desktop-config": "Claude Desktop · Config file",
  "claude-code": "Claude Code · CLI",
  cursor: "Cursor",
  other: "Other (Bearer header)",
};

/**
 * MCP install instructions for the Settings → MCP subtab.
 *
 * Reuses the same content as the /welcome TokenUsagePanel but tailored for
 * post-onboarding visits: assumes the user already has their token, lets
 * them re-copy install snippets when adding a new client.
 */
export function McpInstallPanel({
  baseUrl,
  token,
}: {
  baseUrl: string;
  token: string | null;
}) {
  const [client, setClient] = useState<Client>("claude-desktop-connector");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const url = `${baseUrl}/api/mcp`;
  const displayToken = revealed && token ? token : token ? maskToken(token) : "<MCP_AUTH_TOKEN>";
  const tokenForSnippet = revealed && token ? token : "<YOUR_TOKEN>";
  const urlWithToken = `${url}?token=${encodeURIComponent(tokenForSnippet)}`;

  const desktopConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        mymcp: {
          url,
          headers: { Authorization: `Bearer ${tokenForSnippet}` },
        },
      },
    },
    null,
    2
  );

  const claudeCodeSnippet = `claude mcp add --transport http mymcp ${url} \\\n  --header "Authorization: Bearer ${tokenForSnippet}"`;

  const cursorSnippet = JSON.stringify(
    {
      mcpServers: {
        mymcp: {
          url: urlWithToken,
        },
      },
    },
    null,
    2
  );

  const snippet =
    client === "claude-desktop-connector"
      ? urlWithToken
      : client === "claude-desktop-config"
        ? desktopConfigSnippet
        : client === "claude-code"
          ? claudeCodeSnippet
          : client === "cursor"
            ? cursorSnippet
            : urlWithToken;

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-dim">
        Install MyMCP in any MCP client below. The same token works in every client — paste it
        everywhere. Use multiple comma-separated tokens (in <code>MCP_AUTH_TOKEN</code>) only if you
        want to revoke one client without breaking the others.
      </p>

      {/* Token reveal */}
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-text">Your MCP token</p>
          {token && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="text-[11px] text-accent hover:underline"
            >
              {revealed ? "Hide" : "Reveal"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all text-xs text-accent font-mono bg-bg-muted px-2.5 py-1.5 rounded border border-border">
            {displayToken}
          </code>
          {token && revealed && (
            <button
              type="button"
              onClick={() => copy("token", token)}
              className="bg-bg border border-border hover:bg-bg-muted text-text text-xs font-medium px-2.5 py-1.5 rounded-md"
            >
              {copied === "token" ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        {!token && (
          <p className="text-[11px] text-text-muted mt-2">
            No token configured on this server. Set <code>MCP_AUTH_TOKEN</code> in your environment.
          </p>
        )}
      </div>

      {/* Client tabs */}
      <div>
        <div className="flex items-center gap-1 flex-wrap mb-3 border-b border-border">
          {(Object.keys(CLIENT_LABELS) as Client[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClient(c)}
              className={`text-xs font-medium px-3 py-2 -mb-px border-b-2 transition-colors ${
                client === c
                  ? "border-accent text-accent"
                  : "border-transparent text-text-dim hover:text-text"
              }`}
            >
              {CLIENT_LABELS[c]}
            </button>
          ))}
        </div>

        {client === "claude-desktop-connector" && (
          <p className="text-[11px] text-text-muted leading-relaxed mb-2">
            Settings → Connectors → <em>Add custom connector</em>. Set Name to{" "}
            <code className="font-mono">MyMCP</code> and paste this URL into the Remote MCP server
            URL field. Leave OAuth fields empty.
          </p>
        )}
        {client === "claude-desktop-config" && (
          <p className="text-[11px] text-text-muted leading-relaxed mb-2">
            Edit <code className="font-mono">claude_desktop_config.json</code> (Mac:{" "}
            <code>~/Library/Application Support/Claude/</code>, Windows:{" "}
            <code>%APPDATA%\Claude\</code>), paste the snippet, then restart Claude Desktop.
          </p>
        )}
        {client === "claude-code" && (
          <p className="text-[11px] text-text-muted leading-relaxed mb-2">
            Run this command in any terminal — it registers MyMCP as an HTTP MCP server in your
            Claude Code config.
          </p>
        )}
        {client === "cursor" && (
          <p className="text-[11px] text-text-muted leading-relaxed mb-2">
            Cursor → Settings → MCP. Add a server and paste this JSON, or edit{" "}
            <code className="font-mono">~/.cursor/mcp.json</code>.
          </p>
        )}
        {client === "other" && (
          <p className="text-[11px] text-text-muted leading-relaxed mb-2">
            For ChatGPT desktop, n8n, Continue, or any other MCP client: paste this URL (token in
            query string). Clients that support custom headers can use the base URL{" "}
            <code className="font-mono">{url}</code> with{" "}
            <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>.
          </p>
        )}

        <div className="relative">
          <pre className="text-[11px] font-mono bg-bg-muted border border-border px-3 py-2.5 rounded-md text-text-dim overflow-x-auto whitespace-pre-wrap break-all">
            {snippet}
          </pre>
          <button
            type="button"
            onClick={() => copy("snippet", snippet)}
            className="absolute top-2 right-2 bg-bg border border-border hover:bg-bg-sidebar text-text text-[10px] font-medium px-2 py-1 rounded-md"
          >
            {copied === "snippet" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function maskToken(token: string): string {
  if (token.length <= 12) return "•".repeat(token.length);
  return `${token.slice(0, 6)}${"•".repeat(token.length - 12)}${token.slice(-6)}`;
}

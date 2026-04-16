# MyMCP — Development Guide

## Project Overview

Open-source personal MCP server framework. Ships 45 pre-built tools across 6 connectors (Google Workspace, Obsidian Vault, Browser Automation, Slack, Notion, Admin). Deployed on Vercel or Docker as a Next.js app. Config-driven: connectors auto-activate based on env vars.

## Architecture

- **Runtime**: Next.js on Vercel (serverless, 60s timeout)
- **MCP SDK**: `mcp-handler` wraps `@modelcontextprotocol/sdk` for Streamable HTTP
- **Registry**: Static manifests in `src/connectors/*/manifest.ts` — single source of truth
- **Config**: All via env vars (no config files). See `src/core/config.ts`
- **Auth**: MCP_AUTH_TOKEN (endpoint) + ADMIN_AUTH_TOKEN (dashboard, optional fallback)

## Key Directories

```
src/core/                        — Framework: types, registry, config, auth, logging
src/connectors/google/manifest.ts     — Google Workspace connector (18 tools)
src/connectors/vault/manifest.ts      — Obsidian Vault connector (15 tools)
src/connectors/browser/manifest.ts    — Browser Automation connector (4 tools)
src/connectors/slack/manifest.ts      — Slack connector (4 tools)
src/connectors/notion/manifest.ts     — Notion connector (3 tools)
src/connectors/admin/manifest.ts      — Admin connector (2 tools)
src/connectors/*/tools/               — Individual tool handlers
src/connectors/*/lib/                 — API wrappers and helpers
app/api/[transport]/route.ts     — MCP endpoint (~30 lines, reads from registry)
app/api/health/route.ts          — Public liveness: { ok, version }
app/api/admin/status/route.ts    — Private diagnostics (auth-gated)
app/page.tsx                     — Private status dashboard
app/welcome/page.tsx             — First-run setup + welcome flow
```

## How the Registry Works

1. `src/core/registry.ts` imports all 6 connector manifests
2. For each connector, checks if all `requiredEnvVars` are present
3. Returns `ConnectorState[]` with enabled/disabled + reason
4. `route.ts` iterates enabled connectors, registers tools via `server.tool()`
5. Dashboard, health, admin API all read from the same registry

## Adding a Tool

1. Create `src/connectors/<connector>/tools/my-tool.ts` with `{ schema, handler }` exports
2. Add entry to connector's `manifest.ts` tools array
3. Done — registry picks it up automatically

## Adding a Connector

1. Create `src/connectors/myconnector/manifest.ts` exporting a `ConnectorManifest`
2. Add import + entry in `src/core/registry.ts` `ALL_CONNECTORS` array
3. Document required env vars in `.env.example`

## Framework vs Instance

**Framework-level** (code, shared by all users):
- Connector manifests, registry, types, auth, dashboard structure
- NO personal references, NO hardcoded locale/timezone/names

**Instance-level** (env vars, unique per deployment):
- Secrets (API keys, tokens)
- Settings (MYMCP_TIMEZONE, MYMCP_LOCALE, MYMCP_DISPLAY_NAME)
- Connector activation (presence of credentials)

## Conventions

- Tool handlers export `{ schema, handler }` pattern
- Every tool is wrapped in `withLogging()` via the registry
- Use `getInstanceConfig()` for timezone/locale — never hardcode
- Descriptions are generic (no personal names or pronouns)
- Google API responses use typed interfaces (not `any`)
- Commit messages: `feat:` / `fix:` / `refactor:` / `docs:` / `chore:`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_AUTH_TOKEN` | Yes | MCP endpoint auth |
| `ADMIN_AUTH_TOKEN` | No | Dashboard auth (fallback: MCP_AUTH_TOKEN) |
| `GOOGLE_CLIENT_ID` | Google connector | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google connector | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Google connector | OAuth refresh token |
| `GITHUB_PAT` | Vault connector | GitHub PAT with `repo` scope |
| `GITHUB_REPO` | Vault connector | `owner/repo` format |
| `GITHUB_BRANCH` | No | Default branch (default: `main`) |
| `BROWSERBASE_API_KEY` | Browser connector | Browserbase API key |
| `BROWSERBASE_PROJECT_ID` | Browser connector | Browserbase project ID |
| `OPENROUTER_API_KEY` | Browser connector | OpenRouter API key for Stagehand |
| `SLACK_BOT_TOKEN` | Slack connector | Slack Bot User OAuth Token |
| `NOTION_API_KEY` | Notion connector | Notion Internal Integration Token |
| `MYMCP_TIMEZONE` | No | Default: `UTC` |
| `MYMCP_LOCALE` | No | Default: `en-US` |
| `MYMCP_DISPLAY_NAME` | No | Default: `User` |
| `MYMCP_CONTEXT_PATH` | No | Default: `System/context.md` |

## Security Notes

- `crypto.timingSafeEqual` for all auth comparisons
- SSRF protection in browser tools (blocks private IPs, cloud metadata)
- Error messages sanitized (API keys stripped)
- OAuth uses state parameter + PKCE
- Health endpoint is public but returns minimal info only
- Dashboard/welcome are auth-gated via middleware

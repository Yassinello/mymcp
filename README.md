<p align="center">
  <h1 align="center">MyMCP</h1>
  <p align="center"><strong>Your personal AI backend. One endpoint. 38 tools. Deploy in 5 minutes.</strong></p>
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYassinello%2Fmymcp&env=MCP_AUTH_TOKEN&envDescription=Required%20env%20vars%20for%20MyMCP&envLink=https%3A%2F%2Fgithub.com%2FYassinello%2Fmymcp%23configuration"><img src="https://vercel.com/button" alt="Deploy with Vercel" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#tool-packs">Tool Packs</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#configuration">Configuration</a> &middot;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude / ChatGPT / AI                   │
│                    (any MCP-compatible client)               │
└──────────────────────────┬──────────────────────────────────┘
                           │ MCP (Streamable HTTP)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     MyMCP on Vercel                          │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐    │
│  │  Google   │  │  Vault   │  │ Browser  │  │  Admin  │    │
│  │ Workspace │  │ Obsidian │  │   Auto   │  │  Logs   │    │
│  │ 18 tools  │  │ 15 tools │  │  4 tools │  │ 1 tool  │    │
│  └─────┬─────┘  └─────┬────┘  └─────┬────┘  └─────────┘    │
│        │              │              │                       │
│     Registry ← Manifests ← Env vars (auto-activation)      │
└────────┼──────────────┼──────────────┼──────────────────────┘
         │              │              │
         ▼              ▼              ▼
   Google APIs    GitHub API    Browserbase
   (Gmail, Cal,   (Obsidian     (Stagehand +
    Contacts,      vault)        OpenRouter)
    Drive)
```

## Why MyMCP?

Most MCP setups require running 5 separate servers, each with their own config. Or paying for a hosted platform that controls your data.

MyMCP gives you **one server, one endpoint, 38 tools** — deployed on Vercel's free tier. You own everything.

| | MyMCP | Separate MCP servers | Hosted platforms |
|---|---|---|---|
| **Setup** | Fork + env vars + deploy | 5 repos, 5 configs | Sign up + monthly fee |
| **Tools** | 38 pre-built | Build your own | 1000s (but vendor lock-in) |
| **Endpoint** | 1 | 5+ | 1 (their server) |
| **Cost** | Free (Vercel free tier) | Free but complex | $0-80/month |
| **Data** | Your Vercel, your keys | Your machines | Their servers |
| **Docker** | No | Usually yes | N/A |

## Quick Start

### Option 1: Deploy to Vercel (recommended)

1. Click the **Deploy with Vercel** button above
2. Set `MCP_AUTH_TOKEN` (generate with `openssl rand -hex 32`)
3. Add credentials for the packs you want (see [Configuration](#configuration))
4. Deploy — your MCP endpoint is live at `https://your-app.vercel.app/api/mcp`

### Option 2: Run locally

```bash
git clone https://github.com/Yassinello/mymcp.git
cd mymcp
cp .env.example .env    # Fill in your values
npm install
npm run dev             # http://localhost:3000
```

### Connect to Claude Desktop

```json
{
  "mcpServers": {
    "mymcp": {
      "url": "https://your-app.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_AUTH_TOKEN"
      }
    }
  }
}
```

### Connect to Claude Code

```json
{
  "mcpServers": {
    "mymcp": {
      "type": "http",
      "url": "https://your-app.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_AUTH_TOKEN"
      }
    }
  }
}
```

## Tool Packs

MyMCP ships **38 production-ready tools** organized in 4 packs. Each pack activates automatically when its credentials are present in env vars.

### Google Workspace — 18 tools

| Category | Tools |
|----------|-------|
| **Gmail** | `gmail_inbox` `gmail_read` `gmail_send` `gmail_reply` `gmail_trash` `gmail_label` `gmail_search` `gmail_draft` `gmail_attachment` |
| **Calendar** | `calendar_events` `calendar_create` `calendar_update` `calendar_delete` `calendar_find_free` `calendar_rsvp` |
| **Contacts** | `contacts_search` |
| **Drive** | `drive_search` `drive_read` |

**Requires:** `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REFRESH_TOKEN`

### Obsidian Vault — 15 tools

| Category | Tools |
|----------|-------|
| **CRUD** | `vault_read` `vault_write` `vault_delete` `vault_move` `vault_append` `vault_list` |
| **Batch & Search** | `vault_batch_read` `vault_search` `vault_recent` `vault_stats` |
| **Knowledge Graph** | `vault_backlinks` `vault_due` |
| **Web → Vault** | `save_article` `read_paywalled` |
| **Context** | `my_context` |

**Requires:** `GITHUB_PAT` + `GITHUB_REPO`

### Browser Automation — 4 tools

| Tool | What it does |
|------|-------------|
| `web_browse` | Open URL, return visible text (handles JS-rendered pages) |
| `web_extract` | Extract structured data with AI (e.g., "get all prices from this page") |
| `web_act` | Execute actions: click, type, fill forms (natural language) |
| `linkedin_feed` | Read LinkedIn feed (rate-limited, persistent session) |

**Requires:** `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` + `OPENROUTER_API_KEY`

### Admin — 1 tool

`mcp_logs` — View recent tool calls, errors, latency. Always active, no credentials needed.

## Architecture

```
src/
  core/                 ← Framework: types, registry, config, auth, logging
  packs/
    google/             ← Google Workspace (18 tools)
      manifest.ts       ← Pack definition (single source of truth)
      lib/              ← Gmail, Calendar, Contacts, Drive wrappers
      tools/            ← Individual tool handlers
    vault/              ← Obsidian Vault (15 tools)
    browser/            ← Browser Automation (4 tools)
    admin/              ← Admin & Observability (1 tool)

app/
  api/mcp               ← MCP endpoint (~30 lines — reads from registry)
  api/health            ← Public liveness: { ok, version }
  api/admin/*           ← Private: status, stats, verify, call (auth-gated)
  api/auth/google       ← OAuth consent flow
  /                     ← Private status dashboard
  /setup                ← Guided setup with progress bar
  /playground           ← Tool call playground (test any tool)
  /packs                ← Public pack listing
```

### How it works

1. Each pack has a `manifest.ts` declaring its tools and required env vars
2. The **registry** checks env vars → determines which packs are active
3. `route.ts` iterates enabled packs, registers tools via the MCP SDK
4. **Everything derives from manifests** — dashboard, health, admin API, playground all read from the same source

### Design principles

- **Env vars only** — no config files to maintain, `git pull` never conflicts
- **Single source of truth** — pack manifests drive MCP registration, dashboard, health, docs
- **Framework vs instance** — framework code has zero personal references; all customization is via env vars
- **Contract-level compatibility** — same tool names, same schemas, same behavior across versions

## Configuration

All configuration is via environment variables. See [`.env.example`](.env.example) for the full list.

### Auth

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_AUTH_TOKEN` | Yes | Bearer token for MCP endpoint |
| `ADMIN_AUTH_TOKEN` | No | Separate token for dashboard (falls back to MCP_AUTH_TOKEN) |

### Instance Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `MYMCP_TIMEZONE` | `UTC` | Timezone for date formatting |
| `MYMCP_LOCALE` | `en-US` | Locale for date/number formatting |
| `MYMCP_DISPLAY_NAME` | `User` | Display name in dashboard |
| `MYMCP_CONTEXT_PATH` | `System/context.md` | Path to context file in vault |
| `GITHUB_BRANCH` | `main` | Default branch for vault repo |
| `MYMCP_TOOL_TIMEOUT` | `30000` | Tool timeout in ms |
| `MYMCP_ERROR_WEBHOOK_URL` | — | Webhook for error alerts (Slack-compatible) |

### Pack Control

Packs activate automatically when their credentials are present. Override with:

```bash
MYMCP_DISABLE_GOOGLE=true          # Force-disable even with credentials
MYMCP_ENABLED_PACKS=vault,admin    # Only listed packs are considered
```

## Dashboard & Tools

| Page | Auth | Description |
|------|------|-------------|
| `/` | Admin | Status dashboard — pack health, tool counts, config, logs |
| `/setup` | Admin | Guided setup — progress bar, OAuth flow, credential checks |
| `/playground` | Admin | Tool playground — test any tool with JSON params |
| `/packs` | Public | Pack listing — tools, descriptions, required env vars |

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/mcp` | MCP_AUTH_TOKEN | MCP Streamable HTTP |
| `GET /api/health` | Public | `{ ok, version }` |
| `GET /api/admin/status` | Admin | Pack diagnostics + diagnose() results |
| `GET /api/admin/stats` | Admin | Tool usage analytics (ephemeral) |
| `GET /api/admin/verify` | Admin | Live credential verification |
| `POST /api/admin/call` | Admin | Invoke any tool (playground API) |
| `GET /api/auth/google` | Admin | Google OAuth redirect |
| `GET /api/cron/health` | Cron | Daily health check + webhook alert |

## Security

| Layer | Protection |
|-------|-----------|
| **Auth** | Timing-safe token comparison (MCP + Admin) |
| **SSRF** | Browser tools block localhost, private IPs (v4+v6), cloud metadata |
| **Errors** | API keys stripped from error messages |
| **Rate limiting** | LinkedIn feed: 3 calls/day (vault-persisted counter) |
| **OAuth** | State parameter validation, PKCE, HttpOnly cookies |
| **Dashboard** | Private by default — all admin routes require auth |
| **Webhooks** | Error alerts on tool failures (opt-in) |
| **CI** | ESLint (no-any enforced), Prettier, contract tests, build checks |

## Development

```bash
npm run dev             # Start dev server
npm run build           # Production build
npm run lint            # ESLint
npm run format          # Prettier
npm run test:contract   # Verify tool contracts (38 tools)
npm run test:e2e        # E2E smoke test (starts server, checks tools/list)
```

Pre-commit hook (via Husky): `lint-staged` + `contract test`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add tools, packs, and custom extensions.

**Quick version:** Create a file in `src/packs/<pack>/tools/`, add it to the pack's `manifest.ts`. Done.

## Tech Stack

Next.js 16 · TypeScript 6 · Zod 4 · MCP SDK · Vercel Serverless · Arctic (OAuth) · Stagehand + Browserbase

## License

[MIT](LICENSE)

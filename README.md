# YassMCP

Personal MCP server that connects Claude (Desktop & Code) to an Obsidian vault via GitHub.

## What it does

YassMCP turns your GitHub-backed Obsidian vault into a fully accessible knowledge base for Claude. Read, write, search, and organize your notes — all through natural language.

## Features

- **Vault CRUD** — Read, write, append, delete, move notes with YAML frontmatter support
- **Batch operations** — Read up to 20 notes in a single call
- **Full-text search** — GitHub Code Search with tree grep fallback
- **Recent activity** — See recently modified notes for reviews and catch-ups
- **Vault stats** — Note counts, folder breakdown, inbox triage metrics
- **Article saving** — Fetch any URL via Jina Reader, save as clean Markdown with metadata
- **Paywall bypass** — Read Medium premium articles with stored session cookies
- **Personal context** — Load your role, projects, and priorities from a context file

## Tools

| Tool | What it does |
|------|-------------|
| `vault_read` | Read a note (parsed frontmatter + body + SHA) |
| `vault_write` | Create or update a note |
| `vault_append` | Append content to an existing note |
| `vault_batch_read` | Read multiple notes at once (max 20) |
| `vault_search` | Full-text search across the vault |
| `vault_list` | Browse vault directory structure |
| `vault_delete` | Delete a note |
| `vault_move` | Move or rename a note |
| `vault_recent` | Recently modified notes (with `since` filter) |
| `vault_stats` | Vault statistics and metrics |
| `vault_backlinks` | Find notes linking to a given note via `[[wikilinks]]` |
| `vault_due` | Notes with `resurface:` date that has passed |
| `save_article` | Save a web article to the vault |
| `read_paywalled` | Read paywalled content without saving |
| `my_context` | Load personal context |

## Setup

### 1. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Yassinello/yass-mcp)

### 2. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_AUTH_TOKEN` | Yes | Auth token for the MCP endpoint |
| `GITHUB_PAT` | Yes | GitHub Personal Access Token (`repo` scope) |
| `GITHUB_REPO` | Yes | Your vault repo (`owner/repo`) |
| `MEDIUM_SID` | No | Medium session cookie for premium articles |

### 3. Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "YassMCP": {
      "url": "https://your-app.vercel.app/api/mcp?token=YOUR_TOKEN"
    }
  }
}
```

### 4. Connect to Claude Code

```bash
claude mcp add yassmcp https://your-app.vercel.app/api/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

## Tech Stack

- **Framework**: Next.js (deployed on Vercel)
- **MCP SDK**: `mcp-handler` + `@modelcontextprotocol/sdk`
- **Storage**: GitHub Contents API (your Obsidian vault repo)
- **Article extraction**: Jina Reader
- **Schema validation**: Zod
- **YAML**: js-yaml

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Build
npm run build
```

## Architecture

```
app/api/[transport]/route.ts   → MCP endpoint (auth + tool registration)
src/tools/*.ts                 → Tool handlers (one per file)
src/lib/github.ts              → GitHub API wrapper
src/lib/logging.ts             → Observability
```

All vault operations go through the GitHub Contents API. Notes are stored as Markdown files with optional YAML frontmatter. The MCP endpoint supports both `Authorization: Bearer` header and `?token=` query string authentication.

## License

Private project.

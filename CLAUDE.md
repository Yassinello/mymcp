# YassMCP — Development Guide

## Project Overview

Personal MCP (Model Context Protocol) server that connects Claude to an Obsidian vault stored on GitHub. Deployed on Vercel as a Next.js app.

## Architecture

- **Runtime**: Next.js on Vercel (Edge-compatible, no Node-only APIs in middleware)
- **MCP SDK**: `mcp-handler` wraps `@modelcontextprotocol/sdk` for Streamable HTTP
- **Storage**: GitHub repo as Obsidian vault (all vault ops go through GitHub Contents API)
- **Auth**: Bearer token + query string fallback (timing-safe comparison)

## Key Directories

```
app/api/[transport]/route.ts   — MCP endpoint (tool registration + auth)
app/api/health/route.ts        — Health check endpoint
src/lib/github.ts              — GitHub API wrapper (all vault I/O)
src/lib/logging.ts             — Tool call logging decorator
src/tools/                     — One file per tool (schema + handler)
```

## Tools (15 total)

| Tool | Description |
|------|-------------|
| `vault_read` | Read a note (returns frontmatter + body + SHA) |
| `vault_write` | Create/update a note (with optional frontmatter) |
| `vault_append` | Append content to existing note (1 op instead of 3) |
| `vault_batch_read` | Read up to 20 notes in parallel |
| `vault_search` | Full-text search (GitHub Search → tree grep fallback) |
| `vault_list` | List directory contents |
| `vault_delete` | Delete a note |
| `vault_move` | Move/rename a note (atomic read→write→delete) |
| `vault_recent` | Recently modified notes (via commits API, supports `since` filter) |
| `vault_stats` | Vault metrics (note counts, folder breakdown) |
| `vault_backlinks` | Find all notes linking to a given note via `[[wikilinks]]` + forward links |
| `vault_due` | Notes with `resurface:` frontmatter date that has passed |
| `save_article` | Fetch URL via Jina Reader → save with frontmatter |
| `read_paywalled` | Read paywalled articles (Medium cookie support) |
| `my_context` | Load personal context from System/context.md |

## Development

```bash
npm run dev      # Local dev server (http://localhost:3000)
npm run build    # Production build
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_AUTH_TOKEN` | Yes | Bearer token for MCP + admin auth |
| `GITHUB_PAT` | Yes | GitHub PAT with `repo` scope |
| `GITHUB_REPO` | Yes | Vault repo in `owner/repo` format |
| `MEDIUM_SID` | No | Medium session cookie for paywall bypass |

## Conventions

- All tool handlers export `{ schema, handler }` pattern
- Every tool is wrapped in `withLogging()` for observability
- GitHub API calls use `fetchWithTimeout()` (default 10s)
- Path validation: no `..`, no leading `/`, no null bytes
- SHA passthrough: pass SHA from `vault_read` to `vault_write` to skip extra GET
- Frontmatter: parsed/generated with `js-yaml`
- Commit messages: always end with `via YassMCP`

## Deployment

Push to `main` → auto-deployed on Vercel. No CI/CD config needed beyond `vercel.json`.

## Important Notes

- `crypto.timingSafeEqual` is NOT available in Edge Runtime — auth runs in Node runtime only
- GitHub Code Search may not index very small/new repos → `vault_search` has tree grep fallback
- `save_article` max size: 5MB
- `vault_batch_read` max: 20 files per call
- `vault_recent` uses commits API (may require multiple API calls for file details)
- `vault_backlinks` reads all .md files in batches of 10 — can be slow on large vaults
- `vault_due` scans frontmatter for `resurface: YYYY-MM-DD` or `resurface: when_relevant`
- Resurfacing convention: add `resurface:` to any note's frontmatter to make it discoverable by `vault_due`

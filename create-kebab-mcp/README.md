# create-kebab-mcp

Interactive installer for [Kebab MCP](https://github.com/Yassinello/kebab-mcp) — your personal AI backend.

(Renamed from `create-mymcp`; the old npm name still resolves to the legacy 0.3.x line — re-run with the new name to get the latest.)

## Usage

```bash
npx @yassinello/create-kebab-mcp@latest
```

## What it does

1. **Clones** the Kebab MCP repo into a new directory
2. **Asks** which tool packs you want (Google Workspace, Obsidian, Browser, Slack, Notion)
3. **Collects** your API credentials interactively
4. **Generates** a `.env` file with your config
5. **Installs** dependencies
6. **Deploys** to Vercel (optional)

## Requirements

- Node.js 18+
- git

## Staying up to date

The installer sets up an `upstream` remote automatically. To pull updates:

```bash
git fetch upstream && git merge upstream/main
```

Your `.env` is never overwritten — all config lives in env vars, not in code.

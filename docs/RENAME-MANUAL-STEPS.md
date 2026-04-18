# MyMCP → Kebab MCP rename — status & remaining steps

## Done (automated)

- ✅ Code-level rename (commit `59a40af`) — display strings, package
  names, Docker service, MCP snippets, log prefixes, CLI installer dir
- ✅ GitHub repo rename: `Yassinello/mymcp` → `Yassinello/kebab-mcp`
  (public, auto-redirect from old URL active)
- ✅ GitHub repo rename: `Yassinello/mymcp-yass` → `Yassinello/kebab-mcp-yass`
  (private)
- ✅ Local git remotes updated (`origin` + `yass` point to new URLs)
- ✅ All `Yassinello/mymcp` links in code updated to `Yassinello/kebab-mcp`
  (incl. URL-encoded variants in Deploy-to-Vercel buttons)
- ✅ `cd mymcp` post-clone instructions → `cd kebab-mcp`
- ✅ Both Vercel deploys verified post-rename (READY, /api/health → v0.1.0)

## Remaining (manual — Claude Code can't do these)

### 1. Vercel project rename

Two projects to rename. Both auto-track GitHub via internal repo ID, so
they keep deploying after the rename without re-linking.

**4a. Public showcase**

1. Open https://vercel.com/yassine-hamou-tahras-projects/mymcp/settings
2. Project Name: `mymcp` → `kebab-mcp` (or `kebab-mcp-home` if you want
   to match the showcase suffix used in the public URL)
3. Save. Default URL becomes `kebab-mcp.vercel.app` or
   `kebab-mcp-home.vercel.app`.
4. (Recommended) Domains tab: add `kebab-mcp-home.vercel.app` as alias,
   keep `mymcp-home.vercel.app` for backward compat OR remove if you're
   confident no one visits the old URL. Remove the `mcp-yass.vercel.app`
   alias (misleading after rename).

**4b. Personal instance**

1. Open https://vercel.com/yassine-hamou-tahras-projects/mymcp-yass/settings
2. Project Name: `mymcp-yass` → `kebab-mcp-yass`
3. Save. Default URL becomes `kebab-mcp-yass.vercel.app`.
4. Update your MCP client configs (Claude Desktop, Code, Cursor,
   ChatGPT) to the new URL.

### 2. Local folder rename

```powershell
# Close this Claude Code session and any running `npm run dev` first
cd C:\Users\Utilisateur\Documents
Rename-Item MyMcp KebabMCP

# Re-launch Claude Code from the new path
cd C:\Users\Utilisateur\Documents\KebabMCP
claude
```

If you have an MCP server entry in `~/.claude.json` pointing at this
folder, update its path.

### 3. Update Vercel URLs in code (one-line follow-up commit)

After step 1 above, the old `mymcp-home.vercel.app` and
`mymcp-yass.vercel.app` URLs in README/docs are stale. Run:

```bash
cd /c/Users/Utilisateur/Documents/KebabMCP   # post step 2
sed -i 's|mymcp-home\.vercel\.app|kebab-mcp-home.vercel.app|g' \
  README.md content/docs/*.md
sed -i 's|mymcp-yass\.vercel\.app|kebab-mcp-yass.vercel.app|g' \
  README.md app/components/mcp-client-snippets.tsx
git add -A && git commit -m "docs: update Vercel URLs after project rename"
git push origin main && git push yass main
```

### 4. (Optional) Publish create-kebab-mcp to npm

```bash
cd create-kebab-mcp
# Bump version in package.json (0.3.1 → 0.4.0 if you want a clean signal)
npm publish --access public
```

The old `@yassinello/create-mymcp` on npm continues to work for legacy
users. New users discover `create-kebab-mcp` via the README.

## What does NOT need to change (already verified)

- Env vars on Vercel — `MCP_AUTH_TOKEN`, `MYMCP_*`, `UPSTASH_*`,
  connector creds — preserved by design
- KV stored data (skills, credentials, settings) — keys still use
  `mymcp:` prefix internally
- MCP client tokens — same tokens still work
- Cookies in your browser session — same names
- GitHub PRs / Issues / Dependabot — auto-migrated to renamed repo

## Rollback (if you change your mind)

The rename is two commits (`59a40af` + the URL update commit). To revert:

```bash
git log --oneline | head -10   # find the URL update commit SHA
git revert <url-update-sha> 59a40af
git push origin main && git push yass main
gh repo rename mymcp --repo Yassinello/kebab-mcp --yes
gh repo rename mymcp-yass --repo Yassinello/kebab-mcp-yass --yes
```

Vercel auto-redeploys both. Vercel project names would need separate
revert via UI if already changed.

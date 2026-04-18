# Rename MyMCP → Kebab MCP — Manual steps for the founder

The code-level rename shipped in commit `59a40af` and is live in prod
(`mymcp-home.vercel.app` and `mymcp-yass.vercel.app` both serving v0.1.0
with the new branding). What remains is what Claude Code cannot do from
inside the running session: rename external resources.

Order matters in a few places. Suggested sequence below.

## 1. GitHub repo rename — public showcase

`Yassinello/mymcp` → `Yassinello/kebab-mcp`

1. Open https://github.com/Yassinello/mymcp/settings
2. Under **Repository name**, type `kebab-mcp`, click **Rename**
3. GitHub auto-creates a redirect from `Yassinello/mymcp` → new URL.
   Existing clones, old README links, and the Vercel deploy hook keep
   working. Forks pointing at the old name redirect too.

After this step, both Vercel projects (`mymcp` and `mymcp-yass`) will
still see pushes — the redirect is transparent at the Git layer.

## 2. GitHub repo rename — personal fork

`Yassinello/mymcp-yass` → `Yassinello/kebab-mcp-yass`

Same procedure. Optional — the fork name is private, no one sees it.
Skip if you'd rather not touch it.

## 3. Update local git remotes

Once GitHub renames are done, update your local checkout:

```bash
cd /c/Users/Utilisateur/Documents/MyMcp   # current local path

git remote set-url origin https://github.com/Yassinello/kebab-mcp.git
git remote set-url yass   https://github.com/Yassinello/kebab-mcp-yass.git

git remote -v   # verify
git fetch --all # confirm both reachable
```

The `git remote set-url` is purely local — no push needed.

## 4. Vercel project rename

Two projects to rename. Both are auto-tracked from GitHub so they keep
deploying after the rename (Vercel matches via internal repo ID, not
URL string).

### 4a. Public showcase project

1. Open https://vercel.com/yassine-hamou-tahras-projects/mymcp/settings
2. Under **Project Name**, change `mymcp` → `kebab-mcp` (or whatever
   you prefer — `kebab-mcp-home` if you want the showcase suffix)
3. Click **Save**

Vercel updates the default `*.vercel.app` URL to match the new project
name (e.g. `kebab-mcp.vercel.app`). The custom alias `mymcp-home.vercel.app`
stays attached unless you rename it under **Domains**.

**Recommended**: also rename the custom domain `mymcp-home.vercel.app` →
`kebab-mcp-home.vercel.app` (Domains tab → remove old, add new). The
`mcp-yass.vercel.app` alias should be removed (it points to this project
but is misleading after the rename).

### 4b. Personal instance project

1. Open https://vercel.com/yassine-hamou-tahras-projects/mymcp-yass/settings
2. Project name: `mymcp-yass` → `kebab-mcp-yass`
3. Default URL becomes `kebab-mcp-yass.vercel.app`
4. Update your MCP client configs (Claude Desktop / Code / Cursor /
   ChatGPT / etc.) to the new URL.

If you keep the old URL via aliases, no client config changes needed —
but the new URL is cleaner.

## 5. Local folder rename

The folder `C:\Users\Utilisateur\Documents\MyMcp` is hardcoded in:

- This Claude Code session (the cwd you launched from)
- Your `.claude.json` MCP server config if it points to a local install
- Any shell aliases or shortcuts

To rename `MyMcp` → `KebabMCP`:

1. Close this Claude Code session and any running `npm run dev`
2. In Explorer or PowerShell:

   ```powershell
   cd C:\Users\Utilisateur\Documents
   Rename-Item MyMcp KebabMCP
   ```

3. Re-launch Claude Code from the new path:

   ```powershell
   cd C:\Users\Utilisateur\Documents\KebabMCP
   claude
   ```

4. If you have an MCP server entry in `~/.claude.json` pointing at this
   folder, update its path.

## 6. Update README links to new URLs (one-line follow-up commit)

After steps 1, 4a, and 4b, the GitHub URLs and showcase URL in the
README are stale. Run:

```bash
cd /c/Users/Utilisateur/Documents/KebabMCP   # new path
sed -i 's|github.com/Yassinello/mymcp|github.com/Yassinello/kebab-mcp|g' \
  README.md app/landing/*.tsx app/sidebar.tsx CONTRIBUTING.md \
  CHANGELOG.md SECURITY.md create-kebab-mcp/README.md \
  .github/ISSUE_TEMPLATE/config.yml
sed -i 's|mymcp-home.vercel.app|kebab-mcp-home.vercel.app|g' \
  README.md content/docs/*.md
sed -i 's|mymcp-yass.vercel.app|kebab-mcp-yass.vercel.app|g' \
  README.md
git diff   # review
git add -A && git commit -m "docs: update URLs after GitHub repo + Vercel project rename"
git push origin main
git push yass main
```

## 7. (Optional) npm publish create-kebab-mcp

The CLI installer was renamed from `@yassinello/create-mymcp` to
`@yassinello/create-kebab-mcp` in code, but the npm package hasn't been
published under the new name yet.

```bash
cd create-kebab-mcp
# Bump version in package.json (0.3.1 → 0.4.0 if you want a clean signal)
npm publish --access public
```

The old `@yassinello/create-mymcp` on npm continues to work for legacy
users at version 0.3.1. New users discover `create-kebab-mcp` via the
README.

## What does NOT need to change (verified)

- **Env vars on Vercel** (`MCP_AUTH_TOKEN`, `MYMCP_*`, `UPSTASH_*`,
  connector creds) — preserved by design, no breaking changes
- **KV stored data** (skills, credentials, settings) — keys still use
  `mymcp:` prefix internally, unchanged
- **MCP client tokens** — same tokens still work (client-side server
  name like `"mymcp"` in your config can stay or change at your
  leisure; the server doesn't care)
- **Cookies** in your browser session — keep the same names
- **Existing GitHub PRs / Issues** — auto-migrate to the renamed repo

## Rollback (if you change your mind)

The rename is a single commit (`59a40af`). To revert:

```bash
git revert 59a40af
git push origin main
git push yass main
```

Vercel auto-redeploys both. GitHub repo + Vercel project names would
need separate revert via UI if already changed.

## Verification checklist after manual steps

- [ ] `https://github.com/Yassinello/kebab-mcp` resolves (200)
- [ ] `https://github.com/Yassinello/mymcp` redirects to new URL (301)
- [ ] Both Vercel deploys still serve `/api/health` returning v0.1.0
- [ ] Local folder renamed; `npm run dev` works from new path
- [ ] `.claude.json` MCP entry path updated if applicable
- [ ] README URL sed-update committed (step 6)

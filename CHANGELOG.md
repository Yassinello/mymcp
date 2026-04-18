# Changelog

All notable changes to Kebab MCP.

## [0.1.0] - 2026-04-18 — Stabilization release

This is the consolidated v0.1.0 release: the project was internally
versioned up to v0.3.5 during pre-OSS development but `package.json`
was reset to v0.1.0 (commit `87985d6`) to mark the open-source launch
baseline. Everything described under the "Pre-stabilization development
log" section below was rolled into this release; it is the first
version intended for public consumption.

### Known limitations

- **MCP SDK pinned at 1.26**: `mcp-handler@1.1.0` hard-pins
  `@modelcontextprotocol/sdk@1.26.0` as a peer dependency, so the
  bump to SDK 1.29 was reverted. Tracked: revisit when `mcp-handler@1.2+`
  ships (likely soon — the SDK has had 3 patch releases since).
- **3 residual moderate vulnerabilities** in the stagehand → langchain
  transitive chain (`langsmith`, `@langchain/core`, `@browserbasehq/stagehand`
  parent advisory). Cannot patch without semver-major regression of the
  browser connector. Tracked: revisit on next stagehand release.
  Audit-level=high CI gate is unaffected.

### Renamed

- **Project renamed**: MyMCP → **Kebab MCP**. Display strings, docs, package names (`kebab-mcp`, `@yassinello/create-kebab-mcp`), Docker compose service name, MCP client config snippet keys all updated. **Internal identifiers preserved** (`MYMCP_*` env var prefix, KV key prefixes, cookie names, `x-mymcp-tenant` header, `mymcp_admin_token` cookie) so existing deployments keep working with no env-var changes. New users get clean naming everywhere they look; legacy users get zero-disruption migration.

### Added

- `.husky/pre-commit` now blocks accidental commits of `.env`, `.env.local`, `.env.vercel`, etc. (the `.env.example` template stays whitelisted). Closes audit R6.
- `CODE_OF_CONDUCT.md` adopting the Contributor Covenant 2.1 by reference, with a project-specific reporting contact and enforcement statement. Linked from `CONTRIBUTING.md`. Closes audit R1.
- User-facing GitHub issue templates: `bug_report.yml`, `feature_request.yml`, `config.yml` (disables blank issues, surfaces SECURITY.md and Discussions). The existing dev templates (`new-connector.md`, `new-tool.md`) are preserved unchanged. Closes audit R2.
- `SECURITY.md` gains a "Token rotation" section walking through Vercel multi-token zero-downtime, Docker, and local dev rotation flows with concrete commands and verification steps. Closes audit C3 procedural follow-up.

### Security

- **Resolved 3 dependency vulnerabilities** via `npm audit fix`:
  - `protobufjs` 7.5.4 → 7.5.5 — **CRITICAL** arbitrary code execution (GHSA-xq3m-2v4x-88gg), pulled by `@browserbasehq/stagehand → @google/genai` and by `@opentelemetry/exporter-trace-otlp-http`
  - `basic-ftp` 5.2.2 → 5.3.0 — **HIGH** DoS via unbounded memory in `Client.list()`, pulled via `stagehand → puppeteer-core → proxy-agent`
  - `hono` 4.12.12 → 4.12.14 — moderate JSX SSR HTML injection, pulled via `mcp-handler → @modelcontextprotocol/sdk`
- `npm audit --audit-level=high` (the CI gate) now exits 0 again
- **Recommended**: rotate your `MCP_AUTH_TOKEN` if you've shared this repo or your `.env` file with anyone (audit hygiene; no leak detected — verification confirmed `.env` was never in git history)

### Changed

- 11 minor dependency bumps surfaced by `npm outdated`:
  - **Production**: `next` 16.2.3 → 16.2.4, `react` + `react-dom` 19.2.4 → 19.2.5, `@opentelemetry/exporter-trace-otlp-http` + `@opentelemetry/sdk-node` 0.214 → 0.215
  - **Dev**: `typescript` 6.0.2 → 6.0.3, `eslint` 10.2.0 → 10.2.1, `prettier` 3.8.2 → 3.8.3, `fast-check` 4.6 → 4.7, `@types/node` 25.5 → 25.6, `typescript-eslint` 8.58.1 → 8.58.2

---

## Pre-stabilization development log

The entries below document per-patch development history during the
private build-out (April 2026). These versions were never published as
separate releases — `package.json` was at `0.1.0` throughout. They are
preserved for git-log cross-reference; the public v0.1.0 release above
supersedes them.

## [0.3.4] - 2026-04-14

### Added

- **Vercel auto-magic mode** — when `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` are configured, `/api/welcome/init` now also writes the minted `MCP_AUTH_TOKEN` to Vercel via REST API and triggers a production redeploy. The welcome page shows a 3-step progress UI ("Token generated → Written to Vercel → Redeploying...") and the dashboard becomes permanent without any manual paste step. Falls back gracefully to manual paste when unavailable. Same auto-magic path is wired into the dry-run banner's "Generate token" CTA.
- **Setup health widget** in the dashboard overview tab — shows token status (Permanent / Bootstrap / Unconfigured), Vercel auto-deploy availability, and the instance endpoint at a glance. New endpoint `GET /api/config/health` (admin auth).
- **Dry-run dashboard mode** — claim-cookie holders can navigate to `/config` directly from the welcome page (via "Or explore the dashboard first →" link) to configure connectors before minting a token. A sticky amber banner appears across all dashboard pages reminding them to generate the token, with an inline "Generate token" CTA that triggers the welcome init flow.
- **Recovery escape hatch** — set `MYMCP_RECOVERY_RESET=1` in env vars and redeploy to wipe stale bootstrap state when locked out. Surfaced via a subtle expandable footer on the welcome page.
- **Optional KV cross-instance bootstrap persistence** — when an external KV store is configured (Upstash, or off-Vercel filesystem KV), bootstrap state is mirrored to the same KV abstraction used by rate-limit so cold-starts on different instances re-hydrate the same claim. Falls back transparently to /tmp-only persistence on Vercel without Upstash.
- **End-to-end integration tests** for the welcome flow covering happy path, locked-out visitor, forged cookies, MCP endpoint guard, recovery reset, and auto-magic mode (mocked Vercel API).

### Changed

- `app/api/welcome/{claim,init,status}/route.ts` now `await rehydrateBootstrapAsync()` at handler entry to pull KV state when available.
- `__internals` no longer exposes `COOKIE_NAME` and `CLAIM_TTL_MS` — they're proper exports as `FIRST_RUN_COOKIE_NAME` and `CLAIM_TTL_MS`.
- `first-run.ts` now logs structured `[Kebab MCP first-run]` info messages on claim creation, bootstrap mint, and re-hydration for production observability.
- Vitest config now runs test files sequentially (`fileParallelism: false`) to avoid races on shared OS `/tmp` paths used by the first-run bootstrap state.

## [0.3.3] - 2026-04-14

### Added

- **Zero-config Vercel onboarding** — the "Deploy to Vercel" button no longer requires `MCP_AUTH_TOKEN` or `MYMCP_DISPLAY_NAME` to be filled in upfront. After deploy, visitors are routed to a new `/welcome` page that mints a permanent token via an in-memory bridge (process.env mutation + `/tmp` persistence + signed first-run claim cookie), so the dashboard works immediately on the same instance. The page then walks the user through pasting the token into Vercel and redeploying for permanence, and polls `/api/welcome/status` to detect when the env var is set "for real."
- New module `src/core/first-run.ts` exposing `isFirstRunMode`, `isBootstrapActive`, `getOrCreateClaim`, `isClaimer`, `bootstrapToken`, `clearBootstrap`, and `rehydrateBootstrapFromTmp`.
- New API routes: `/api/welcome/claim`, `/api/welcome/init`, `/api/welcome/status`.
- Shared `src/core/request-utils.ts` with `isLoopbackRequest` (extracted from `app/api/setup/save/route.ts`).

### Security

- **Closed the first-run admin auth bypass** — `checkAdminAuth` previously returned `null` (open access) whenever no admin token was configured, leaving fresh public Vercel deploys exposed. It now requires either a loopback request OR a valid first-run claim cookie when no token is set; all other requests get 401.
- The MCP endpoint (`/api/[transport]`) now refuses traffic with `503 Instance not yet initialized` while in first-run mode, instead of accepting open requests.

## [0.3.2] - 2026-04-13

### Changed

- **Landing page header CTA** — replaced ambiguous "Login" button (which pointed to `/setup` and made no sense on the marketing landing) with **"Open my instance"**, a popover that asks for the user's deployed instance URL, validates it, persists it in `localStorage`, and redirects to `{url}/config`. Subsequent visits one-click straight through. Includes a "Forget saved instance" escape hatch and a "Don't have one yet? Deploy →" link that anchors to the hero deploy section.

## [0.3.1] - 2026-04-13

### Added

- Interactive setup wizard UI + simplified CLI
- Wizard in AppShell layout with sidebar, welcome intro, SaaS feel
- Comprehensive UX/UI improvements to setup wizard
- Hot env API (filesystem + Vercel REST)
- Per-request registry for hot env reloading
- Wizard simplified to 2 steps with auto token generation
- /config dashboard shell with 6 tabs + first-run middleware
- Sandbox + logs API endpoints for /config tabs
- Sidebar points to /config tabs; setup add-pack mode accepts empty query
- Skills store + schema + atomic file I/O
- Skills pack manifest + MCP tool exposure
- Skills MCP prompts exposure
- Skills CRUD UI + API routes
- Skills manual refresh endpoint
- Skills claude-skill export
- Pack-skeleton-and-source-registry
- Tier1-read-paywalled-tool
- Config-pack-credential-guide
- Tier2-read-paywalled-hard
- Cleanup-old-vault-paywall-tool
- Pack skeleton + runActor helper
- Manifest with allowlist + registry wiring
- Wizard + setup test + env example for apify
- Contract test + snapshot with apify pack
- Pluggable KV storage
- Destructive tool flag
- Read version from package.json instead of hardcoding
- Warn on missing ADMIN_AUTH_TOKEN at startup
- Add durable observability sink via KV store
- Add per-token rate limiting to MCP endpoint
- Add McpToolError class and structured error codes
- Add GitHub Issues pack (6 tools)
- Implement multi-token auth support
- Add Linear pack with 6 tools
- Add Airtable pack with 7 tools
- Auto-pull on dev start + dashboard update banner
- Add landing page at / route with INSTANCE_MODE toggle
- Connectors page redesign — accordion expand, inline guides, hide core

### Changed

- Typed tool handlers via generics
- Streaming fetch with byte cap
- Rename middleware to proxy
- Use fs.promises for non-blocking I/O
- Flatten config nav into sidebar, drop horizontal tabs
- Rename Packs → Connectors across codebase

### Documentation

- Update CHANGELOG for v0.2.1
- Update README to reflect 9 packs and 60 tools
- Fix tool counts to match contract snapshot (59 tools, not 60)
- Expand CONTRIBUTING.md into full community contribution guide
- Add SECURITY.md with vulnerability reporting policy
- Document three upgrade paths (auto predev, dashboard banner, manual)

### Fixed

- Wizard UI polish — design system alignment, tooltips, collapsible guides, better UX
- Suppress npm install warnings in CLI installer
- Merge wizard steps 1+2, fix Google test, add error details toggle
- Setup wizard hydration warning + Google test uses Gmail API
- Security hardening + sandbox validation + allowlist + hot reload
- Make update script Windows-compatible + bump to 0.3.1
- CheckAdminAuth now reads mymcp_admin_token cookie
- Bypass / redirect when INSTANCE_MODE != personal

### Maintenance

- Publish @yassinello/create-mymcp@0.3.1
- Remove unlinked /packs and /playground routes
- Release v0.3.0 — version bump, changelog, test fix
- Update contract test to include github and linear packs
- Bump version to 0.3.1

### Test

- Add unit tests for lib modules
- Add contract tests for GitHub Issues pack

## [0.2.1] - 2026-04-12

### Documentation

- Update CHANGELOG for v0.2.0

### Fixed

- CLI installer — Windows path handling, quotes, empty dir check, Composio pack, tool counts
- CLI UX overhaul + migrate composio-core to @composio/core v0.2.1

## [0.2.0] - 2026-04-11

### Added

- Slack thread/profile, Notion update/query, Composio pack — 51 tools / 7 packs v0.2.0

### Documentation

- Update CHANGELOG for v0.1.2
- Clarify no folder needed before running installer

### Fixed

- Option 1 now shows npx command explicitly

## [0.1.2] - 2026-04-11

### Added

- Create-mymcp CLI installer, GitHub template, pedagogical README v0.1.2

### Documentation

- Update CHANGELOG for v0.1.1

## [0.1.1] - 2026-04-10

### Added

- Add gmail_inbox and calendar_events tools
- Add browser tools (web_browse, web_extract, web_act, linkedin_feed) via Stagehand/Browserbase
- Registry foundation — pack-based tool loading from manifests
- Private status dashboard + admin API
- Guided setup page + Google OAuth flow
- Code quality + diagnostics + docs overhaul
- CI/CD, diagnostics, config export, IPv6 SSRF, repo rename
- Analytics, error webhooks, cron health, packs page, deprecation system
- ESLint + Prettier + Husky, E2E test, Tool Playground
- Slack + Notion packs, Docker support, auto-changelog
- Tailwind UI redesign, security fixes, tests, Docker compose, v0.1.1

### Changed

- Reorganize tools into packs + depersonalize

### Documentation

- Initialize project
- Complete project research (stack, features, architecture, pitfalls, summary)
- Define v1 requirements
- Create roadmap (3 phases)
- Start milestone v1.0 Open Source Framework
- Define milestone v1.0 requirements
- Create milestone v1.0 roadmap (5 phases)
- Packaging — README, .env.example, LICENSE, CONTRIBUTING, CHANGELOG
- README overhaul — architecture diagram, structured tool tables, full endpoint reference

### Fixed

- Add missing vault tools and updated lib files
- Critical code review fixes before open-source release
- Remove last any type in gmail search
- Cron to daily (Vercel free tier limit)
- Revert MCP SDK to ^1.26.0 (compat with mcp-handler 1.1.0)
- Code review — prettier formatting, update docs to 45 tools / 6 packs

### Maintenance

- Add project config

### V2.0

- Add vault_delete, vault_move, save_article + logging, auth, rate limiting, health check

### V3.0

- Complete audit fixes + admin UI redesign

### V3.1

- Add multi-client connection guide to dashboard


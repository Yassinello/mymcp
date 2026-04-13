# Changelog

All notable changes to MyMCP.
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


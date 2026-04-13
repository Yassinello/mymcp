# Changelog

All notable changes to MyMCP.

## [0.3.2] - 2026-04-13

### Changed

- **Landing page header CTA** — replaced ambiguous "Login" button (which pointed to `/setup` and made no sense on the marketing landing) with **"Open my instance"**, a popover that asks for the user's deployed instance URL, validates it, persists it in `localStorage`, and redirects to `{url}/config`. Subsequent visits one-click straight through. Includes a "Forget saved instance" escape hatch and a "Don't have one yet? Deploy →" link that anchors to the hero deploy section.

## [0.3.1] - 2026-04-13

### Changed

- **Renamed Packs → Connectors** across the entire codebase (directories, types, env vars in UI, dashboard labels). The user-facing concept is now "Connector" — clearer for non-developers and aligned with Zapier/Make/n8n terminology.
- **Connectors page redesign** — cards now expand inline on click (accordion) instead of routing to a separate Edit view. The redundant "Edit" link is gone.
- Toggle on a not-yet-configured connector now shows a "Setup needed" affordance instead of silently failing — clicking the card opens the credential form.
- Framework-only connectors (Skills, Admin) are now hidden from the Connectors page via a new `core: true` manifest flag. They remain registered and continue to expose their tools.

### Added

- **Per-connector credential guides** — every user-facing connector (Google, Vault, Slack, Notion, GitHub, Linear, Airtable, Apify, Browser, Composio) now ships an in-app markdown guide with prerequisites, step-by-step credential acquisition, and troubleshooting. Rendered in the expanded card view.
- New optional `guide?: string` and `core?: boolean` fields on `ConnectorManifest`.

## [0.3.0] - 2026-04-13

### Added

- **GitHub Issues pack** — 6 new tools: `github_list_issues`, `github_get_issue`, `github_create_issue`, `github_update_issue`, `github_add_comment`, `github_search_issues`
- **Structured error types** — `McpToolError` class with 8 typed error codes (`NOT_FOUND`, `UNAUTHORIZED`, `RATE_LIMITED`, `INVALID_INPUT`, `UPSTREAM_ERROR`, `TIMEOUT`, `QUOTA_EXCEEDED`, `INTERNAL`), retryable flag, and `withLogging()` integration
- **Durable observability** — two-tier logging sink: in-memory ring buffer (fast path) + async KV persistence (Upstash/Filesystem) via fire-and-forget writes
- **Per-token rate limiting** — sliding-window rate limiter backed by KV store, SHA-256 hashed keys, fail-open on store errors
- **Startup auth warning** — logs a clear warning when `ADMIN_AUTH_TOKEN` is missing instead of silently accepting unauthenticated requests

### Fixed

- Version now read dynamically from `package.json` instead of a hardcoded string

### Security

- Added `SECURITY.md` with vulnerability reporting policy and responsible disclosure guidance

### Documentation

- Expanded `CONTRIBUTING.md` into a full community contribution guide covering setup, conventions, and PR workflow

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


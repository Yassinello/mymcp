# Operations guide

This document describes the day-to-day operator experience of running a
Kebab MCP instance. It complements:

- [HOSTING.md](HOSTING.md) — deploy, degraded-mode contract, backup
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — known bugs + fixes
- [API.md](API.md) — route-by-route HTTP reference

Phase 53 (v0.13) ships an **Observability UI expansion** to the
`/config → Health` tab. This doc explains each panel, the data it
reads, and the env vars that tune it.

## Monitoring the dashboard

Open `/config?tab=health` in a browser authenticated with an admin
token. The tab lays out two stacked regions:

1. **Top — OBS-01..05 (Phase 38):** bootstrap state, KV reachability,
   rehydrate counters, KV latency samples, environment-variable
   presence checklist. Polls `/api/health` + `/api/admin/status` every
   15 s.
2. **Bottom — Usage & health (Phase 53):** five live sections covering
   request volume, p95 latency, error rate, rate-limit buckets, and
   KV quota. Polls five new `/api/admin/metrics/*` routes every 60 s
   by default.

### Tenant selector

A dropdown at the top of the Usage & health block selects which tenant
the five charts reflect. Visible **only** for root-scope operators
(those without a `mymcp-tenant` cookie). Values:

- `All tenants (aggregate)` → `?tenant=__all__` — cross-tenant view;
  the ring-buffer flattens every tenant's bucket before aggregation.
- `<tenantId>` → `?tenant=<id>` — scopes every chart to one tenant.

Scoped admins (tenant cookie set) see the charts but not the selector —
their metrics already filter to their own namespace by the
request-context layer.

**Tenant discovery:** tenant IDs come from `MCP_AUTH_TOKEN_<UPPER>` env
vars (Phase 48 convention). The suffix after `MCP_AUTH_TOKEN_` is
lowercased and listed; empty env list → single-tenant deployment →
root admins see only "All tenants" (effectively null-tenant).

### Refresh controls

- Default poll interval: **60 s**.
- Override per browser session with `?refresh=<seconds>` (clamp 10..600).
- "Refresh now" button triggers an immediate re-fetch across all five
  panels.
- "Auto-refresh every 60s · last HH:MM:SS" status shows the newest
  success timestamp across the five polls.
- A "cold-start (durable)" badge appears when any metrics route fell
  back from the in-process ring buffer to the durable log-store (see
  **Data sources** below).

### Panel 1 — Requests (24h line chart)

24 hourly buckets, oldest on the left. Per-tool dropdown filter lists
every tool currently in the aggregate response (not a registry
snapshot). Empty-state: "No requests in the last 24h — make a tool
call to populate." — i.e. no real calls happened, not a polling
failure.

- Route: `GET /api/admin/metrics/requests?tenant=<id>|__all__&tool=<name>?`
- Response: `{ hours: [{ ts, count }], source: "buffer" | "durable" }`

### Panel 2 — p95 latency (top-10 horizontal bar)

Top-10 slowest tools by p95 duration within the 24h window. Amber bars
distinguish latency from the blue request-count chart. Empty-state:
"No latency data yet."

- Route: `GET /api/admin/metrics/latency?tenant=...&limit=10`
- Response: `{ tools: [{ name, p95Ms, calls }], source }`

### Panel 3 — Error heatmap (connector × hour)

One row per connector present in the 24h data. 24 columns, oldest on
the left. Cell fill painted on a log scale:

```
intensity = log10(errors + 1) / log10(maxErrors + 1)
hsl(0, 70%, 65% - intensity*40%)   // 1 error still visible vs 100.
```

Zero-error cells render as semi-opaque gray (active but healthy);
no-activity cells render as opaque dark gray. Hover a cell to see
`<connector> @ HH:MM — N errors / M total`.

- Route: `GET /api/admin/metrics/errors?tenant=...`
- Response: `{ connectors: [{ connectorId, hours: [{ ts, errors, total }] }], source }`

### Panel 4 — Rate-limit buckets

Table of live bucket state for the current minute window. Columns:
Tenant (masked — first 4 chars + `…` when >4), Scope, Current, Max,
Reset in. Rows sorted by utilization descending. Empty-state: "No
active rate-limit buckets in this minute window."

- Route: `GET /api/admin/metrics/ratelimit`
- Response: `{ buckets: [{ tenantIdMasked, scope, current, max, resetAt }] }`
- Backing store: same key scan as `/api/admin/rate-limits`
  (shared parser in `src/core/rate-limit.ts::parseRateLimitKey`).

### Panel 5 — KV quota

Horizontal progress bar showing `used / limit (percentage)`. Red warn
banner above the bar when percentage > 80.

**When Upstash creds are absent** (`UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN` unset — e.g. FilesystemKV dev deployment):

- Gauge is hidden.
- Caption shows "KV provider: unknown — quota metrics unavailable
  (set UPSTASH_REDIS_REST_URL + token)".

**When creds are present:** the route calls Upstash REST `/info`,
parses `used_memory:<N>` + `used_memory_human:<display>`, and divides
by `UPSTASH_FREE_TIER_BYTES` (default `250 * 1024 * 1024` = 250 MB
Upstash free tier). Override for paid tiers:

```
UPSTASH_FREE_TIER_BYTES=1073741824   # 1 GiB paid tier
```

- Route: `GET /api/admin/metrics/kv-quota`
- `Cache-Control: private, max-age=30` — at a 60 s UI poll the route
  hits Upstash every **second** tick, not every tick. Keeps the
  dashboard responsive without hammering the endpoint when multiple
  admin browsers are open.
- 3-second `AbortSignal.timeout` on the Upstash fetch; timeout or
  5xx → `{ source: "unknown", error: <sanitized> }`.

## Data sources

Each aggregation route chooses between two sources:

1. **In-process ring buffer** (primary). Authoritative when non-empty.
   Reads via `getRecentLogs({ scope: "all" | tenantId })` in
   `src/core/logging.ts`.
   - Cap: 100 entries per tenant (configurable via
     `KEBAB_LOG_BUFFER_PER_TENANT`).
   - Survives until the Node process restarts (Vercel cold start, CLI
     rebuild, `kill -9`).
2. **Durable log-store** (fallback). Used only when the buffer returns
   zero entries (typical right after a cold lambda spin). Reads via
   `getLogStore().since(Date.now() - 24*3600*1000)`.
   - Cap: `MYMCP_LOG_MAX_ENTRIES` (default 500).
   - Filesystem (`data/logs.<tenantId>.jsonl`) or Upstash list (`tenant:<id>:mymcp:logs`) depending on storage mode.
   - Never mixed with buffer data — the buffer is authoritative when
     non-empty.

The response body carries `source: "buffer" | "durable"` so the UI can
badge cold-start recoveries.

## Env var reference (Phase 53 additions)

| Variable | Default | Description |
|----------|---------|-------------|
| `UPSTASH_FREE_TIER_BYTES` | `262144000` (250 MB) | KV quota ceiling for the Health panel gauge. Set to your actual tier if paid. |
| `KEBAB_LOG_BUFFER_PER_TENANT` | `100` | Ring buffer cap per tenant. Phase 48 env var; documented here because Phase 53 metrics aggregation reads it. |

Also relevant (pre-existing):

- `MYMCP_LOG_MAX_ENTRIES` — durable log-store cap (default 500).
- `MYMCP_LOG_MAX_AGE_SECONDS` — optional TTL on Upstash log list.
- `MYMCP_RATE_LIMIT_RPM` — per-token rpm (default 60) reflected as the
  "Max" column in the rate-limit panel.

## Troubleshooting

**"Requests chart shows zero but I just made a tool call."**

- 60 s poll default — wait one tick.
- Check the tenant selector value; `__all__` aggregates, a specific
  tenant filters. If you're root and the tool call was made by a
  scoped admin via a tenant-header path, select that tenant.

**"KV quota shows unknown even though I set UPSTASH_REDIS_REST_URL."**

- Ensure both URL **and** `UPSTASH_REDIS_REST_TOKEN` are set.
- Vercel Marketplace sets `KV_REST_API_*` instead — the KV backend
  handles both, but the `/info` client reads
  `UPSTASH_REDIS_REST_*` only. Alias the env vars at deploy time if
  you use the Marketplace integration (follow-up: merge the two
  readers in v0.14).
- Upstash returned 5xx / timed out. Check server logs for
  `Upstash /info error`.

**"Heatmap shows all gray but I know I had errors."**

- Hover a cell — the tooltip shows raw `errors / total`. If `total > 0`
  and `errors == 0`, the connector has activity without errors
  (correct rendering, light gray). If both are 0, no activity.
- Cold-start: buffer is empty and durable-store fallback hasn't
  caught up yet. Refresh after 30 s.

**"I hit `?refresh=5` — the UI still refreshes every 60s."**

- Clamp applies — `refresh` is bounded 10..600 inclusive. Use `10`.

## Related docs

- [HOSTING.md](HOSTING.md) — degraded-mode contract, backup policy.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — v0.10 bug catalog.
- [API.md](API.md) — full route-by-route HTTP reference.

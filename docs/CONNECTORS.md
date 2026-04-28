# Connector Authoring — Conventions Reference

> **New to connectors?** Start with [CONNECTOR-AUTHORING.md](CONNECTOR-AUTHORING.md) for a step-by-step walkthrough from zero to live. This doc is the conventions + gotchas reference for experienced contributors.

Practical notes for anyone building or maintaining a Kebab MCP connector.
Focused on conventions that are **not enforced by types** today, plus
the SEC-02 breaking change for credential reads.

## Error handling conventions (as of v0.10.0)

Use the structured logger with a tag prefix matching your connector id:

```ts
import { getLogger } from "@/core/logging";
const log = getLogger("CONNECTOR:myconnector");
log.error("upstream failed", { error: String(err) });
```

Tag prefixes currently in use:

- `[FIRST-RUN]` — src/core/first-run*.ts
- `[KV]` — src/core/kv-store.ts
- `[WELCOME]` — app/api/welcome/**/route.ts
- `[CONNECTOR:<id>]` — connector code paths (e.g. `[CONNECTOR:skills]`)
- `[LOG-STORE]` — src/core/log-store.ts
- `[API:<route>]` — admin / config routes, via `errorResponse()`
- `[TOOL:<name>]` — tool timeout and invocation errors

Avoid silent `try/catch` blocks. The contract test
`tests/contract/no-silent-swallows.test.ts` currently scans
`src/core/first-run*.ts`, `src/core/kv-store.ts`, and
`app/api/welcome/**/route.ts`. Connectors are **not yet enforced** by
the contract test (scheduled for v0.11) but the convention applies
everywhere. Use `// silent-swallow-ok: <reason>` to annotate legitimate
empty catches — e.g. optional KV reads where `null` is a valid result,
or /tmp writes in a read-only container where the KV path is already
authoritative.

## Tool timeouts (as of v0.10.0)

`MYMCP_TOOL_TIMEOUT` (default 30000 ms) is enforced at the transport
layer via `withLogging()`. Tool handlers do NOT need to implement
their own timeouts — a slow handler is automatically aborted at the
configured boundary and the client sees an MCP tool error with
`errorCode: "TOOL_TIMEOUT"` instead of the platform's 504.

If your tool needs a shorter per-call timeout (e.g. a 5s upstream API
budget), import `withTimeout()` from `@/core/timeout` and wrap the
upstream call directly. The transport-level timeout remains the outer
bound and always wins.

## 500-response shape (as of v0.10.0)

Admin and config routes that surface 500-level failures should use
`errorResponse()` from `@/core/error-response` instead of returning
raw `err.message`:

```ts
import { errorResponse } from "@/core/error-response";

try {
  await upstreamCall();
} catch (err) {
  return errorResponse(err, { status: 500, route: "my/route" });
}
```

This ensures the client receives a canonical
`{ error: "internal_error", errorId, hint }` shape while the server
log retains the full sanitized error + `errorId` for operator
correlation. Never return `err.message` directly — upstream APIs
occasionally embed bearer tokens in their error bodies.

## Files

A connector lives under `src/connectors/<id>/` with at minimum:

- `manifest.ts` — exports a `ConnectorManifest` (id, label, required
  env vars, tools array, optional `registerPrompts`, `testConnection`,
  `diagnose`).
- `tools/<tool-name>.ts` — one file per tool, exporting
  `{ schema, handler, destructive }`.
- `lib/` — API wrappers, helpers.

## Credential resolution (v0.10 breaking change — SEC-02)

**Pre-v0.10 pattern (deprecated):**

```ts
// tools/slack-send.ts
export const handler = async (params) => {
  const token = process.env.SLACK_BOT_TOKEN;
  // ...
};
```

**v0.10+ pattern (preferred):**

```ts
import { getCredential } from "@/core/request-context";

export const handler = async (params) => {
  const token = getCredential("SLACK_BOT_TOKEN");
  // ...
};
```

### What changed

`process.env.X` is no longer mutated at request time. Credentials
saved via the dashboard now flow through an in-process snapshot
consumed by `getCredential()` via request-scoped `AsyncLocalStorage`.
Connectors reading `process.env.X` directly still work — but they
only see the **boot-time snapshot**, not the dashboard-saved values
that landed on the current warm lambda between boot and the current
request.

### Migration

Grep your connector for `process.env.` reads:

```bash
rg "process\.env\." src/connectors/<yourconnector>/
```

Replace each credential read with `getCredential()`. Platform
lifecycle vars (`VERCEL`, `NODE_ENV`, `VERCEL_GIT_COMMIT_SHA`) are
read-through to live `process.env` via `getCredential()` too, so you
can use the helper uniformly.

### Enforcement

- **v0.10.x** — back-compat path preserved. Warnings only.
- **v0.11** — ESLint rule will block direct `process.env` reads in
  `src/connectors/**` (already blocks assignments — see SEC-02-enforce
  in the v0.10 CHANGELOG).

### Why

The pre-v0.10 pattern mutated `process.env` globally from request
handlers. On warm lambdas handling interleaved requests, that caused
torn reads (tenant A's Slack token observed by tenant B's tool call
mid-flight). See `.planning/research/RISKS-AUDIT.md` finding #3 and
`docs/SECURITY-ADVISORIES.md#sec-02`.

## Tool definitions

Each tool exports `{ schema, handler, destructive }`:

```ts
import { z } from "zod";
import type { ToolDefinition } from "@/core/types";

export const schema = {
  query: z.string().describe("Search term"),
};

export const handler = async (params: { query: string }) => {
  // ...
  return { content: [{ type: "text" as const, text: "..." }] };
};

export const destructive = false; // Set true for tools that write/delete
```

- `destructive: true` — tool may modify state (send email, delete
  row, post to Slack). Surfaced in dashboard UI and logs.
- `destructive: false` — read-only tool.

## Tenant isolation

If your connector persists data in KV, **always** use
`getContextKVStore()` from `@/core/request-context`, never
`getKVStore()` directly:

```ts
import { getContextKVStore } from "@/core/request-context";

export const handler = async () => {
  const kv = getContextKVStore();
  await kv.set("my-key", "value");
  // Writes land at `tenant:<id>:my-key` automatically when a tenant
  // context is active; at `my-key` (untenanted) otherwise.
};
```

`getKVStore()` is allowlisted in `tests/contract/kv-allowlist.test.ts`
and the allowlist enforces going forward. If you have a legitimate
global-KV need, add the file to the allowlist + document in
`INVENTORY.md`.

## Error handling

Use the sanitized `McpToolError` for errors that surface to the
caller. See `src/core/connector-errors.ts` for built-in shapes:

- `AUTH_FAILED` — 401/403 upstream
- `RATE_LIMITED` — 429 upstream
- `TIMEOUT` — upstream timed out
- `UPSTREAM_5XX` — upstream 5xx

Attach `internalRecovery` to describe operator remediation (which env
var to check, how to re-authorize). The wrapped log captures it; the
MCP response only shows the generic `recovery` string.

## Registration

Add your manifest to `src/core/registry.ts`:

```ts
import { myConnectorManifest } from "../connectors/myconnector/manifest";

const ALL_CONNECTORS: ConnectorManifest[] = [
  // ...
  myConnectorManifest,
];
```

The registry auto-activates connectors when their `requiredEnvVars`
are present. No dashboard toggle needed for new connectors — they
light up on deploy.

## Testing

- `src/connectors/<id>/manifest.test.ts` — activation + env var tests
- Per-tool tests colocated with handlers: `src/connectors/<id>/tools/<tool>.test.ts`
- `tests/contract/kv-allowlist.test.ts` will fail if you use
  `getKVStore()` directly in connector code — fix by switching to
  `getContextKVStore()`.

## Route authoring — the request pipeline (as of v0.11.0 / Phase 41)

New API routes under `app/api/**/route.ts` MUST compose their handler
through `composeRequestPipeline(...)` OR the `withAdminAuth(...)` HOC
OR carry a documented `PIPELINE_EXEMPT:` marker. A contract test
(`tests/contract/pipeline-coverage.test.ts`) fails the build if this is
not satisfied.

### Concept

A pipeline is an ordered list of Koa-style `(ctx, next) => Promise<Response>`
steps that concentrate request-scoped policy (rehydrate, auth,
rate-limit, body-parse, CSRF, credentials) at one composition site.
The step(s) run in declaration order; `next()` yields to the next
step; returning without calling `next()` short-circuits.

### The 7 built-in steps

All exported from `@/core/pipeline`:

| Step                    | Purpose                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `rehydrateStep`         | Awaits `rehydrateBootstrapAsync()` + fires one-shot v0.10 tenant-prefix migration (replaces `withBootstrapRehydrate`). |
| `firstRunGateStep`      | Returns 503 JSON when `isFirstRunMode()`; otherwise calls `next()`.                                  |
| `authStep(kind)`        | `'mcp'` / `'admin'` / `'cron'`. On MCP success, writes `ctx.tenantId` + `ctx.tokenId` AND re-enters `requestContext.run({ tenantId })` so downstream steps see it via `getCurrentTenantId()`. |
| `rateLimitStep(opts)`   | `opts: { scope, keyFrom: 'token' \| 'ip' \| 'cronSecretTokenId', limit?, enabledEnv? }`. Opt-in via `MYMCP_RATE_LIMIT_ENABLED=true`. Must run AFTER `authStep` on paths that resolve tenantId so buckets key correctly. |
| `hydrateCredentialsStep`| Hydrates `cred:*` KV entries into the in-process snapshot; runs the continuation under `runWithCredentials` so tool handlers see `getCredential()` values. |
| `bodyParseStep(opts)`   | `opts: { maxBytes? }`. Buffers body with Content-Length + streaming size limits; best-effort JSON parse with raw-string fallback; populates `ctx.parsedBody`. |
| `csrfStep`              | Delegates to `checkCsrf(request)`; returns 403 on mismatched Origin for mutations.                   |

### When to use `composeRequestPipeline` vs. `withAdminAuth`

- **Admin-only route with no extra state:** use `withAdminAuth(handler)`.
  It's a thin HOC that expands to
  `composeRequestPipeline([rehydrateStep, authStep('admin')], handler)`.
  Handler signature: `(ctx: PipelineContext) => Promise<Response>`.
- **Anything else (MCP transport, cron, webhook, multi-step auth, body
  parse, rate limit):** compose a `composeRequestPipeline([...], handler)`
  directly.

### Marking a route exempt

If a route legitimately cannot participate in the pipeline (public
liveness endpoint with a hard latency budget, OAuth redirect receiver
with no auth state to wire through), add this marker as one of the
first 10 lines of the file (before imports):

```ts
// PIPELINE_EXEMPT: <reason ≥ 20 chars explaining why the pipeline doesn't apply>
```

Two routes are currently exempt: `app/api/health/route.ts` (1.5s budget
on the uptime-monitor hot path) and `app/api/auth/google/callback/route.ts`
(public OAuth redirect — no auth/rate-limit/tenant state to wire through,
response is a redirect not a JSON contract).

### Examples

See `src/core/pipeline/*-step.ts` for step implementations and
`app/api/[transport]/route.ts` / `app/api/webhook/[name]/route.ts` /
`app/api/admin/call/route.ts` for compositions covering different
combinations of the 7 steps.

## See also

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — project architecture overview
- `docs/SECURITY-ADVISORIES.md` — advisory index
- `.planning/research/RISKS-AUDIT.md` — the risk audit that motivated
  SEC-01..06

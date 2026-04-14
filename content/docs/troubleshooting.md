---
title: Troubleshooting
summary: Fix the things that break most often
order: 40
---

## "Unauthorized" on /config or /api/mcp

Cause: the request didn't carry a valid token. Fix:

- Browser dashboard: visit `/config?token=YOUR_MCP_AUTH_TOKEN` once. MyMCP sets a cookie and you can navigate normally afterward.
- MCP client: confirm the client is sending `Authorization: Bearer <token>` (or `?token=` for clients that only accept URLs).

## Welcome page reappears every time I deploy

Cause: `MCP_AUTH_TOKEN` is unset in your Vercel project. Each redeploy starts in first-run mode. Fix: set `MCP_AUTH_TOKEN` in Vercel → Settings → Environment Variables, then redeploy.

## Skills disappear after a Vercel redeploy

Cause: your KV backend is the ephemeral filesystem fallback (`/tmp` on Vercel). Vercel wipes `/tmp` on cold start. Fix: provision Upstash Redis (free tier is enough), set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel, redeploy. Skills will then persist across cold starts.

## Google connector "Test connection" fails

Open the **error details** panel under the failed test. Common causes:

- `invalid_grant`: the refresh token has expired or been revoked. Re-run the OAuth helper to mint a new one.
- `403 forbidden`: an API isn't enabled in your Google Cloud project. Enable Gmail API, Calendar API, Drive API, and People API in the Console.
- `429 rate limited`: you're sharing a default OAuth client with many other deployments. Use your own.

## Browserbase / Stagehand timeouts

Cause: complex pages exceed the 60s Vercel function timeout. Fix: bump `BROWSER_TIMEOUT_MS` in env vars to 50000 max (Vercel hard cap), or run MyMCP in Docker / a VPS where you control the timeout.

## Tool calls succeed but return empty content

Likely the connector's underlying API hit a transient error and the handler swallowed it. Check `/config → Logs` for the most recent invocation and look at the error message column. If logs aren't useful, increase `MYMCP_LOG_LEVEL=debug` and reproduce.

## Where do I file bugs?

[github.com/Yassinello/mymcp/issues](https://github.com/Yassinello/mymcp/issues). Include:

- MyMCP version (visible in the sidebar footer)
- Connector affected
- Steps to reproduce
- The error from `/config → Logs` if applicable

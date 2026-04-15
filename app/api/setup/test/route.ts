import { NextResponse } from "next/server";
import { isClaimer } from "@/core/first-run";
import { isLoopbackRequest, getClientIP } from "@/core/request-utils";
import { checkRateLimit } from "@/core/rate-limit";
import { resolveRegistry } from "@/core/registry";
import { withTimeout } from "@/core/timeout";

/**
 * POST /api/setup/test
 *
 * Test a single credential draft by delegating to the connector's own
 * `testConnection()` method. Credentials come from the wizard form —
 * they have NOT been persisted yet, so implementations read from the
 * `credentials` argument, never from `process.env`.
 *
 * v0.6 (A3): the giant switch is gone. Each connector owns its test
 * logic in its manifest.
 */

const TEST_TIMEOUT_MS = 8_000;

export async function POST(request: Request) {
  // v0.6 NIT-01: collapsed from 403 to 401 — both "instance already
  // claimed" and "no first-run claim" return 401 so an unauthenticated
  // caller cannot distinguish setup state via status code.
  if (process.env.MCP_AUTH_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isLoopbackRequest(request) && !isClaimer(request)) {
    return NextResponse.json(
      { error: "Unauthorized — claim this instance via /welcome first" },
      { status: 401 }
    );
  }

  const ip = getClientIP(request);
  const rl = await checkRateLimit(`ip:${ip}`, { scope: "setup", limit: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again in a minute" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: { pack?: string; credentials?: Record<string, string> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const packId = body.pack;
  const credentials = body.credentials || {};
  if (!packId) {
    return NextResponse.json({ ok: false, message: "Missing pack" }, { status: 400 });
  }

  const state = resolveRegistry().find((c) => c.manifest.id === packId);
  if (!state) {
    return NextResponse.json({ ok: true, message: "No test available" });
  }
  if (!state.manifest.testConnection) {
    return NextResponse.json({ ok: true, message: "No test available" });
  }

  try {
    const result = await withTimeout(
      state.manifest.testConnection(credentials),
      TEST_TIMEOUT_MS,
      `${packId} testConnection()`
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: "Connection failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

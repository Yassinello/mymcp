import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/core/auth";
import { getEnvStore, maskValue } from "@/core/env-store";

/**
 * GET /api/config/env
 * Returns current env vars. Sensitive values are masked unless `?reveal=1`.
 */
export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const reveal = url.searchParams.get("reveal") === "1";

  try {
    const store = getEnvStore();
    const vars = await store.read();
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(vars)) {
      out[k] = reveal ? v : maskValue(k, v);
    }
    return NextResponse.json({ ok: true, kind: store.kind, vars: out });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/config/env
 * Body: { vars: Record<string, string> } — batch write.
 * Or: { key, value } — single write.
 */
export async function PUT(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  let body: { vars?: Record<string, string>; key?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let vars: Record<string, string>;
  if (body.vars && typeof body.vars === "object") {
    vars = body.vars;
  } else if (body.key && typeof body.value === "string") {
    vars = { [body.key]: body.value };
  } else {
    return NextResponse.json(
      { ok: false, error: "Provide either { vars: {...} } or { key, value }" },
      { status: 400 }
    );
  }

  // Validate keys
  for (const k of Object.keys(vars)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(k)) {
      return NextResponse.json({ ok: false, error: `Invalid env var key: ${k}` }, { status: 400 });
    }
  }

  try {
    const store = getEnvStore();
    const result = await store.write(vars);
    // Invalidate the registry cache so the next resolveRegistry() call
    // re-scans process.env and sees any newly-satisfied connectors or
    // force-disable toggles.
    const { emit } = await import("@/core/events");
    emit("env.changed");
    return NextResponse.json({ ok: true, kind: store.kind, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

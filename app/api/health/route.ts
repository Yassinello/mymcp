import { VERSION } from "@/core/version";

/**
 * Public health endpoint — liveness check only.
 * Returns {ok, version}. No pack details, no env var info.
 * Detailed diagnostics are in the private admin dashboard.
 */
export async function GET() {
  return Response.json({ ok: true, version: VERSION });
}

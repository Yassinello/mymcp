import { NextResponse } from "next/server";
import { bootstrapToken, isClaimer, isFirstRunMode, isBootstrapActive } from "@/core/first-run";

/**
 * POST /api/welcome/init
 *
 * Verifies the caller holds the active first-run claim cookie, then mints
 * the permanent MCP_AUTH_TOKEN and writes it into process.env via the
 * in-memory bridge. Returns the token to display once.
 */
export async function POST(request: Request) {
  if (!isFirstRunMode() && !isBootstrapActive()) {
    return NextResponse.json({ error: "Already initialized" }, { status: 409 });
  }

  if (!isClaimer(request)) {
    return NextResponse.json({ error: "Forbidden — not the claimer" }, { status: 403 });
  }

  // Read the claim id back from the cookie to pass to bootstrapToken.
  const cookieHeader = request.headers.get("cookie") || "";
  const m = cookieHeader.match(/(?:^|;\s*)mymcp_firstrun_claim=([^;]+)/);
  if (!m) {
    return NextResponse.json({ error: "Missing claim cookie" }, { status: 403 });
  }
  const decoded = decodeURIComponent(m[1]);
  const claimId = decoded.split(".")[0];

  const { token } = bootstrapToken(claimId);

  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host") || "your-instance.vercel.app";
  const instanceUrl = `${proto}://${host}`;

  return NextResponse.json({ ok: true, token, instanceUrl });
}

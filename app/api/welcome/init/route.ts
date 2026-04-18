import { NextResponse } from "next/server";
import {
  bootstrapToken,
  isClaimer,
  isFirstRunMode,
  isBootstrapActive,
  rehydrateBootstrapAsync,
} from "@/core/first-run";
import { getEnvStore, isVercelAutoMagicAvailable, triggerVercelRedeploy } from "@/core/env-store";

/**
 * POST /api/welcome/init
 *
 * Verifies the caller holds the active first-run claim cookie, then mints
 * the permanent MCP_AUTH_TOKEN and writes it into process.env via the
 * in-memory bridge. Returns the token to display once.
 *
 * Auto-magic mode: if VERCEL_TOKEN + VERCEL_PROJECT_ID are present, after
 * minting the token we ALSO write it to Vercel env vars and trigger a
 * production redeploy. Both steps are best-effort — failures are logged
 * but never bubble up: the user always has a working in-memory token they
 * can fall back to copy/paste.
 */
export async function POST(request: Request) {
  await rehydrateBootstrapAsync();
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

  if (!isVercelAutoMagicAvailable()) {
    return NextResponse.json({ ok: true, token, instanceUrl, autoMagic: false });
  }

  // ── Auto-magic path ───────────────────────────────────────────────
  let envWritten = false;
  let redeployTriggered = false;
  let redeployError: string | undefined;

  console.info("[Kebab MCP first-run] auto-magic mode: writing MCP_AUTH_TOKEN to Vercel...");
  try {
    await getEnvStore().write({ MCP_AUTH_TOKEN: token });
    envWritten = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Kebab MCP first-run] auto-magic env write failed: ${msg}`);
  }

  console.info("[Kebab MCP first-run] auto-magic mode: triggering redeploy...");
  try {
    const result = await triggerVercelRedeploy();
    if (result.ok) {
      redeployTriggered = true;
      console.info(
        `[Kebab MCP first-run] auto-magic mode: redeploy triggered (deployment=${result.deploymentId ?? "?"})`
      );
    } else {
      redeployError = result.error;
      console.warn(`[Kebab MCP first-run] auto-magic redeploy failed: ${result.error}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redeployError = msg;
    console.warn(`[Kebab MCP first-run] auto-magic redeploy threw: ${msg}`);
  }

  return NextResponse.json({
    ok: true,
    token,
    instanceUrl,
    autoMagic: true,
    envWritten,
    redeployTriggered,
    redeployError,
  });
}

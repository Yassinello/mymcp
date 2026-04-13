import { NextResponse } from "next/server";
import { isFirstRunMode, isBootstrapActive, rehydrateBootstrapAsync } from "@/core/first-run";

/**
 * GET /api/welcome/status
 *
 * Polled by the welcome page to detect when the user has finished pasting
 * their token into Vercel and triggered a redeploy. At that point
 * MCP_AUTH_TOKEN is set "for real" and isBootstrapActive() returns false.
 */
export async function GET() {
  await rehydrateBootstrapAsync();
  const initialized = !isFirstRunMode();
  const isBootstrap = isBootstrapActive();
  const permanent = initialized && !isBootstrap;
  return NextResponse.json({ initialized, permanent, isBootstrap });
}

import { NextResponse } from "next/server";
import { isFirstRunMode, isBootstrapActive } from "@/core/first-run";
import { composeRequestPipeline, rehydrateStep, type PipelineContext } from "@/core/pipeline";

/**
 * GET /api/welcome/status
 *
 * Polled by the welcome page to detect when the user has finished pasting
 * their token into Vercel and triggered a redeploy. At that point
 * MCP_AUTH_TOKEN is set "for real" and isBootstrapActive() returns false.
 *
 * v0.11 Phase 41: public endpoint (no auth); pipeline just provides rehydrate
 * so a cold lambda sees the rehydrated bootstrap state.
 */
async function getHandler(_ctx: PipelineContext) {
  const initialized = !isFirstRunMode();
  const isBootstrap = isBootstrapActive();
  const permanent = initialized && !isBootstrap;
  return NextResponse.json({ initialized, permanent, isBootstrap });
}

export const GET = composeRequestPipeline([rehydrateStep], getHandler);

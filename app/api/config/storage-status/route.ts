import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/core/auth";
import { isClaimer } from "@/core/first-run";
import { isLoopbackRequest } from "@/core/request-utils";
import {
  detectStorageBackend,
  isUpstashConfigured,
  isVercelApiConfigured,
} from "@/core/credential-store";
import { composeRequestPipeline, rehydrateStep, type PipelineContext } from "@/core/pipeline";

/**
 * GET /api/config/storage-status
 * Returns current credential storage backend info.
 *
 * Auth: admin auth when MCP_AUTH_TOKEN is set; otherwise accept
 * first-run claimer or loopback (same pattern as /api/storage/status).
 *
 * v0.11 Phase 41: pipeline provides rehydrate; the conditional auth
 * ladder (admin if token configured, else claimer/loopback) stays
 * inline — too bespoke for a generic authStep variant.
 */
async function getHandler(ctx: PipelineContext): Promise<Response> {
  const request = ctx.request;

  if (process.env.MCP_AUTH_TOKEN) {
    const authError = await checkAdminAuth(request);
    if (authError) return authError;
  } else {
    if (!isLoopbackRequest(request) && !(await isClaimer(request))) {
      return NextResponse.json(
        { error: "Unauthorized — claim this instance via /welcome first" },
        { status: 401 }
      );
    }
  }

  return NextResponse.json({
    backend: detectStorageBackend(),
    upstashConfigured: isUpstashConfigured(),
    vercelApiConfigured: isVercelApiConfigured(),
    isVercel: process.env.VERCEL === "1",
  });
}

export const GET = composeRequestPipeline([rehydrateStep], getHandler);

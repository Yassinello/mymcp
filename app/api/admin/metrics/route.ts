import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/core/auth";
import { getToolStats } from "@/core/logging";

/**
 * GET /api/admin/metrics
 *
 * Aggregate tool-call metrics from the in-memory ring buffer.
 * Unblocks "by-tool latency + error rate" dashboard widgets and external
 * monitoring polls.
 *
 * Response shape:
 *   {
 *     totalCalls, errorCount, avgDurationMs, p95DurationMs,
 *     byTool: { [name]: { calls, errors, avgMs, p95Ms, errorRate } },
 *     byToken: { [id]: { calls, errors } }
 *   }
 *
 * Auth: admin-authed. The response contains no secret values — just
 * aggregate counters. Still gated to prevent public reconnaissance of
 * which tools are hot (some tool names hint at the deployment's
 * intended use).
 */
export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;
  return NextResponse.json(getToolStats());
}

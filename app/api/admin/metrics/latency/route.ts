/**
 * Phase 53 — GET /api/admin/metrics/latency
 *
 * Returns the top-N slowest tools by p95 duration in the current 24h
 * window. Backs the /config Health "Latency" horizontal bar chart.
 *
 * Query params:
 *   - tenant: "__all__" | "<tenantId>" | omitted (default "__all__").
 *   - limit: clamp 1..50, default 10.
 *
 * Response: { tools: [{ name, p95Ms, calls }], source: "buffer" | "durable" }
 */

import { NextResponse } from "next/server";
import { withAdminAuth } from "@/core/with-admin-auth";
import type { PipelineContext } from "@/core/pipeline";
import { aggregateLatencyByTool, getMetricsSource } from "@/core/metrics";

async function handler(ctx: PipelineContext) {
  const url = new URL(ctx.request.url);
  const tenantParam = url.searchParams.get("tenant");
  const limitParam = parseInt(url.searchParams.get("limit") ?? "10", 10);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(50, limitParam)) : 10;

  const tenantScope = tenantParam && tenantParam.length > 0 ? tenantParam : "__all__";

  const { logs, source } = await getMetricsSource(tenantScope);
  const tools = aggregateLatencyByTool(logs, limit);

  return NextResponse.json({ tools, source });
}

export const GET = withAdminAuth(handler);

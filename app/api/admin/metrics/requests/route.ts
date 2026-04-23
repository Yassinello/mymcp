/**
 * Phase 53 — GET /api/admin/metrics/requests
 *
 * Returns 24 hourly request-count buckets for the requested tenant
 * scope. Backs the /config Health "Requests over time" chart.
 *
 * Query params:
 *   - tenant: "__all__" (root-operator aggregate) | "<tenantId>" |
 *     omitted (defaults to "__all__" for backward-compat).
 *   - tool: optional tool-name filter (exact match on
 *     `"<connector>.<tool>"`).
 *
 * Response: { hours: [{ ts, count }], source: "buffer" | "durable" }
 */

import { NextResponse } from "next/server";
import { withAdminAuth } from "@/core/with-admin-auth";
import type { PipelineContext } from "@/core/pipeline";
import { aggregateRequestsByHour, getMetricsSource } from "@/core/metrics";
import { getCurrentTenantId } from "@/core/request-context";

async function handler(ctx: PipelineContext) {
  const url = new URL(ctx.request.url);
  const tenantParam = url.searchParams.get("tenant");
  const toolParam = url.searchParams.get("tool");

  // Scoped admins: getMetricsSource forces to their tenantId regardless
  // of the param. Root: honours the param (default "__all__").
  const callerTenantId = getCurrentTenantId();
  const tenantScope = tenantParam && tenantParam.length > 0 ? tenantParam : "__all__";

  const { logs, source } = await getMetricsSource(tenantScope, callerTenantId);
  const hours = aggregateRequestsByHour(
    logs,
    Date.now(),
    toolParam ? { tool: toolParam } : undefined
  );

  return NextResponse.json({ hours, source });
}

export const GET = withAdminAuth(handler);

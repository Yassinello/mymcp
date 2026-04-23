/**
 * Phase 53 — GET /api/admin/metrics/errors
 *
 * Returns a connector × hour error matrix for the requested tenant
 * scope. Backs the /config Health error-rate heatmap.
 *
 * Query params:
 *   - tenant: "__all__" | "<tenantId>" | omitted (default "__all__").
 *
 * Response: { connectors: [{ connectorId, hours: [{ ts, errors, total }] }], source }
 */

import { NextResponse } from "next/server";
import { withAdminAuth } from "@/core/with-admin-auth";
import type { PipelineContext } from "@/core/pipeline";
import { aggregateErrorsByConnectorHour, getMetricsSource } from "@/core/metrics";

async function handler(ctx: PipelineContext) {
  const url = new URL(ctx.request.url);
  const tenantParam = url.searchParams.get("tenant");
  const tenantScope = tenantParam && tenantParam.length > 0 ? tenantParam : "__all__";

  const { logs, source } = await getMetricsSource(tenantScope);
  const connectors = aggregateErrorsByConnectorHour(logs, Date.now());

  return NextResponse.json({ connectors, source });
}

export const GET = withAdminAuth(handler);

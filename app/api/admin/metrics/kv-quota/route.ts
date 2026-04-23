/**
 * Phase 53 — GET /api/admin/metrics/kv-quota
 *
 * Surfaces Upstash KV memory usage on the /config Health dashboard.
 * Returns 200 + `source: "unknown"` when Upstash creds are absent so
 * the UI renders an "unavailable" badge instead of a red error.
 *
 * Response shape:
 *   {
 *     usedBytes: number | null,
 *     usedHuman: string | null,
 *     limitBytes: number | null,
 *     percentage: number | null,
 *     source: "upstash" | "unknown"
 *   }
 *
 * Cache-Control: private, max-age=30 so a 60s UI poll only hits
 * Upstash every other tick. Handles clock skew + avoids hammering the
 * endpoint when multiple admin browsers are open.
 *
 * Limit: `UPSTASH_FREE_TIER_BYTES` env var, default 250 MB (Upstash
 * free tier ceiling). Operators on a paid tier should override it.
 */

import { NextResponse } from "next/server";
import { withAdminAuth } from "@/core/with-admin-auth";
import { getUpstashInfo } from "@/core/upstash-rest";
import { getConfigInt } from "@/core/config-facade";
import { getCurrentTenantId } from "@/core/request-context";

const DEFAULT_FREE_TIER_BYTES = 250 * 1024 * 1024; // 250 MB

async function handler() {
  // Root-scope only: KV quota is instance-wide, not per-tenant.
  if (getCurrentTenantId() !== null) {
    return NextResponse.json({ error: "root_only" }, { status: 403 });
  }
  const info = await getUpstashInfo();
  if (info === null) {
    return NextResponse.json(
      {
        usedBytes: null,
        usedHuman: null,
        limitBytes: null,
        percentage: null,
        source: "unknown",
      },
      {
        headers: { "Cache-Control": "private, max-age=30" },
      }
    );
  }

  const limitBytes = getConfigInt("UPSTASH_FREE_TIER_BYTES", DEFAULT_FREE_TIER_BYTES);
  const percentage =
    info.usedBytes !== null && limitBytes > 0 ? (info.usedBytes / limitBytes) * 100 : null;

  return NextResponse.json(
    {
      usedBytes: info.usedBytes,
      usedHuman: info.usedHuman,
      limitBytes,
      percentage: percentage === null ? null : Math.round(percentage * 100) / 100,
      source: info.source,
    },
    {
      headers: { "Cache-Control": "private, max-age=30" },
    }
  );
}

export const GET = withAdminAuth(handler);

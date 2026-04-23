/**
 * Phase 53 — GET /api/admin/metrics/ratelimit
 *
 * Returns the live rate-limit bucket state for the current minute
 * window across all active tenants. Backs the /config Health
 * "Rate-limit buckets" table panel.
 *
 * Uses the same scan + parse logic as /api/admin/rate-limits — the
 * parseRateLimitKey helper in src/core/rate-limit.ts is the shared
 * truth to prevent drift between the two admin views.
 *
 * Root-scope only: this route is admin-gated. A tenant-scoped admin
 * would already see filtered results via the getContextKVStore wrapper
 * in the default path; but Phase 53's dashboard target is the root
 * operator so we use the cross-tenant scan directly when possible.
 *
 * Response: { buckets: [{ tenantIdMasked, scope, current, max, resetAt }] }
 */

import { NextResponse } from "next/server";
import { getKVStore, kvScanAll } from "@/core/kv-store";
import { withAdminAuth } from "@/core/with-admin-auth";
import { getConfigInt } from "@/core/config-facade";
import { parseRateLimitKey } from "@/core/rate-limit";
import { getCurrentTenantId } from "@/core/request-context";

function maskTenantId(tenantId: string): string {
  if (tenantId.length <= 4) return tenantId;
  return tenantId.slice(0, 4) + "…";
}

async function handler() {
  // Root-scope only: scoped admins must not see cross-tenant bucket rows.
  // The 4-char tenantId prefix is weak isolation on small deployments.
  if (getCurrentTenantId() !== null) {
    return NextResponse.json({ error: "root_only" }, { status: 403 });
  }
  const defaultLimit = Math.max(1, getConfigInt("MYMCP_RATE_LIMIT_RPM", 60));
  const windowMs = 60_000;
  const now = Date.now();
  const currentBucket = Math.floor(now / windowMs);
  const resetAt = (currentBucket + 1) * windowMs;

  try {
    const rawKV = getKVStore();
    const [rlKeys, tenantKeys] = await Promise.all([
      kvScanAll(rawKV, "ratelimit:*"),
      kvScanAll(rawKV, "tenant:*"),
    ]);

    interface Active {
      key: string;
      tenantId: string;
      scope: string;
    }
    const active: Active[] = [];
    for (const key of [...rlKeys, ...tenantKeys]) {
      const parsed = parseRateLimitKey(key);
      if (!parsed || parsed.bucket !== currentBucket) continue;
      active.push({ key, tenantId: parsed.tenantId, scope: parsed.scope });
    }

    if (active.length === 0) {
      return NextResponse.json({ buckets: [] });
    }

    const readKeys = active.map((a) => a.key);
    const values: (string | null)[] =
      typeof rawKV.mget === "function"
        ? await rawKV.mget(readKeys)
        : await Promise.all(readKeys.map((k) => rawKV.get(k)));

    // Group by (tenantId, scope) — legacy and new shapes can co-exist
    // in a single deployment during the migration window.
    const groups = new Map<string, { tenantId: string; scope: string; current: number }>();
    for (let i = 0; i < active.length; i++) {
      const entry = active[i];
      if (!entry) continue;
      const raw = values[i];
      const count = raw ? parseInt(raw, 10) || 0 : 0;
      if (count === 0) continue;
      const groupKey = `${entry.tenantId}:${entry.scope}`;
      const existing = groups.get(groupKey);
      if (existing) existing.current += count;
      else groups.set(groupKey, { tenantId: entry.tenantId, scope: entry.scope, current: count });
    }

    const buckets = Array.from(groups.values())
      .map((g) => ({
        tenantIdMasked: maskTenantId(g.tenantId),
        scope: g.scope,
        current: g.current,
        max: defaultLimit,
        resetAt,
      }))
      .sort((a, b) => b.current / b.max - a.current / a.max);

    return NextResponse.json({ buckets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read rate limits" },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handler);

import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/core/auth";
import { isClaimer } from "@/core/first-run";
import { isLoopbackRequest } from "@/core/request-utils";
import { detectStorageMode, clearStorageModeCache } from "@/core/storage-mode";
import { getKVStore, kvScanAll } from "@/core/kv-store";
import { CRED_PREFIX } from "@/core/credential-store";

/**
 * GET /api/storage/status
 * Returns the current storage mode + counts.
 *
 * Auth: admin auth when MCP_AUTH_TOKEN is set; otherwise accept first-run
 * claimer or loopback (matches /api/config/storage-status legacy behavior so
 * the welcome flow can call this before the user has minted a token).
 *
 * Query params:
 *   ?force=1 — bust the 60s detection cache (used by "Recheck" button)
 *   ?counts=0 — skip the count scan when only the mode is needed (cheap path)
 */
export async function GET(request: Request) {
  if (process.env.MCP_AUTH_TOKEN) {
    const authError = checkAdminAuth(request);
    if (authError) return authError;
  } else {
    if (!isLoopbackRequest(request) && !isClaimer(request)) {
      return NextResponse.json(
        { error: "Unauthorized — claim this instance via /welcome first" },
        { status: 401 }
      );
    }
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const wantCounts = url.searchParams.get("counts") !== "0";

  if (force) clearStorageModeCache();

  const report = await detectStorageMode({ force });

  let counts: { credentials: number; skills: number; total: number } | null = null;
  // Counts are only meaningful when KV / file backend is reachable. Static
  // mode means no persisted data — and kv-degraded means we shouldn't hit
  // the (unreachable) backend.
  if (wantCounts && (report.mode === "kv" || report.mode === "file")) {
    try {
      const kv = getKVStore();
      const credKeys = await kvScanAll(kv, `${CRED_PREFIX}*`);
      const skillKeys = await kvScanAll(kv, `skill:*`);
      counts = {
        credentials: credKeys.length,
        skills: skillKeys.length,
        total: credKeys.length + skillKeys.length,
      };
    } catch {
      // Don't fail the whole status call if scan blows up — surface mode anyway.
      counts = null;
    }
  }

  // Backward-compatible legacy fields so the existing welcome page can keep
  // calling /api/config/storage-status until we migrate it. New consumers
  // should use the structured `report` field exclusively.
  return NextResponse.json({
    ...report,
    counts,
    legacy: {
      backend:
        report.mode === "kv"
          ? "upstash"
          : report.mode === "file"
            ? "filesystem"
            : report.mode === "static"
              ? "none"
              : "kv-degraded",
      upstashConfigured: Boolean(
        process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
      ),
      isVercel: process.env.VERCEL === "1",
    },
  });
}

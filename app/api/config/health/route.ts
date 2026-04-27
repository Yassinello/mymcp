import { NextResponse } from "next/server";
import { isFirstRunMode, isBootstrapActive } from "@/core/first-run";
import { isVercelAutoMagicAvailable } from "@/core/env-store";
import { hasUpstashCreds } from "@/core/upstash-env";
import { withAdminAuth } from "@/core/with-admin-auth";
import type { PipelineContext } from "@/core/pipeline";
import { getConfig } from "@/core/config-facade";

export const dynamic = "force-dynamic";

/**
 * Token persistence categories surfaced in the dashboard.
 *
 * - `pinned` — MCP_AUTH_TOKEN is set in `process.env`. The fastest path:
 *   no KV read on cold start. Achievable by clicking "Pin to Vercel
 *   env vars" in the health widget (or pasting the token manually).
 * - `persisted-kv` — Token is bootstrap-minted but Upstash KV credentials
 *   are present, so the token is durably persisted to KV and rehydrated
 *   on every cold start. Functionally equivalent to `pinned` for the
 *   user; the only cost is one KV round-trip on cold start (~30ms).
 * - `in-memory` — Bootstrap token without Upstash. Survives the current
 *   warm lambda only; will be lost on the next cold start. Degraded
 *   mode that requires the user's attention.
 * - `unconfigured` — First-run, no token minted yet.
 */
export type TokenStatus = "pinned" | "persisted-kv" | "in-memory" | "unconfigured";

export interface HealthResponse {
  ok: true;
  tokenStatus: TokenStatus;
  isVercel: boolean;
  vercelAutoMagicAvailable: boolean;
  instanceUrl: string;
}

async function getHandler(ctx: PipelineContext) {
  const request = ctx.request;

  let tokenStatus: TokenStatus;
  if (isFirstRunMode()) {
    tokenStatus = "unconfigured";
  } else if (!isBootstrapActive()) {
    // process.env.MCP_AUTH_TOKEN is the source of truth — token is pinned.
    tokenStatus = "pinned";
  } else if (hasUpstashCreds()) {
    // Bootstrap-minted token, but Upstash is connected → durably persisted.
    tokenStatus = "persisted-kv";
  } else {
    // Bootstrap-minted token with no durable backing store → ephemeral.
    tokenStatus = "in-memory";
  }

  const isVercel = getConfig("VERCEL") === "1";
  const vercelAutoMagicAvailable = isVercelAutoMagicAvailable();

  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const instanceUrl = `${proto}://${host}`;

  const body: HealthResponse = {
    ok: true,
    tokenStatus,
    isVercel,
    vercelAutoMagicAvailable,
    instanceUrl,
  };
  return NextResponse.json(body);
}

export const GET = withAdminAuth(getHandler);

/**
 * Claim primitives: signed cookie helpers and the claim Map.
 *
 * "Claims" are browser-side signed cookies issued by /api/welcome/claim.
 * Only ONE active claim is allowed at a time — first writer wins.
 * The higher-level `getOrCreateClaim` and `isClaimer` live in bootstrap.ts
 * because they need access to `activeBootstrap` (avoids circular imports).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSigningSecret } from "../signing-secret";

export const FIRST_RUN_COOKIE_NAME = "mymcp_firstrun_claim";
export const CLAIM_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface ClaimResult {
  claimId: string;
  isNewClaim: boolean;
  isClaimer: boolean;
  cookieToSet?: string;
}

interface ClaimRecord {
  createdAt: number;
}

// Module-level claim store shared with bootstrap.ts via this export.
export const claims = new Map<string, ClaimRecord>();

// ── Internal crypto helpers ──────────────────────────────────────────────────

async function sign(value: string): Promise<string> {
  const secret = await getSigningSecret();
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export async function encodeCookie(claimId: string): Promise<string> {
  return `${claimId}.${await sign(claimId)}`;
}

async function decodeCookie(raw: string): Promise<string | null> {
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const claimId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!claimId || !sig) return null;
  if (!safeEqHex(sig, await sign(claimId))) return null;
  return claimId;
}

export async function readClaimCookie(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const re = new RegExp(`(?:^|;\\s*)${FIRST_RUN_COOKIE_NAME}=([^;]+)`);
  const m = cookieHeader.match(re);
  const raw = m?.[1];
  if (!raw) return null;
  return decodeCookie(decodeURIComponent(raw));
}

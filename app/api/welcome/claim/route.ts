import { NextResponse } from "next/server";
import {
  getOrCreateClaim,
  isFirstRunMode,
  isBootstrapActive,
  rehydrateBootstrapAsync,
  FIRST_RUN_COOKIE_NAME,
  CLAIM_TTL_MS,
} from "@/core/first-run";

/**
 * POST /api/welcome/claim
 *
 * Returns one of:
 *   { status: "already-initialized" } — instance has a permanent token
 *   { status: "claimer", isNew: false }
 *   { status: "new", isNew: true } (sets cookie)
 *   { status: "claimed-by-other" }
 */
export async function POST(request: Request) {
  await rehydrateBootstrapAsync();
  if (!isFirstRunMode() && !isBootstrapActive()) {
    return NextResponse.json({ status: "already-initialized" });
  }

  const result = getOrCreateClaim(request);

  if (!result.isClaimer) {
    return NextResponse.json({ status: "claimed-by-other" }, { status: 423 });
  }

  const status = result.isNewClaim ? "new" : "claimer";
  const res = NextResponse.json({ status, isNew: result.isNewClaim });

  if (result.cookieToSet) {
    // Secure cookie. Marked HttpOnly so the token claim can't be read from JS.
    const secureFlag = process.env.VERCEL === "1" ? "; Secure" : "";
    res.headers.set(
      "set-cookie",
      `${FIRST_RUN_COOKIE_NAME}=${encodeURIComponent(result.cookieToSet)}; Path=/; HttpOnly; SameSite=Strict${secureFlag}; Max-Age=${Math.floor(CLAIM_TTL_MS / 1000)}`
    );
  }

  return res;
}

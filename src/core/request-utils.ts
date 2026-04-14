/**
 * Shared HTTP request helpers.
 *
 * Currently used by first-run / setup paths to determine whether a request
 * originates from a loopback address — first-run flows trust loopback as a
 * substitute for a real auth token.
 */

import type { NextRequest } from "next/server";

function isLoopbackCandidate(ip: string): boolean {
  const n = ip
    .replace(/^::ffff:/, "")
    .trim()
    .toLowerCase();
  return n === "127.0.0.1" || n === "::1" || n === "localhost" || n.startsWith("127.");
}

/**
 * Returns true if the request safely originates from loopback.
 *
 * Priority:
 * 1. On Vercel, never — hard guard against any misconfiguration granting
 *    first-run admin access in production.
 * 2. If `x-forwarded-for` / `x-real-ip` is set (proxy in front), require
 *    the leftmost IP to be loopback.
 * 3. If `NextRequest.ip` is available (older Next versions), check it.
 * 4. Fall back to inspecting the URL hostname — trust the request only
 *    when the destination itself is a loopback name (`localhost`, `127.x`,
 *    `::1`). This handles `next dev` via `http://localhost:3000` without
 *    false-positives for Docker/custom deploys behind a proxy that
 *    forgets to set `x-forwarded-for`.
 *
 * Previous behavior fell through to `return true` which silently granted
 * admin access to any unproxied request on non-Vercel deploys. Fixed in
 * v0.5 phase 13 after API route tests caught the regression.
 */
export function isLoopbackRequest(request: Request): boolean {
  if (process.env.VERCEL === "1") return false;

  const xff = request.headers.get("x-forwarded-for");
  const xri = request.headers.get("x-real-ip");
  if (xff) {
    const leftmost = xff.split(",")[0]?.trim() || "";
    return isLoopbackCandidate(leftmost);
  }
  if (xri) {
    return isLoopbackCandidate(xri);
  }
  const ip = (request as unknown as NextRequest & { ip?: string }).ip;
  if (ip) return isLoopbackCandidate(ip);

  // Last resort: check the URL hostname. Only trust loopback destinations.
  try {
    const urlHost = new URL(request.url).hostname.toLowerCase();
    return isLoopbackCandidate(urlHost);
  } catch {
    return false;
  }
}

/**
 * Best-effort client IP extraction for per-IP rate limiting.
 *
 * Priority: x-forwarded-for leftmost → x-real-ip → NextRequest.ip → "unknown".
 * Only trust x-forwarded-for when running behind Vercel (VERCEL=1) — otherwise
 * a malicious client could spoof it.
 */
export function getClientIP(request: Request): string {
  const isVercel = process.env.VERCEL === "1";
  if (isVercel) {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
      const leftmost = xff.split(",")[0]?.trim();
      if (leftmost) return leftmost;
    }
    const xri = request.headers.get("x-real-ip");
    if (xri) return xri.trim();
  }
  const ip = (request as unknown as NextRequest & { ip?: string }).ip;
  if (ip) return ip;
  return "unknown";
}

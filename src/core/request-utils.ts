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
 * - If X-Forwarded-For or X-Real-IP is set (proxy in front), require the
 *   leftmost client IP to be loopback.
 * - Otherwise inspect NextRequest.ip if available.
 * - Fall back to trusting direct Node connections (typical `next dev`).
 */
export function isLoopbackRequest(request: Request): boolean {
  // Hard guard: on Vercel we are NEVER loopback. This prevents the fallback
  // below from accidentally granting first-run admin access if proxy headers
  // are missing for any reason during an edge case.
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
  return true;
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

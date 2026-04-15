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
 * 2. `x-forwarded-for` / `x-real-ip` are ONLY consulted when
 *    MYMCP_TRUST_URL_HOST=1. These headers are client-supplied on any
 *    self-hosted deploy that doesn't put a header-stripping proxy in
 *    front, so trusting them unconditionally would let a remote caller
 *    claim loopback by sending `x-forwarded-for: 127.0.0.1`.
 * 3. If `NextRequest.ip` is available (older Next versions), check it.
 * 4. URL-host fallback (also gated on MYMCP_TRUST_URL_HOST=1).
 *
 * Previous behavior (v0.5 phase 13) trusted the URL host unconditionally.
 * v0.6 NIT-05 gated the URL host behind MYMCP_TRUST_URL_HOST. v0.6
 * HIGH-1 extended the gate to cover x-forwarded-for / x-real-ip for the
 * same reason — a spoofable trust input must be explicitly enabled.
 */
export function isLoopbackRequest(request: Request): boolean {
  if (process.env.VERCEL === "1") return false;

  // Forwarded headers (x-forwarded-for / x-real-ip) are spoofable on any
  // deploy that isn't behind a proxy that strips client-supplied copies.
  // Only trust them when the operator has explicitly opted in via
  // MYMCP_TRUST_URL_HOST=1 (reuses the v0.5 NIT-05 env var — when you
  // trust the URL host, you also trust your forwarding layer's headers).
  // Vercel already short-circuited above.
  const trustForwarded = process.env.MYMCP_TRUST_URL_HOST === "1";
  const xff = request.headers.get("x-forwarded-for");
  const xri = request.headers.get("x-real-ip");
  if (trustForwarded) {
    if (xff) {
      const leftmost = xff.split(",")[0]?.trim() || "";
      return isLoopbackCandidate(leftmost);
    }
    if (xri) {
      return isLoopbackCandidate(xri);
    }
  }
  const ip = (request as unknown as NextRequest & { ip?: string }).ip;
  if (ip) return isLoopbackCandidate(ip);

  // Last resort, opt-in only: check the URL hostname. Off by default
  // because a misconfigured reverse proxy can forward Host: localhost
  // from the public internet. Set MYMCP_TRUST_URL_HOST=1 only when you
  // know nothing in front of this server can spoof Host.
  if (process.env.MYMCP_TRUST_URL_HOST === "1") {
    try {
      const urlHost = new URL(request.url).hostname.toLowerCase();
      return isLoopbackCandidate(urlHost);
    } catch {
      return false;
    }
  }
  return false;
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

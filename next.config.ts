import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * Trade-offs:
 * - `script-src 'self' 'unsafe-inline'`: Next 16 inlines runtime helpers and
 *   hydration payloads. `'unsafe-inline'` for scripts is a pragmatic
 *   compromise until Next ships stable nonce-based CSP. Remove the
 *   `'unsafe-inline'` once upstream support lands.
 * - `style-src 'self' 'unsafe-inline'`: Tailwind v4 injects styles inline.
 *   Same compromise.
 * - `connect-src 'self'` plus explicit Upstash host when configured — the
 *   dashboard only talks to its own origin and the KV backend. External
 *   connector APIs are called server-side, not from the browser.
 * - `frame-ancestors 'none'` replaces the deprecated X-Frame-Options DENY.
 */
function buildCsp(): string {
  const upstashOrigin = (() => {
    try {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      if (!url) return "";
      return new URL(url).origin;
    } catch {
      return "";
    }
  })();

  const connectSrc = ["'self'", upstashOrigin].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSrc}`,
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: buildCsp() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Legacy but cheap — modern browsers honor frame-ancestors in CSP,
  // older ones still read this.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;

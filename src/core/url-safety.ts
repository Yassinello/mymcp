/**
 * url-safety — single SSRF guard for the entire codebase.
 *
 * Exports:
 *   - isPublicUrlSync(url, opts?)  — synchronous, no DNS resolution
 *   - isPublicUrl(url, opts?)      — async, supports opts.resolveDns
 *   - UrlSafetyError + IsPublicUrlOptions types
 *
 * Categories (discriminated union via UrlSafetyError.code):
 *   invalid_url | bad_scheme | loopback | private_ip | cloud_metadata
 *   | link_local | cgnat | dns_resolved_private
 *
 * Coverage:
 *   - Scheme allowlist:    http, https
 *   - Loopback:            127/8, 0/8, ::1
 *   - Cloud metadata:      169.254.169.254, metadata.google.internal,
 *                          metadata, instance-data.ec2.internal
 *   - RFC1918:             10/8, 172.16-31/12, 192.168/16
 *   - Link-local:          169.254/16 (except cloud-metadata IP)
 *   - CGNAT:               100.64/10
 *   - IPv6 ULA:            fc/7, fd/8 → private_ip
 *   - IPv6 link-local:     fe80/10 → link_local
 *   - IPv4-mapped IPv6:    ::ffff:x.y.z.w recurses into IPv4 logic
 *                          (handles both dotted and compact-hex forms)
 *   - Optional DNS:        resolveDns=true → lookup(hostname, { all: true })
 *                          and each record goes through the literal-IP check.
 *
 * Phase 44 SCM-05 — consolidates prior divergent guards in
 * src/connectors/browser/lib/browserbase.ts and
 * src/connectors/skills/lib/remote-fetcher.ts.
 */

import { lookup } from "node:dns/promises";

export type UrlSafetyCode =
  | "invalid_url"
  | "bad_scheme"
  | "loopback"
  | "private_ip"
  | "cloud_metadata"
  | "link_local"
  | "cgnat"
  | "dns_resolved_private";

export class UrlSafetyError extends Error {
  public readonly code: UrlSafetyCode;
  constructor(code: UrlSafetyCode, message: string) {
    super(message);
    this.name = "UrlSafetyError";
    this.code = code;
  }
}

export interface IsPublicUrlOptions {
  /** Permit 127/8, 0/8, ::1, localhost. Default: false. */
  allowLoopback?: boolean;
  /** Permit 169.254.169.254 + metadata hostnames. Default: false. */
  allowCloudMetadata?: boolean;
  /** Permit RFC1918, CGNAT, IPv6 ULA, link-local. Default: false.
   *  Does NOT imply allowCloudMetadata. */
  allowPrivateNetwork?: boolean;
  /** If true, resolve DNS via node:dns/promises.lookup and validate each record.
   *  Only honored by `isPublicUrl` (async). `isPublicUrlSync` ignores it. */
  resolveDns?: boolean;
}

type Result = { ok: true } | { ok: false; error: UrlSafetyError };

// Hostnames that must never be reached regardless of IP resolution.
const CLOUD_METADATA_HOSTNAMES = new Set<string>([
  "metadata.google.internal",
  "metadata",
  "instance-data.ec2.internal",
]);

function err(code: UrlSafetyCode, message: string): Result {
  return { ok: false, error: new UrlSafetyError(code, message) };
}

/**
 * Parse an IPv4 literal ("a.b.c.d" where each octet is 0-255).
 * Returns null if the string is not an IPv4 literal.
 */
function parseIPv4(host: string): [number, number, number, number] | null {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split(".").map((s) => Number(s));
  if (parts.length !== 4) return null;
  for (const p of parts) {
    if (!Number.isInteger(p) || p < 0 || p > 255) return null;
  }
  return parts as [number, number, number, number];
}

/**
 * Classify an IPv4 literal into a UrlSafetyCode or null if it's a public IP.
 * Does not consult opts — callers apply overrides after classification.
 */
function classifyIPv4(host: string): UrlSafetyCode | null {
  const parts = parseIPv4(host);
  if (!parts) return null;
  const [a, b] = parts;

  // 127/8 loopback, 0/8 "this network" (unroutable)
  if (a === 127 || a === 0) return "loopback";

  // Cloud metadata IP (must match BEFORE generic link-local 169.254/16)
  if (a === 169 && b === 254 && parts[2] === 169 && parts[3] === 254) {
    return "cloud_metadata";
  }
  // Link-local 169.254/16
  if (a === 169 && b === 254) return "link_local";

  // RFC1918
  if (a === 10) return "private_ip";
  if (a === 172 && b >= 16 && b <= 31) return "private_ip";
  if (a === 192 && b === 168) return "private_ip";

  // CGNAT 100.64/10 → 100.64.0.0 .. 100.127.255.255
  if (a === 100 && b >= 64 && b <= 127) return "cgnat";

  return null;
}

/**
 * Classify a canonical (lowercased, bracket-stripped) IPv6 string.
 * Does NOT do full IPv6 parsing — relies on prefix heuristics used by
 * the prior remote-fetcher implementation.
 */
function classifyIPv6(host: string): UrlSafetyCode | null {
  const lower = host.toLowerCase();

  // Normalize extremes
  if (lower === "::1" || lower === "::") return "loopback";

  // IPv4-mapped ::ffff:a.b.c.d — delegate to IPv4. WHATWG URL parser
  // normalizes this to the compact hex form `::ffff:WWWW:XXXX` so we
  // handle both surface forms.
  const mappedDotted = lower.match(/^::ffff:([0-9.]+)$/);
  if (mappedDotted) {
    return classifyIPv4(mappedDotted[1]);
  }
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return classifyIPv4(dotted);
  }

  // Link-local fe80::/10 (prefix covers fe8..feb nibble-wise)
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  ) {
    return "link_local";
  }

  // ULA fc00::/7 (fc.. and fd..)
  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return "private_ip";
  }

  return null;
}

/**
 * Apply opts overrides. Given a category classification, decide whether
 * opts permits it through.
 */
function isAllowed(code: UrlSafetyCode, opts: IsPublicUrlOptions): boolean {
  if (opts.allowLoopback && code === "loopback") return true;
  if (opts.allowCloudMetadata && code === "cloud_metadata") return true;
  if (opts.allowPrivateNetwork) {
    // Private network encompasses: private_ip, link_local, cgnat.
    // Cloud metadata NEVER flips via allowPrivateNetwork — it requires
    // its own explicit opt-in.
    if (code === "private_ip" || code === "link_local" || code === "cgnat") {
      return true;
    }
  }
  return false;
}

/**
 * Core syntactic check. Parses URL, enforces scheme, classifies host IP
 * literal (if literal), applies opts. Does NOT do DNS.
 */
export function isPublicUrlSync(url: string, opts: IsPublicUrlOptions = {}): Result {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return err("invalid_url", "Invalid URL format");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return err("bad_scheme", "Only http/https URLs are allowed");
  }

  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.replace(/^\[|\]$/g, "");

  // Explicit localhost hostname (not an IP literal)
  if (host === "localhost" || host.endsWith(".localhost")) {
    if (opts.allowLoopback) return { ok: true };
    return err("loopback", "Access to localhost is not allowed");
  }

  // Cloud metadata hostnames (whitelist)
  if (CLOUD_METADATA_HOSTNAMES.has(host)) {
    if (opts.allowCloudMetadata) return { ok: true };
    return err("cloud_metadata", "Access to cloud metadata is not allowed");
  }

  // IPv4 literal?
  const ipv4Code = classifyIPv4(host);
  if (ipv4Code) {
    if (isAllowed(ipv4Code, opts)) return { ok: true };
    return err(ipv4Code, messageFor(ipv4Code));
  }

  // If host has a dot and parses as IPv4 but unclassified → public IP literal
  if (parseIPv4(host)) return { ok: true };

  // IPv6 literal? (contains `:` and is not a hostname)
  if (host.includes(":")) {
    const ipv6Code = classifyIPv6(host);
    if (ipv6Code) {
      if (isAllowed(ipv6Code, opts)) return { ok: true };
      return err(ipv6Code, messageFor(ipv6Code));
    }
    // Unrecognized IPv6 literal → treat as public.
    return { ok: true };
  }

  // Hostname (not an IP literal). Syntactic check is done — caller
  // may request DNS resolution via the async isPublicUrl.
  return { ok: true };
}

function messageFor(code: UrlSafetyCode): string {
  switch (code) {
    case "loopback":
      return "Access to loopback is not allowed";
    case "private_ip":
      return "Access to private networks is not allowed";
    case "cloud_metadata":
      return "Access to cloud metadata is not allowed";
    case "link_local":
      return "Access to link-local addresses is not allowed";
    case "cgnat":
      return "Access to CGNAT ranges is not allowed";
    case "dns_resolved_private":
      return "Hostname resolves to a blocked network";
    default:
      return "URL is not public";
  }
}

/**
 * Async variant. Runs the syntactic check first, then (if opts.resolveDns)
 * resolves the hostname and validates each A/AAAA record. Fail-closed:
 * DNS lookup errors are reported as { ok: false }.
 */
export async function isPublicUrl(url: string, opts: IsPublicUrlOptions = {}): Promise<Result> {
  const syncResult = isPublicUrlSync(url, opts);
  if (!syncResult.ok) return syncResult;

  if (!opts.resolveDns) return { ok: true };

  // Pull host from the URL once more (cheap; we already parsed inside
  // isPublicUrlSync but we don't pass the URL object out).
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return err("invalid_url", "Invalid URL format");
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // If the host is an IP literal, sync already validated it. DNS would be
  // a no-op (Node returns the literal back). Skip.
  if (parseIPv4(host) || host.includes(":")) {
    return { ok: true };
  }
  // If `localhost` or cloud-metadata hostname, sync already rejected/permitted.
  if (host === "localhost" || CLOUD_METADATA_HOSTNAMES.has(host)) {
    return { ok: true };
  }

  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    // Fail closed: DNS errors mean we can't verify safety. Callers that want
    // "treat unresolved as public" can do that outside this function.
    return err("dns_resolved_private", "DNS lookup failed");
  }

  for (const a of addrs) {
    let code: UrlSafetyCode | null = null;
    if (a.family === 4) {
      code = classifyIPv4(a.address);
    } else if (a.family === 6) {
      code = classifyIPv6(a.address);
    }
    if (code && !isAllowed(code, opts)) {
      return err("dns_resolved_private", "Hostname resolves to a blocked network");
    }
  }

  return { ok: true };
}

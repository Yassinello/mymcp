/**
 * Phase 52 / DEV-04 — HMAC-signed device-invite URLs.
 *
 * An operator minting an invite produces a base64url-encoded, HMAC-SHA256
 * signed payload that identifies:
 *   - the nonce (single-use marker, consumed via KV SETNX)
 *   - the inviting tenant
 *   - the intent (hard-coded "device-invite" to prevent cross-use of
 *     signatures from unrelated signing contexts — e.g. welcome claims)
 *   - the label (propagated to the invited device so the admin doesn't
 *     have to re-type it; covered by HMAC so a tamper flips verification)
 *   - issuedAt / expiresAt (24h default TTL, overridable via
 *     KEBAB_DEVICE_INVITE_TTL_H)
 *
 * The signing secret reuses Phase 37b's `getSigningSecret()` — no new
 * secret minted, no new refusal path introduced (SEC-05 already gates
 * mint on public deploys without durable KV).
 *
 * URL format:
 *   /welcome/device-claim?token=<base64url(JSON)>.<hexHmac>
 *
 * The dot-joined structure mirrors `JWT`-ish layouts but without the
 * header component — we don't need alg negotiation (one algorithm for
 * one purpose). Canonical JSON sorts keys alphabetically before signing
 * so signature verification is deterministic across runtimes.
 *
 * Nonce consumption:
 *   `tenant:<id>:devices:invite:<nonce>` → `{ consumedAt, label }`
 *   TTL = expiresAt - now (24h default) so expired records reclaim KV
 *   space automatically. `consumeDeviceInvite()` uses `setIfNotExists`
 *   so replay attacks (same URL, second claim) return a deterministic
 *   `already_consumed`.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSigningSecret } from "./signing-secret";
import { getContextKVStore } from "./request-context";
import { getConfig } from "./config-facade";

export const DEVICE_INVITE_INTENT = "device-invite" as const;

export interface DeviceInvitePayload {
  nonce: string;
  tenantId: string | null;
  intent: typeof DEVICE_INVITE_INTENT;
  issuedAt: number;
  expiresAt: number;
  label: string;
}

const NONCE_KEY_PREFIX = "devices:invite:";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function ttlMs(): number {
  const raw = getConfig("KEBAB_DEVICE_INVITE_TTL_H");
  if (!raw) return DEFAULT_TTL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_MS;
  return Math.max(1, Math.floor(n * 60 * 60 * 1000));
}

/**
 * Canonical JSON: alphabetical key order. The payload is a flat object
 * with known keys; no nested-object canonicalization needed.
 */
function canonicalize(payload: DeviceInvitePayload): string {
  const keys = Object.keys(payload).sort() as (keyof DeviceInvitePayload)[];
  const pairs: string[] = [];
  for (const k of keys) {
    pairs.push(`${JSON.stringify(k)}:${JSON.stringify(payload[k])}`);
  }
  return `{${pairs.join(",")}}`;
}

function base64urlEncode(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(s: string): string {
  const pad = (4 - (s.length % 4)) % 4;
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(base64, "base64").toString("utf8");
}

function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Mint a new device-invite URL.
 * The URL is a bare path — the caller composes the full origin.
 */
export async function mintDeviceInvite(opts: {
  tenantId: string | null;
  label: string;
  ttlMsOverride?: number;
}): Promise<{ url: string; nonce: string; expiresAt: number }> {
  const secret = await getSigningSecret();
  const now = Date.now();
  const effectiveTtl = opts.ttlMsOverride ?? ttlMs();
  const expiresAt = now + effectiveTtl;
  const nonce = randomBytes(16).toString("hex");

  const payload: DeviceInvitePayload = {
    nonce,
    tenantId: opts.tenantId,
    intent: DEVICE_INVITE_INTENT,
    issuedAt: now,
    expiresAt,
    label: opts.label,
  };
  const canonical = canonicalize(payload);
  const sig = hmacHex(secret, canonical);
  const token = `${base64urlEncode(canonical)}.${sig}`;
  const url = `/welcome/device-claim?token=${token}&label=${encodeURIComponent(opts.label)}`;
  return { url, nonce, expiresAt };
}

export type VerifyResult =
  | { ok: true; payload: DeviceInvitePayload }
  | { ok: false; reason: "expired" | "bad_signature" | "malformed" | "wrong_intent" };

/**
 * Verify a mint-side token. Returns the decoded payload when signature +
 * intent + expiry all pass. Consumption (nonce replay guard) is a
 * separate call via `consumeDeviceInvite()` so the caller can decide
 * whether a replay is a 409 (already claimed) vs 410 (expired).
 */
export async function verifyDeviceInvite(urlToken: string): Promise<VerifyResult> {
  if (!urlToken || typeof urlToken !== "string" || !urlToken.includes(".")) {
    return { ok: false, reason: "malformed" };
  }
  const dotIdx = urlToken.lastIndexOf(".");
  const payloadB64 = urlToken.slice(0, dotIdx);
  const sig = urlToken.slice(dotIdx + 1);
  if (!payloadB64 || !sig) return { ok: false, reason: "malformed" };

  let canonical: string;
  try {
    canonical = base64urlDecode(payloadB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  let payload: DeviceInvitePayload;
  try {
    payload = JSON.parse(canonical) as DeviceInvitePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // Recompute canonical from the parsed payload to defeat reorder-based
  // tampering attempts (signature is over the canonical form, not the
  // attacker-supplied form).
  const recomputedCanonical = canonicalize(payload);
  const secret = await getSigningSecret();
  const expectedSig = hmacHex(secret, recomputedCanonical);
  if (!safeHexEqual(sig, expectedSig)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (payload.intent !== DEVICE_INVITE_INTENT) {
    return { ok: false, reason: "wrong_intent" };
  }
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

/**
 * Atomically mark the invite nonce as consumed. Returns true if this
 * call "won" (nonce was unconsumed); false if a prior claim already
 * consumed it. Uses `setIfNotExists` on the tenant-scoped KV so two
 * concurrent claims can't both succeed.
 *
 * The stored value records the consumption timestamp + the label (for
 * audit). TTL is set to the remaining invite TTL so expired records
 * vacate the KV space automatically.
 */
export async function consumeDeviceInvite(
  nonce: string,
  label: string,
  expiresAt: number
): Promise<boolean> {
  const kv = getContextKVStore();
  const ttlSeconds = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
  const value = JSON.stringify({ consumedAt: new Date().toISOString(), label });
  if (typeof kv.setIfNotExists === "function") {
    const res = await kv.setIfNotExists(`${NONCE_KEY_PREFIX}${nonce}`, value, { ttlSeconds });
    return res.ok;
  }
  // Backend without setIfNotExists — fall back to read-then-set. The
  // built-in backends (Memory / Filesystem / Upstash) all implement it;
  // this fallback only trips on unusual custom KV adapters.
  const existing = await kv.get(`${NONCE_KEY_PREFIX}${nonce}`);
  if (existing) return false;
  await kv.set(`${NONCE_KEY_PREFIX}${nonce}`, value, ttlSeconds);
  return true;
}

/**
 * Inspection helper — returns the consumption record or null. Mostly for
 * tests; the production flow only cares about the boolean from
 * `consumeDeviceInvite`.
 */
export async function readInviteConsumption(
  nonce: string
): Promise<{ consumedAt: string; label: string } | null> {
  const kv = getContextKVStore();
  const raw = await kv.get(`${NONCE_KEY_PREFIX}${nonce}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { consumedAt: string; label: string };
  } catch {
    return null;
  }
}

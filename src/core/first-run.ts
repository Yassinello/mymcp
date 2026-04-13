/**
 * First-run / zero-config bootstrap for Vercel deploys.
 *
 * Problem: We want users to click "Deploy to Vercel" with NO env vars
 * pre-filled, then land on /welcome to generate their auth token. But Vercel
 * serverless does not hot-reload env vars — even writing via the REST API
 * only takes effect on the next cold start.
 *
 * Solution (in-memory bridge):
 * 1. The first browser to POST /api/welcome/claim gets a signed cookie
 *    representing a "claim" on this instance. Only the claimer can later
 *    initialize the token.
 * 2. On init, we generate a 32-byte hex token, mutate process.env so the
 *    current Node instance sees it immediately, AND persist a small JSON
 *    descriptor to /tmp (per-instance, ~15min). Subsequent requests on the
 *    same warm instance work seamlessly.
 * 3. Cold starts re-hydrate from /tmp if the file is still present. Once the
 *    user has manually pasted the token into Vercel and triggered a redeploy,
 *    process.env.MCP_AUTH_TOKEN is set "for real" and the bootstrap state is
 *    cleared.
 *
 * This module is the single source of truth for first-run state. It is safe
 * to import from anywhere — it is side-effect free at module-load apart from
 * the rehydrate attempt, which silently swallows errors.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COOKIE_NAME = "mymcp_firstrun_claim";
const CLAIM_TTL_MS = 30 * 60 * 1000; // 30 minutes
const BOOTSTRAP_TTL_MS = 15 * 60 * 1000; // 15 minutes (Vercel /tmp lifetime)
const BOOTSTRAP_PATH = join(tmpdir(), ".mymcp-bootstrap.json");

interface ClaimRecord {
  createdAt: number;
}

interface BootstrapPayload {
  claimId: string;
  token: string;
  createdAt: number;
}

// Module-level state. Reset on cold start; hydrated from /tmp where possible.
const claims = new Map<string, ClaimRecord>();
let activeBootstrap: BootstrapPayload | null = null;

function getSigningSecret(): string {
  return `mymcp-firstrun-v1:${process.env.VERCEL_GIT_COMMIT_SHA || "local-dev-secret"}`;
}

function sign(value: string): string {
  return createHmac("sha256", getSigningSecret()).update(value).digest("hex");
}

function safeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function encodeCookie(claimId: string): string {
  return `${claimId}.${sign(claimId)}`;
}

function decodeCookie(raw: string): string | null {
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const claimId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!claimId || !sig) return null;
  if (!safeEqHex(sig, sign(claimId))) return null;
  return claimId;
}

function readClaimCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const re = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`);
  const m = cookieHeader.match(re);
  if (!m) return null;
  return decodeCookie(decodeURIComponent(m[1]));
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, rec] of claims.entries()) {
    if (now - rec.createdAt > CLAIM_TTL_MS) claims.delete(id);
  }
  if (activeBootstrap && Date.now() - activeBootstrap.createdAt > BOOTSTRAP_TTL_MS) {
    activeBootstrap = null;
  }
}

/** True when this instance is operating without a real MCP_AUTH_TOKEN. */
export function isFirstRunMode(): boolean {
  return !process.env.MCP_AUTH_TOKEN;
}

/** True when MCP_AUTH_TOKEN comes from our in-memory bootstrap, not Vercel env. */
export function isBootstrapActive(): boolean {
  pruneExpired();
  return activeBootstrap !== null;
}

export interface ClaimResult {
  claimId: string;
  isNewClaim: boolean;
  isClaimer: boolean;
  cookieToSet?: string;
}

/**
 * Get the existing claim (if the request carries a valid claim cookie) or
 * create a new one. Only ONE active claim is allowed at a time — first writer
 * wins, second visitor is told the instance is locked.
 */
export function getOrCreateClaim(request: Request): ClaimResult {
  pruneExpired();

  const existingId = readClaimCookie(request);
  if (existingId && claims.has(existingId)) {
    return { claimId: existingId, isNewClaim: false, isClaimer: true };
  }

  // Cookie present but no in-memory record (cold start). If the bootstrap
  // /tmp file matches, treat them as the claimer.
  if (existingId && activeBootstrap?.claimId === existingId) {
    return { claimId: existingId, isNewClaim: false, isClaimer: true };
  }

  // If another claim is already active and unexpired, refuse to mint another.
  if (claims.size > 0) {
    const otherId = claims.keys().next().value as string;
    return { claimId: otherId, isNewClaim: false, isClaimer: false };
  }

  const claimId = randomBytes(32).toString("hex");
  claims.set(claimId, { createdAt: Date.now() });
  return {
    claimId,
    isNewClaim: true,
    isClaimer: true,
    cookieToSet: encodeCookie(claimId),
  };
}

/** True if the request's claim cookie matches the active in-memory claim. */
export function isClaimer(request: Request): boolean {
  pruneExpired();
  const id = readClaimCookie(request);
  if (!id) return false;
  if (claims.has(id)) return true;
  if (activeBootstrap?.claimId === id) return true;
  return false;
}

/**
 * Generate the user's permanent token, mutate process.env, persist to /tmp.
 * Idempotent: calling twice with the same claimId returns the existing token.
 */
export function bootstrapToken(claimId: string): { token: string } {
  pruneExpired();

  if (activeBootstrap?.claimId === claimId) {
    return { token: activeBootstrap.token };
  }

  const token = randomBytes(32).toString("hex");
  process.env.MCP_AUTH_TOKEN = token;

  activeBootstrap = { claimId, token, createdAt: Date.now() };

  try {
    writeFileSync(BOOTSTRAP_PATH, JSON.stringify(activeBootstrap), { encoding: "utf-8" });
  } catch {
    // Best effort: /tmp may be read-only in some environments.
  }

  return { token };
}

/** Re-hydrate bootstrap state from /tmp on cold start. Called at module load. */
export function rehydrateBootstrapFromTmp(): void {
  try {
    if (!existsSync(BOOTSTRAP_PATH)) return;
    const raw = readFileSync(BOOTSTRAP_PATH, "utf-8");
    const parsed = JSON.parse(raw) as BootstrapPayload;
    if (!parsed?.claimId || !parsed?.token || !parsed?.createdAt) return;
    if (Date.now() - parsed.createdAt > BOOTSTRAP_TTL_MS) return;
    activeBootstrap = parsed;
    claims.set(parsed.claimId, { createdAt: parsed.createdAt });
    if (!process.env.MCP_AUTH_TOKEN) {
      process.env.MCP_AUTH_TOKEN = parsed.token;
    }
  } catch {
    // Ignore malformed/missing bootstrap state.
  }
}

/** Clear all in-memory + on-disk bootstrap state. */
export function clearBootstrap(): void {
  activeBootstrap = null;
  claims.clear();
  try {
    if (existsSync(BOOTSTRAP_PATH)) unlinkSync(BOOTSTRAP_PATH);
  } catch {
    // Ignore.
  }
}

/** Test-only helper. Resets all module-level state. */
export function __resetFirstRunForTests(): void {
  claims.clear();
  activeBootstrap = null;
  try {
    if (existsSync(BOOTSTRAP_PATH)) unlinkSync(BOOTSTRAP_PATH);
  } catch {
    // Ignore.
  }
}

export const __internals = {
  COOKIE_NAME,
  CLAIM_TTL_MS,
  BOOTSTRAP_TTL_MS,
  BOOTSTRAP_PATH,
  encodeCookie,
};

// Side effect: try to hydrate on first import (cold-start safe).
rehydrateBootstrapFromTmp();

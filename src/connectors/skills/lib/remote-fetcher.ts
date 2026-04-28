import { createHmac, timingSafeEqual } from "crypto";
import type { Skill } from "../store";
import { replaceSkill } from "../store";
import { fetchWithByteCap } from "@/core/fetch-utils";
import { isPublicUrl } from "@/core/url-safety";
import { toMsg } from "@/core/error-utils";
import { getConfig } from "@/core/config-facade";

// Phase 44 SCM-05b: this file retains an inline `new AbortController() +
// setTimeout` in fetchRemote because it composes with fetchWithByteCap
// (which needs the signal to cancel mid-stream). The shared fetchWithTimeout
// helper is used where a plain fetch() is replaced; it cannot layer over
// fetchWithByteCap without changing byte-cap semantics. Same justification
// applies to paywall/lib/fetch-html.ts.

/**
 * Remote fetcher for skills that point at a GitHub raw / Gist / https URL.
 *
 * Rules:
 *   - HTTPS only (enforced at the skills layer — browserbase accepts both
 *     http and https, so https-only can't move into isPublicUrl itself)
 *   - 10s fetch timeout
 *   - 500KB max body
 *   - text/markdown or text/plain preferred (tolerant)
 *   - on error: keep last-good cachedContent, record lastError
 *
 * SSRF guard: delegates to src/core/url-safety.isPublicUrl with
 * resolveDns=true. See .planning/phases/44-supply-chain/MIGRATION-NOTES.md
 * § SSRF guard divergence for the union-of-coverage rationale.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 500 * 1024;
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const SIGNATURE_HEADER = "x-skill-signature";

/**
 * SEC-A-01 — optional HMAC signature verification for remote skills.
 *
 * When `KEBAB_SKILLS_HMAC_SECRET` is set, every remote-skill response MUST
 * carry an `x-skill-signature` header equal to `hex(hmacSHA256(secret, body))`.
 * Mismatched / missing signatures are rejected with a generic error so an
 * attacker cannot distinguish "header missing" from "header wrong".
 *
 * When the env var is unset, signature verification is bypassed and the
 * existing TLS + SSRF guards are the only defense — same behavior as before.
 *
 * Threat: a remote skill URL refetched periodically can be intercepted by a
 * MITM (DNS spoof, compromised CDN, attacker-controlled origin) and have its
 * content swapped, injecting prompt-level instructions into the LLM's prompt
 * composition path. HMAC pins the content to a secret only the operator + the
 * signing producer share.
 */
const MIN_HMAC_SECRET_LEN = 32;
let weakSecretWarned = false;

function verifySkillSignature(body: string, headers: Headers): { ok: boolean; error?: string } {
  const secret = getConfig("KEBAB_SKILLS_HMAC_SECRET");
  if (!secret) return { ok: true }; // opt-in; unset = legacy behavior
  if (secret.length < MIN_HMAC_SECRET_LEN) {
    // Refuse to use a too-short secret. A 1-byte secret defeats HMAC's
    // collision resistance and weakens the timing-attack guarantee. We
    // refuse rather than silently accept, so the operator notices.
    if (!weakSecretWarned) {
      console.error(
        `[Kebab MCP Security] KEBAB_SKILLS_HMAC_SECRET is shorter than ${MIN_HMAC_SECRET_LEN} chars. ` +
          `Generate a strong secret (e.g. \`openssl rand -hex 32\`) and re-deploy. ` +
          `Skill fetches are blocked until this is fixed.`
      );
      weakSecretWarned = true;
    }
    return { ok: false, error: "HMAC secret too short" };
  }
  const provided = headers.get(SIGNATURE_HEADER);
  if (!provided) return { ok: false, error: "Skill signature missing" };
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  // Length check first: timingSafeEqual throws on length mismatch.
  if (provided.length !== expected.length) return { ok: false, error: "Skill signature mismatch" };
  try {
    const ok = timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    return ok ? { ok: true } : { ok: false, error: "Skill signature mismatch" };
  } catch {
    return { ok: false, error: "Skill signature mismatch" };
  }
}

export interface FetchRemoteResult {
  ok: boolean;
  content?: string;
  error?: string;
}

/**
 * Validates a URL is safe to fetch from a server: https only, no loopback,
 * no private networks, no cloud metadata. Resolves DNS and rejects if the
 * resolved IP lands in a blocked range.
 */
async function validateRemoteUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (parsed.protocol !== "https:") {
    // https-only is a skills-layer rule; url-safety accepts both http and https.
    return { ok: false, error: "URL must use https://" };
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // skills-specific hostname denylist (stricter than the shared guard)
  if (host.endsWith(".internal")) {
    return { ok: false, error: "Blocked hostname" };
  }

  const result = await isPublicUrl(url, { resolveDns: true });
  if (!result.ok) {
    // Collapse the specific code into a generic error so attackers can't
    // map internal network topology from the response.
    return { ok: false, error: "Blocked or unreachable URL" };
  }
  return { ok: true };
}

const MAX_REDIRECTS = 5;

/**
 * Manual redirect handler that re-runs validateRemoteUrl on every Location
 * header before following. Without this, an attacker-controlled public URL
 * can 302 → http://169.254.169.254/ (cloud metadata) or any internal IP,
 * because fetch's built-in `redirect: "follow"` does not consult our
 * SSRF allowlist. CVE-class issue.
 */
export async function fetchRemote(url: string): Promise<FetchRemoteResult> {
  let currentUrl = url;
  let hops = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    while (hops <= MAX_REDIRECTS) {
      const guard = await validateRemoteUrl(currentUrl);
      if (!guard.ok) {
        // Generic error — don't leak which IP/host failed (helps attackers map internal networks).
        return { ok: false, error: "Blocked or unreachable URL" };
      }

      const result = await fetchWithByteCap(
        currentUrl,
        {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "User-Agent": "Kebab MCP-Skills/1.0",
            Range: `bytes=0-${MAX_BYTES - 1}`,
          },
        },
        MAX_BYTES
      );

      // Manual redirect handling: 3xx with a Location header → re-validate and loop.
      if (result.status >= 300 && result.status < 400 && result.location) {
        const next = new URL(result.location, currentUrl).toString();
        currentUrl = next;
        hops++;
        continue;
      }

      if (result.status !== 200 && result.status !== 206) {
        return { ok: false, error: `HTTP ${result.status}` };
      }
      if (result.truncated) {
        return { ok: false, error: `response exceeds ${MAX_BYTES} bytes` };
      }
      const sig = verifySkillSignature(result.text, result.headers);
      if (!sig.ok) {
        return { ok: false, error: sig.error || "Skill signature invalid" };
      }
      return { ok: true, content: result.text };
    }
    return { ok: false, error: `too many redirects (${MAX_REDIRECTS})` };
  } catch (err: unknown) {
    const msg = toMsg(err);
    // Collapse low-level network errors into a generic message — internal
    // hostnames in error text would help SSRF probing.
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH/i.test(msg)) {
      return { ok: false, error: "Blocked or unreachable URL" };
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Returns true if the cache is stale (or empty) and a refetch should happen. */
export function isStale(skill: Skill, ttlMs = DEFAULT_TTL_MS): boolean {
  if (skill.source.type !== "remote") return false;
  if (!skill.source.cachedAt) return true;
  const last = Date.parse(skill.source.cachedAt);
  if (Number.isNaN(last)) return true;
  return Date.now() - last > ttlMs;
}

/**
 * For remote skills: if TTL expired, kick off a background refresh and
 * return the skill as-is (stale wins during refetch). For inline skills:
 * returns the skill unchanged.
 */
export async function maybeRefreshRemote(skill: Skill): Promise<Skill> {
  if (skill.source.type !== "remote") return skill;
  // If never fetched, do a synchronous fetch so the first call has content.
  if (!skill.source.cachedContent) {
    return refreshNow(skill);
  }
  if (isStale(skill)) {
    // Fire-and-forget; swallow errors.
    refreshNow(skill).catch(() => {});
  }
  return skill;
}

/** Force a fetch, persist cache, return updated skill. */
export async function refreshNow(skill: Skill): Promise<Skill> {
  if (skill.source.type !== "remote") return skill;
  const result = await fetchRemote(skill.source.url);
  const now = new Date().toISOString();
  const next: Skill = {
    ...skill,
    updatedAt: now,
    source: result.ok
      ? {
          type: "remote",
          url: skill.source.url,
          cachedContent: result.content ?? "",
          cachedAt: now,
          lastError: undefined,
        }
      : {
          type: "remote",
          url: skill.source.url,
          cachedContent: skill.source.cachedContent,
          cachedAt: skill.source.cachedAt,
          lastError: result.error,
        },
  };
  await replaceSkill(next);
  return next;
}

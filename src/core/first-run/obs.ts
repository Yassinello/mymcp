/**
 * OBS-01 / OBS-02: rehydrate observability metadata.
 * Persisted to KV so /api/admin/status can diagnose cold-start health
 * without tailing Vercel logs.
 *   "last"  = ISO timestamp of most-recent successful rehydrate
 *   "count" = { total, events: [{at}] } with 24h sliding window
 */

import { getKVStore } from "../kv-store";
import { hasUpstashCreds } from "../upstash-env";
import { getLogger } from "../logging";
import { toMsg } from "../error-utils";

const obsLog = getLogger("FIRST-RUN");

// OBS-01 / OBS-02: rehydrate observability metadata constants.
export const REHYDRATE_META_LAST_KEY = "mymcp:firstrun:rehydrate-meta:last";
export const REHYDRATE_COUNT_KV_KEY = "mymcp:firstrun:rehydrate-count";

interface RehydrateCountRecord {
  total: number;
  events: { at: string }[];
}

function isExternalKvAvailable(): boolean {
  if (hasUpstashCreds()) return true;
  if (process.env.VERCEL !== "1") return true;
  return false;
}

/**
 * Record a successful rehydrate event. Called from bootstrap.ts after a
 * KV-path rehydrate (not /tmp fast-path — see design note in
 * _rehydrateBootstrapAsyncImpl).
 */
export async function recordRehydrateSuccess(): Promise<void> {
  if (!isExternalKvAvailable()) return;
  try {
    const kv = getKVStore();
    const now = new Date().toISOString();
    await kv.set(REHYDRATE_META_LAST_KEY, now);
    await incrementRehydrateCount();
  } catch (err) {
    obsLog.warn("rehydrate-meta write skipped", {
      error: toMsg(err),
    });
  }
}

async function incrementRehydrateCount(): Promise<void> {
  try {
    const kv = getKVStore();
    const raw = await kv.get(REHYDRATE_COUNT_KV_KEY);
    const parsed: RehydrateCountRecord = raw
      ? (JSON.parse(raw) as RehydrateCountRecord)
      : { total: 0, events: [] };
    const nowMs = Date.now();
    const cutoff = nowMs - 24 * 60 * 60 * 1000;
    parsed.total += 1;
    parsed.events = parsed.events.filter((e) => new Date(e.at).getTime() > cutoff);
    parsed.events.push({ at: new Date(nowMs).toISOString() });
    // Defensive cap — long-lived deploys should never let this balloon.
    if (parsed.events.length > 10_000) parsed.events = parsed.events.slice(-1000);
    await kv.set(REHYDRATE_COUNT_KV_KEY, JSON.stringify(parsed));
  } catch (err) {
    obsLog.warn("rehydrate-count increment skipped", {
      error: toMsg(err),
    });
  }
}

/**
 * Most recent successful rehydrate timestamp, or null if no rehydrate
 * has ever landed on this KV backend (fresh deploy, KV not configured,
 * or never-initialized instance).
 */
export async function getLastRehydrateAt(): Promise<Date | null> {
  if (!isExternalKvAvailable()) return null;
  try {
    const kv = getKVStore();
    const iso = await kv.get(REHYDRATE_META_LAST_KEY);
    return iso ? new Date(iso) : null;
  } catch {
    return null;
  }
}

/**
 * Rehydrate count in aggregate (`total`) and in the last 24h rolling
 * window. Last24h is recomputed from the event log on every read so a
 * lambda that has been warm for >24h still returns the correct sliding
 * count.
 */
export async function getRehydrateCount(): Promise<{ total: number; last24h: number }> {
  if (!isExternalKvAvailable()) return { total: 0, last24h: 0 };
  try {
    const kv = getKVStore();
    const raw = await kv.get(REHYDRATE_COUNT_KV_KEY);
    if (!raw) return { total: 0, last24h: 0 };
    const parsed = JSON.parse(raw) as RehydrateCountRecord;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const last24h = parsed.events.filter((e) => new Date(e.at).getTime() > cutoff).length;
    return { total: parsed.total, last24h };
  } catch {
    return { total: 0, last24h: 0 };
  }
}

/**
 * Backup / restore logic for KV store data.
 *
 * Shared between:
 * - CLI: scripts/backup.ts
 * - Admin tools: mcp_backup_export, mcp_backup_import
 *
 * Export format:
 * {
 *   version: 1,
 *   exportedAt: ISO string,
 *   entries: { key: value, ... }
 * }
 *
 * Only KV data is exported — no env vars or secrets.
 */

import { getKVStore, kvScanAll, type KVStore } from "./kv-store";

export const BACKUP_VERSION = 1;

export interface BackupData {
  version: number;
  exportedAt: string;
  entries: Record<string, string>;
}

export interface ImportOptions {
  /**
   * "merge" (default): additive — only writes keys from the backup.
   * "replace": deletes all existing keys not in the backup, then writes all backup keys.
   */
  mode?: "merge" | "replace";
}

/**
 * Export all KV entries as a BackupData object.
 * Accepts an optional KV store for tenant-scoped exports.
 *
 * MEDIUM-1: Uses mget() for single-roundtrip batch reads when available,
 * falls back to batched parallel gets in groups of 50.
 */
export async function exportBackup(kvOverride?: KVStore): Promise<BackupData> {
  const kv = kvOverride ?? getKVStore();
  const keys = await kvScanAll(kv, "*");
  const entries: Record<string, string> = {};

  if (typeof kv.mget === "function") {
    // Single-roundtrip batch read via MGET
    const BATCH_SIZE = 50;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      const values = await kv.mget(batch);
      for (let j = 0; j < batch.length; j++) {
        if (values[j] !== null) {
          entries[batch[j]] = values[j]!;
        }
      }
    }
  } else {
    // Fallback: batched parallel gets
    const BATCH_SIZE = 10;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      const values = await Promise.all(batch.map((key) => kv.get(key)));
      for (let j = 0; j < batch.length; j++) {
        if (values[j] !== null) {
          entries[batch[j]] = values[j]!;
        }
      }
    }
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

/**
 * Import a backup into the KV store.
 * Validates schema version before writing.
 * Accepts an optional KV store for tenant-scoped imports.
 *
 * HIGH-1: Supports `mode: "replace"` — deletes keys not in the backup.
 */
export async function importBackup(
  data: unknown,
  opts?: ImportOptions & { kv?: KVStore }
): Promise<{ ok: boolean; message: string; count?: number }> {
  if (!data || typeof data !== "object") {
    return { ok: false, message: "Invalid backup: expected a JSON object" };
  }

  const backup = data as Record<string, unknown>;

  if (backup.version !== BACKUP_VERSION) {
    return {
      ok: false,
      message: `Unsupported backup version: ${backup.version} (expected ${BACKUP_VERSION})`,
    };
  }

  if (!backup.entries || typeof backup.entries !== "object" || Array.isArray(backup.entries)) {
    return { ok: false, message: "Invalid backup: missing or malformed entries" };
  }

  const entries = backup.entries as Record<string, unknown>;
  const kv = opts?.kv ?? getKVStore();
  const mode = opts?.mode ?? "merge";
  let count = 0;

  // In "replace" mode, delete all existing keys not present in the backup
  if (mode === "replace") {
    const existingKeys = await kvScanAll(kv, "*");
    const backupKeySet = new Set(Object.keys(entries));
    for (const key of existingKeys) {
      if (!backupKeySet.has(key)) {
        await kv.delete(key);
      }
    }
  }

  for (const [key, value] of Object.entries(entries)) {
    if (typeof value === "string") {
      await kv.set(key, value);
      count++;
    }
  }

  const modeLabel = mode === "replace" ? "Replaced" : "Imported";
  return { ok: true, message: `${modeLabel} ${count} entries`, count };
}

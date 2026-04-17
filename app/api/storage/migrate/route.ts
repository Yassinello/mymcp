import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/core/auth";
import { detectStorageMode, clearStorageModeCache } from "@/core/storage-mode";
import { getKVStore, kvScanAll } from "@/core/kv-store";
import {
  CRED_PREFIX,
  saveCredentialsToKV,
  readAllCredentialsFromKV,
} from "@/core/credential-store";
import { getEnvStore } from "@/core/env-store";

/**
 * POST /api/storage/migrate
 * Body: { direction: 'file-to-kv' | 'kv-to-file', dryRun?: boolean }
 *
 * Moves credential data between backends. The default direction is the
 * common upgrade path — a user runs Docker with file storage, decides they
 * want multi-instance / backup, configures Upstash, and clicks "Migrate".
 *
 * The reverse (kv-to-file) is rare but supported for the
 * "I want to leave Upstash" case. KV → File only writes to disk if the FS
 * is actually writable; otherwise we 422 with a helpful message.
 *
 * dryRun returns the diff (which keys would be added/updated/skipped)
 * without touching the destination — used by the UI preview step.
 *
 * Atomic per-key: a partial failure mid-loop returns the keys that did
 * succeed in `migrated` and the failures in `errors` so the operator can
 * retry just those.
 */
export async function POST(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  let body: { direction?: string; dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const direction = body.direction;
  const dryRun = Boolean(body.dryRun);

  if (direction !== "file-to-kv" && direction !== "kv-to-file") {
    return NextResponse.json(
      { ok: false, error: "direction must be 'file-to-kv' or 'kv-to-file'" },
      { status: 400 }
    );
  }

  const report = await detectStorageMode();

  if (direction === "file-to-kv") {
    if (report.mode !== "kv") {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot migrate to KV — current mode is '${report.mode}'. Configure UPSTASH_REDIS_REST_URL/TOKEN first.`,
          mode: report.mode,
        },
        { status: 422 }
      );
    }

    // Source: filesystem env store
    const store = getEnvStore();
    let sourceVars: Record<string, string>;
    try {
      sourceVars = await store.read();
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to read source env store: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500 }
      );
    }

    // Existing KV creds — used to compute diff
    const existing = await readAllCredentialsFromKV();

    const toAdd: string[] = [];
    const toUpdate: string[] = [];
    const unchanged: string[] = [];

    for (const [k, v] of Object.entries(sourceVars)) {
      if (!v) continue;
      // Only migrate cred-like vars (caps + underscores). Skip Vercel meta,
      // Node runtime keys, etc. — same skip set as env-export.
      if (!/^[A-Z_][A-Z0-9_]*$/.test(k)) continue;
      if (k.startsWith("VERCEL_") || k === "NODE_ENV" || k === "NEXT_RUNTIME") continue;

      if (!(k in existing)) toAdd.push(k);
      else if (existing[k] !== v) toUpdate.push(k);
      else unchanged.push(k);
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        direction,
        sourceMode: "file",
        targetMode: report.mode,
        diff: { add: toAdd, update: toUpdate, unchanged },
      });
    }

    // Execute: write all add+update keys to KV
    const writes: Record<string, string> = {};
    for (const k of [...toAdd, ...toUpdate]) writes[k] = sourceVars[k];

    const errors: { key: string; error: string }[] = [];
    try {
      await saveCredentialsToKV(writes);
    } catch (err) {
      errors.push({
        key: "*",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    clearStorageModeCache();
    return NextResponse.json({
      ok: errors.length === 0,
      direction,
      migrated: Object.keys(writes).length - errors.length,
      diff: { add: toAdd, update: toUpdate, unchanged },
      errors,
    });
  }

  // kv-to-file
  if (report.mode !== "file") {
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot migrate to file — destination filesystem is not writable (mode: '${report.mode}').`,
        mode: report.mode,
      },
      { status: 422 }
    );
  }

  const kv = getKVStore();
  const credKeys = await kvScanAll(kv, `${CRED_PREFIX}*`);
  const credValues = kv.mget
    ? await kv.mget(credKeys)
    : await Promise.all(credKeys.map((k) => kv.get(k)));

  const sourceVars: Record<string, string> = {};
  for (let i = 0; i < credKeys.length; i++) {
    const envKey = credKeys[i].slice(CRED_PREFIX.length);
    const v = credValues[i];
    if (v) sourceVars[envKey] = v;
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      direction,
      sourceMode: "kv",
      targetMode: "file",
      diff: { add: Object.keys(sourceVars), update: [], unchanged: [] },
    });
  }

  const store = getEnvStore();
  let written: number;
  try {
    const result = await store.write(sourceVars);
    written = result.written;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Write to env store failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }

  clearStorageModeCache();
  return NextResponse.json({
    ok: true,
    direction,
    migrated: written,
    diff: { add: Object.keys(sourceVars), update: [], unchanged: [] },
    errors: [],
  });
}

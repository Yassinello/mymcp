import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/core/auth";
import { getKVStore } from "@/core/kv-store";
import { getEnvStore } from "@/core/env-store";

/**
 * GET /api/config/context
 * PUT /api/config/context
 *
 * Read or write the personal-context file in either of two modes:
 * - inline: markdown stored under KV key `mymcp:context:inline`
 * - vault:  path stored as MYMCP_CONTEXT_PATH env var (the file itself
 *           lives in the user's Obsidian vault and is fetched via the
 *           vault connector at runtime)
 *
 * The `mode` flag itself is stored under `mymcp:context:mode`.
 */

const KV_INLINE = "mymcp:context:inline";
const KV_MODE = "mymcp:context:mode";

interface ContextState {
  mode: "inline" | "vault";
  inline: string;
  vaultPath: string;
}

export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const kv = getKVStore();
  const [storedMode, storedInline] = await Promise.all([kv.get(KV_MODE), kv.get(KV_INLINE)]);

  const mode: "inline" | "vault" =
    storedMode === "vault" || storedMode === "inline"
      ? storedMode
      : process.env.MYMCP_CONTEXT_PATH
        ? "vault"
        : "inline";

  return NextResponse.json({
    mode,
    inline: storedInline ?? "",
    vaultPath: process.env.MYMCP_CONTEXT_PATH ?? "",
  } satisfies ContextState);
}

export async function PUT(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  let body: Partial<ContextState>;
  try {
    body = (await request.json()) as Partial<ContextState>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode === "vault" ? "vault" : "inline";
  const inline = typeof body.inline === "string" ? body.inline : "";
  const vaultPath = typeof body.vaultPath === "string" ? body.vaultPath.trim() : "";

  // Hard cap to prevent abuse — context files should be short.
  if (inline.length > 64 * 1024) {
    return NextResponse.json(
      { ok: false, error: "Inline context too large (max 64KB)" },
      { status: 413 }
    );
  }

  const kv = getKVStore();
  await kv.set(KV_MODE, mode);
  if (mode === "inline") {
    await kv.set(KV_INLINE, inline);
  }

  // Mirror vault path to env var so the my_context tool can resolve it.
  if (mode === "vault" && vaultPath) {
    try {
      const store = getEnvStore();
      await store.write({ MYMCP_CONTEXT_PATH: vaultPath });
    } catch (err) {
      // Best-effort: don't fail the save just because env hot-write didn't
      // land (e.g. read-only filesystem on Vercel without VERCEL_TOKEN).
      console.warn(
        "[/api/config/context] could not persist MYMCP_CONTEXT_PATH:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.json({ ok: true, mode });
}

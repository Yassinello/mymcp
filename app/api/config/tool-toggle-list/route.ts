import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/core/auth";
import { getDisabledTools } from "@/core/tool-toggles";

/**
 * GET /api/config/tool-toggle-list
 *
 * Returns the list of currently disabled tool names. Auth-gated.
 */
export async function GET(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  try {
    const disabled = await getDisabledTools();
    return NextResponse.json({ ok: true, disabled: Array.from(disabled) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

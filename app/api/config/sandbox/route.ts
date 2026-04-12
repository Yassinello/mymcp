import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkAdminAuth } from "@/core/auth";
import { getEnabledPacks } from "@/core/registry";
import { withLogging } from "@/core/logging";

const DESTRUCTIVE = /^(send_|create_|delete_|write_|update_|move_)/;

// In-memory rate limit: max 20 invocations per minute, global (simple enough for P1)
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let callTimes: number[] = [];

function withinRateLimit(): boolean {
  const now = Date.now();
  callTimes = callTimes.filter((t) => now - t < WINDOW_MS);
  if (callTimes.length >= MAX_PER_WINDOW) return false;
  callTimes.push(now);
  return true;
}

/**
 * POST /api/config/sandbox
 * Body: { toolName: string, args: Record<string, unknown>, confirm?: boolean }
 * Admin-auth-gated. Rate limited to 20/min.
 */
export async function POST(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  if (!withinRateLimit()) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded (max 20 / minute)" },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    toolName?: string;
    args?: Record<string, unknown>;
    confirm?: boolean;
  } | null;

  if (!body || !body.toolName) {
    return NextResponse.json({ ok: false, error: "Missing toolName" }, { status: 400 });
  }

  const { toolName, args = {}, confirm = false } = body;

  if (DESTRUCTIVE.test(toolName) && !confirm) {
    return NextResponse.json(
      { ok: false, error: "Destructive tool requires confirm: true" },
      { status: 400 }
    );
  }

  // Look up tool in current registry
  const enabled = getEnabledPacks();
  for (const pack of enabled) {
    for (const tool of pack.manifest.tools) {
      if (tool.name === toolName) {
        // Validate args against the tool's Zod schema before invoking.
        // ToolDefinition.schema is Record<string, ZodTypeAny>, so wrap it.
        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = z.object(tool.schema).parse(args) as Record<string, unknown>;
        } catch (err) {
          if (err instanceof ZodError) {
            return NextResponse.json(
              { ok: false, error: "Invalid arguments", issues: err.issues },
              { status: 400 }
            );
          }
          throw err;
        }

        const start = Date.now();
        try {
          // Route through withLogging so sandbox invocations appear in the Logs tab.
          const wrapped = withLogging(tool.name, tool.handler);
          const result = await wrapped(parsedArgs);
          return NextResponse.json({
            ok: true,
            data: result,
            durationMs: Date.now() - start,
          });
        } catch (err) {
          return NextResponse.json({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - start,
          });
        }
      }
    }
  }

  return NextResponse.json(
    { ok: false, error: `Tool not found or not enabled: ${toolName}` },
    { status: 404 }
  );
}

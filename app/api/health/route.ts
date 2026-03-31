import { timingSafeEqual } from "crypto";
import { checkVaultHealth } from "@/lib/github";

export async function GET(request: Request) {
  const token = process.env.MCP_AUTH_TOKEN?.trim();
  if (token) {
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim();
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token")?.trim();

    const candidate = bearer || queryToken || "";
    let valid = false;
    if (candidate.length === token.length) {
      try {
        valid = timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
      } catch { /* noop */ }
    }

    if (!valid) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const health = await checkVaultHealth();
    return Response.json(
      { ...health, version: "3.0.0", tools: 8 },
      { status: health.ok ? 200 : 503 }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

import { checkVaultHealth } from "@/lib/github";

export async function GET(request: Request) {
  // Auth check (same as MCP endpoint)
  const token = process.env.MCP_AUTH_TOKEN?.trim();
  if (token) {
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim();
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token")?.trim();

    if (bearer !== token && queryToken !== token) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const health = await checkVaultHealth();
    return Response.json(health, { status: health.ok ? 200 : 503 });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

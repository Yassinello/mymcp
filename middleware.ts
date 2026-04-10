import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // Constant-time comparison (Edge Runtime compatible — no crypto.timingSafeEqual)
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const adminToken = (process.env.ADMIN_AUTH_TOKEN || process.env.MCP_AUTH_TOKEN)?.trim();

  const protectedPaths = ["/", "/setup", "/playground"];
  if (protectedPaths.includes(pathname) && adminToken) {
    const queryToken = request.nextUrl.searchParams.get("token")?.trim() || "";
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim() || "";

    const authorized = safeEqual(bearer, adminToken) || safeEqual(queryToken, adminToken);
    if (!authorized) {
      return new NextResponse(
        "Unauthorized — use Authorization header or ?token= to access the dashboard",
        { status: 401, headers: { "Content-Type": "text/plain" } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/setup", "/playground"],
};

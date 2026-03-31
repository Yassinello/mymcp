import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = process.env.MCP_AUTH_TOKEN?.trim();

  // Protect admin dashboard — accepts token in query string (for browser access)
  if (pathname === "/") {
    if (token) {
      const queryToken = request.nextUrl.searchParams.get("token")?.trim();
      const authHeader = request.headers.get("authorization");
      const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim();

      const validBearer = bearer ? safeCompare(bearer, token) : false;
      const validQuery = queryToken ? safeCompare(queryToken, token) : false;

      if (!validBearer && !validQuery) {
        return new NextResponse(
          "Unauthorized — append ?token=<MCP_AUTH_TOKEN> to access the dashboard",
          { status: 401, headers: { "Content-Type": "text/plain" } }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};

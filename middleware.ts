import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple in-memory rate limiter for GitHub API calls
// Resets on each cold start (acceptable for personal server)
const rateLimitWindow = 60 * 60 * 1000; // 1 hour
let requestCount = 0;
let windowStart = Date.now();
const MAX_REQUESTS_PER_HOUR = 4000; // Safety margin under GitHub's 5000/h

export function getRateLimitStatus() {
  if (Date.now() - windowStart > rateLimitWindow) {
    requestCount = 0;
    windowStart = Date.now();
  }
  return {
    remaining: MAX_REQUESTS_PER_HOUR - requestCount,
    limit: MAX_REQUESTS_PER_HOUR,
    resetAt: new Date(windowStart + rateLimitWindow).toISOString(),
  };
}

export function incrementRateLimit(count = 1) {
  if (Date.now() - windowStart > rateLimitWindow) {
    requestCount = 0;
    windowStart = Date.now();
  }
  requestCount += count;
}

export function isRateLimited(): boolean {
  if (Date.now() - windowStart > rateLimitWindow) {
    requestCount = 0;
    windowStart = Date.now();
  }
  return requestCount >= MAX_REQUESTS_PER_HOUR;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin dashboard at root
  if (pathname === "/") {
    const token = process.env.MCP_AUTH_TOKEN?.trim();
    if (token) {
      const url = request.nextUrl;
      const queryToken = url.searchParams.get("token")?.trim();
      const authHeader = request.headers.get("authorization");
      const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim();

      if (bearer !== token && queryToken !== token) {
        return new NextResponse("Unauthorized — append ?token=<MCP_AUTH_TOKEN> to access the dashboard", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        });
      }
    }
  }

  // Rate limit check for MCP API calls
  if (pathname.startsWith("/api/") && pathname !== "/api/health") {
    if (isRateLimited()) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Rate limit exceeded — too many GitHub API calls. Try again later.",
          },
          id: null,
        },
        { status: 429 }
      );
    }
    // Increment on each MCP request (rough estimate: each tool call ~1-3 GitHub API calls)
    incrementRateLimit(2);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/api/:path*"],
};

import { McpToolError, ErrorCode } from "@/core/errors";

let cachedToken: { access_token: string; expires_at: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5min margin)
  if (cachedToken && Date.now() < cachedToken.expires_at - 300_000) {
    return cachedToken.access_token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    const missing = [
      !clientId && "GOOGLE_CLIENT_ID",
      !clientSecret && "GOOGLE_CLIENT_SECRET",
      !refreshToken && "GOOGLE_REFRESH_TOKEN",
    ].filter(Boolean);
    throw new McpToolError({
      code: ErrorCode.CONFIGURATION_ERROR,
      toolName: "google",
      message: `Missing env vars: ${missing.join(", ")}`,
      userMessage: `Google pack is not configured. Add ${missing.join(", ")} in your environment variables.`,
      retryable: false,
    });
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();

  if (!data.access_token) {
    const oauthCode = data.error || "unknown";
    const errorDesc = data.error_description || "";

    const userHints: Record<string, string> = {
      invalid_client:
        "OAuth client does not exist or was deleted. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      invalid_grant:
        "Refresh token was revoked or expired. Re-authenticate via /setup and update GOOGLE_REFRESH_TOKEN.",
      unauthorized_client: "OAuth client is not authorized for this grant type.",
      invalid_scope: "One or more scopes are not authorized. Check OAuth consent screen scopes.",
    };

    throw new McpToolError({
      code: ErrorCode.AUTH_FAILED,
      toolName: "google",
      message: `Google OAuth failed: ${oauthCode} — ${errorDesc}`,
      userMessage:
        userHints[oauthCode] ||
        `Google authentication failed (${oauthCode}). Check your GOOGLE_* environment variables.`,
      retryable: false,
    });
  }

  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return cachedToken.access_token;
}

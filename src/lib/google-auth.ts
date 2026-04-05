let cachedToken: { access_token: string; expires_at: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5min margin)
  if (cachedToken && Date.now() < cachedToken.expires_at - 300_000) {
    return cachedToken.access_token;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`Google OAuth refresh failed: ${JSON.stringify(data)}`);
  }

  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return cachedToken.access_token;
}

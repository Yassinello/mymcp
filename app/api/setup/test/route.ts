import { NextResponse } from "next/server";

/**
 * POST /api/setup/test
 * Test a single credential by making a lightweight API call.
 * Only works during first-time setup (no MCP_AUTH_TOKEN).
 * Returns { ok, message, detail? } — detail contains the full error for debugging.
 */
export async function POST(request: Request) {
  if (process.env.MCP_AUTH_TOKEN) {
    return NextResponse.json({ error: "Use /api/admin/verify instead" }, { status: 403 });
  }

  const body = (await request.json()) as { pack: string; credentials: Record<string, string> };

  try {
    switch (body.pack) {
      case "google": {
        const clientId = body.credentials.GOOGLE_CLIENT_ID;
        const clientSecret = body.credentials.GOOGLE_CLIENT_SECRET;
        const refreshToken = body.credentials.GOOGLE_REFRESH_TOKEN;

        if (!clientId || !clientSecret) {
          return NextResponse.json({
            ok: false,
            message: "Client ID and Secret are required",
            detail: "Fill in both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before testing.",
          });
        }

        if (!refreshToken) {
          return NextResponse.json({
            ok: true,
            message:
              "Client ID & Secret provided — get Refresh Token after deploy via /api/auth/google",
          });
        }

        // Exchange refresh token for access token
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });

        const tokenData = (await tokenRes.json()) as {
          access_token?: string;
          error?: string;
          error_description?: string;
        };

        if (!tokenRes.ok || !tokenData.access_token) {
          return NextResponse.json({
            ok: false,
            message: "Google OAuth failed",
            detail: tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`,
          });
        }

        // Verify by calling Gmail getProfile (scope user actually needs)
        const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (profileRes.ok) {
          const profile = (await profileRes.json()) as { emailAddress?: string };
          return NextResponse.json({
            ok: true,
            message: `Connected as ${profile.emailAddress || "Google user"}`,
          });
        }

        // Fallback: token exchange worked, so creds are valid even if Gmail scope missing
        return NextResponse.json({
          ok: true,
          message:
            "OAuth credentials valid (Gmail scope not granted — other Google APIs may still work)",
        });
      }

      case "vault": {
        const pat = body.credentials.GITHUB_PAT;
        const repo = body.credentials.GITHUB_REPO;
        if (!pat || !repo) {
          return NextResponse.json({
            ok: false,
            message: "Missing PAT or repo",
            detail: "Both GITHUB_PAT and GITHUB_REPO are required.",
          });
        }
        // Normalize repo URL to owner/repo
        const repoNorm = repo.replace(/.*github\.com\//, "").replace(/\/+$/, "");
        const res = await fetch(`https://api.github.com/repos/${repoNorm}`, {
          headers: { Authorization: `token ${pat}`, "User-Agent": "MyMCP" },
        });
        if (res.ok) {
          const data = (await res.json()) as { full_name?: string; private?: boolean };
          return NextResponse.json({
            ok: true,
            message: `Connected to ${data.full_name}${data.private ? " (private)" : ""}`,
          });
        }
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        return NextResponse.json({
          ok: false,
          message: `GitHub: ${res.status}`,
          detail: errData.message || `HTTP ${res.status} from GitHub API`,
        });
      }

      case "slack": {
        const token = body.credentials.SLACK_BOT_TOKEN;
        if (!token) {
          return NextResponse.json({ ok: false, message: "Missing token" });
        }
        const res = await fetch("https://slack.com/api/auth.test", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          ok: boolean;
          team?: string;
          error?: string;
          user?: string;
        };
        if (data.ok) {
          return NextResponse.json({
            ok: true,
            message: `Connected to ${data.team} as ${data.user || "bot"}`,
          });
        }
        return NextResponse.json({
          ok: false,
          message: "Slack auth failed",
          detail: data.error || "Unknown Slack error",
        });
      }

      case "notion": {
        const key = body.credentials.NOTION_API_KEY;
        if (!key) {
          return NextResponse.json({ ok: false, message: "Missing API key" });
        }
        const res = await fetch("https://api.notion.com/v1/users/me", {
          headers: { Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28" },
        });
        if (res.ok) {
          const data = (await res.json()) as { name?: string; type?: string };
          return NextResponse.json({
            ok: true,
            message: `Connected as ${data.name || "Notion integration"} (${data.type || "bot"})`,
          });
        }
        const errData = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
        return NextResponse.json({
          ok: false,
          message: `Notion: ${res.status}`,
          detail: errData.message || errData.code || `HTTP ${res.status}`,
        });
      }

      case "composio": {
        const key = body.credentials.COMPOSIO_API_KEY;
        if (!key) {
          return NextResponse.json({ ok: false, message: "Missing API key" });
        }
        // Light check — just verify the key format
        return NextResponse.json({
          ok: true,
          message: "API key provided — verify in Composio dashboard",
        });
      }

      case "browser": {
        const bbKey = body.credentials.BROWSERBASE_API_KEY;
        if (!bbKey) {
          return NextResponse.json({ ok: false, message: "Missing Browserbase API key" });
        }
        return NextResponse.json({
          ok: true,
          message: "Credentials provided — will be verified on first use",
        });
      }

      default:
        return NextResponse.json({ ok: true, message: "No test available" });
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: "Connection failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

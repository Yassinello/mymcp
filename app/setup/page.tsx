import { resolveRegistry } from "@/core/registry";
import { AppShell } from "../sidebar";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const registry = resolveRegistry();
  const packs = registry.map((p) => ({
    id: p.manifest.id,
    label: p.manifest.label,
    description: p.manifest.description,
    enabled: p.enabled,
    reason: p.reason,
    requiredEnvVars: p.manifest.requiredEnvVars,
  }));

  const configurable = packs.filter((p) => p.requiredEnvVars.length > 0);
  const configured = configurable.filter((p) => p.enabled);
  const progress =
    configurable.length > 0 ? Math.round((configured.length / configurable.length) * 100) : 100;

  const googlePack = packs.find((p) => p.id === "google");
  const vaultPack = packs.find((p) => p.id === "vault");
  const browserPack = packs.find((p) => p.id === "browser");
  const slackPack = packs.find((p) => p.id === "slack");
  const notionPack = packs.find((p) => p.id === "notion");

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  return (
    <AppShell
      title="Setup"
      subtitle={`${configured.length}/${configurable.length} packs configured.`}
    >
      {/* Progress bar */}
      <div className="mb-8">
        <div className="bg-bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progress === 100 ? "bg-green" : "bg-accent"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {[
          {
            pack: googlePack!,
            steps: (
              <>
                <strong>1.</strong> Create a{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener"
                  className="text-accent hover:underline"
                >
                  Google Cloud OAuth app
                </a>{" "}
                (Web application type)
                <br />
                <strong>2.</strong> Add callback URL:{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">
                  {baseUrl}/api/auth/google/callback
                </code>
                <br />
                <strong>3.</strong> Set{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">GOOGLE_CLIENT_ID</code>,{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">
                  GOOGLE_CLIENT_SECRET
                </code>{" "}
                in Vercel
                <br />
                <strong>4.</strong>{" "}
                {process.env.GOOGLE_CLIENT_ID ? (
                  <a href="/api/auth/google" className="text-accent font-medium hover:underline">
                    Connect Google Account →
                  </a>
                ) : (
                  <span className="text-text-muted">Set client ID/secret first, then redeploy</span>
                )}
              </>
            ),
          },
          {
            pack: vaultPack!,
            steps: (
              <>
                <strong>1.</strong> Create a GitHub repo for your Obsidian vault
                <br />
                <strong>2.</strong> Generate a{" "}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener"
                  className="text-accent hover:underline"
                >
                  GitHub PAT
                </a>{" "}
                with <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">repo</code> scope
                <br />
                <strong>3.</strong> Set{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">GITHUB_PAT</code> and{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">GITHUB_REPO</code>{" "}
                (owner/repo)
              </>
            ),
          },
          {
            pack: browserPack!,
            steps: (
              <>
                <strong>1.</strong> Create a{" "}
                <a
                  href="https://browserbase.com"
                  target="_blank"
                  rel="noopener"
                  className="text-accent hover:underline"
                >
                  Browserbase
                </a>{" "}
                account
                <br />
                <strong>2.</strong> Create an{" "}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener"
                  className="text-accent hover:underline"
                >
                  OpenRouter
                </a>{" "}
                API key
                <br />
                <strong>3.</strong> Set{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">
                  BROWSERBASE_API_KEY
                </code>
                ,{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">
                  BROWSERBASE_PROJECT_ID
                </code>
                ,{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">
                  OPENROUTER_API_KEY
                </code>
              </>
            ),
          },
          {
            pack: slackPack!,
            steps: (
              <>
                <strong>1.</strong> Create a{" "}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener"
                  className="text-accent hover:underline"
                >
                  Slack App
                </a>{" "}
                with Bot Token Scopes: channels:history, channels:read, chat:write, search:read
                <br />
                <strong>2.</strong> Set{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">SLACK_BOT_TOKEN</code>
              </>
            ),
          },
          {
            pack: notionPack!,
            steps: (
              <>
                <strong>1.</strong> Create a{" "}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noopener"
                  className="text-accent hover:underline"
                >
                  Notion Integration
                </a>
                <br />
                <strong>2.</strong> Share target pages/databases with the integration
                <br />
                <strong>3.</strong> Set{" "}
                <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">NOTION_API_KEY</code>
              </>
            ),
          },
        ].map(({ pack, steps }) => (
          <div key={pack.id} className="border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold">{pack.label}</span>
              {pack.enabled ? (
                <span className="text-[11px] font-medium text-green bg-green-bg px-2 py-0.5 rounded-full">
                  Configured
                </span>
              ) : (
                <span className="text-[11px] font-medium text-orange bg-orange-bg px-2 py-0.5 rounded-full">
                  Not configured
                </span>
              )}
            </div>
            <p className="text-sm text-text-dim mb-3">{pack.description}</p>
            {!pack.enabled && (
              <div className="bg-bg-muted rounded-md p-4 text-sm text-text-dim leading-7">
                {steps}
              </div>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}

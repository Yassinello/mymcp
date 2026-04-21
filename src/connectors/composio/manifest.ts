import { defineTool, type ConnectorManifest } from "@/core/types";
import { composioActionSchema, composioListSchema } from "./schemas";
import { getConfig } from "@/core/config-facade";

export const composioConnector: ConnectorManifest = {
  id: "composio",
  label: "Composio",
  description: "1000+ app integrations via Composio (Jira, HubSpot, Salesforce, Airtable, etc.)",
  guide: `Call any of 1000+ SaaS apps (Jira, HubSpot, Salesforce, Figma, Trello, …) through [Composio](https://composio.dev)'s managed-auth layer — Composio handles the per-app OAuth so you don't have to.

### Prerequisites
A Composio account. You'll connect each target app _inside_ the Composio dashboard; Kebab MCP only needs your Composio API key to dispatch calls.

### How to get credentials
1. Sign up at [app.composio.dev](https://app.composio.dev)
2. Open **Settings → API Keys** and create a new key
3. Copy it into \`COMPOSIO_API_KEY\`
4. In the Composio dashboard, go to **Connections** and connect the apps you want to use (Jira, HubSpot, …). Each connection is OAuth-based and one-click.
5. Use \`composio_list\` to discover available actions per app, then \`composio_action\` to execute them

### Troubleshooting
- _"No connected account"_: you added the API key but forgot to link the app inside Composio — go to **Connections**.
- _Action fails with permission error_: re-auth the Composio connection with broader scopes.
- _Rate limits_: each underlying app (e.g. HubSpot) enforces its own — Composio passes those errors through.`,
  requiredEnvVars: ["COMPOSIO_API_KEY"],
  testConnection: async (credentials) => {
    const key = credentials.COMPOSIO_API_KEY;
    if (!key) return { ok: false, message: "Missing API key" };
    // Light check — actual validation happens on first use.
    return { ok: true, message: "API key provided — verify in Composio dashboard" };
  },
  diagnose: async () => {
    try {
      const { Composio } = await import("@composio/core");
      const client = new Composio({ apiKey: getConfig("COMPOSIO_API_KEY")! });
      const accounts = await client.connectedAccounts.list();
      const count = Array.isArray(accounts) ? accounts.length : 0;
      return { ok: true, message: `${count} connected account(s)` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Cannot reach Composio",
      };
    }
  },
  tools: [
    defineTool({
      name: "composio_action",
      description:
        "Execute any Composio action on a connected app. Supports 1000+ apps: GitHub, Jira, HubSpot, Salesforce, Airtable, Linear, Figma, Trello, and more. Use composio_list to discover available actions for an app.",
      schema: composioActionSchema,
      handler: async (args) => {
        const { handleComposioAction } = await import("./tools/composio-action");
        return handleComposioAction(args);
      },
      destructive: true,
    }),
    defineTool({
      name: "composio_list",
      description:
        "List available Composio actions for a specific app. Use this to discover what actions you can perform.",
      schema: composioListSchema,
      handler: async (args) => {
        const { handleComposioList } = await import("./tools/composio-list");
        return handleComposioList(args);
      },
      destructive: false,
    }),
  ],
};

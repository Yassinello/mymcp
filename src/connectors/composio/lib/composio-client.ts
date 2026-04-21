import { Composio } from "@composio/core";
import { getConfig } from "@/core/config-facade";

let client: Composio | null = null;

export function getComposioClient(): Composio {
  if (!client) {
    const apiKey = getConfig("COMPOSIO_API_KEY");
    if (!apiKey) throw new Error("COMPOSIO_API_KEY not configured");
    client = new Composio({ apiKey });
  }
  return client;
}

export async function executeAction(
  actionName: string,
  params: Record<string, unknown>,
  connectedAccountId?: string
): Promise<string> {
  const composio = getComposioClient();
  const body: Record<string, unknown> = { ...params };
  if (connectedAccountId) {
    body.connectedAccountId = connectedAccountId;
  }
  const result = await composio.tools.execute(actionName, body);

  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

export async function listAvailableActions(appName: string): Promise<string[]> {
  const composio = getComposioClient();
  const tools = await composio.tools.get("default", { toolkits: [appName] });
  return (tools as unknown as { slug?: string }[]).map((t) => t.slug || "").filter(Boolean);
}

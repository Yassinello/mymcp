import { z } from "zod";
import { searchMessages } from "../lib/slack-api";

export const slackSearchSchema = {
  query: z.string().describe("Search query (supports Slack search operators: from:, in:, has:, etc.)"),
  count: z.number().optional().describe("Max results (default: 10)"),
};

export async function handleSlackSearch(params: { query: string; count?: number }) {
  const results = await searchMessages(params.query, params.count);

  if (results.length === 0) {
    return { content: [{ type: "text" as const, text: "No messages found." }] };
  }

  const lines = results.map(
    (m) => `[${m.date.slice(0, 16)}] #${m.channel} ${m.user}: ${m.text}`
  );

  return {
    content: [{ type: "text" as const, text: lines.join("\n\n") }],
  };
}

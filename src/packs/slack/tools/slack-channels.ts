import { z } from "zod";
import { listChannels } from "../lib/slack-api";

export const slackChannelsSchema = {
  limit: z.number().optional().describe("Max channels to return (default: 50)"),
};

export async function handleSlackChannels(params: { limit?: number }) {
  const channels = await listChannels(params.limit);

  if (channels.length === 0) {
    return { content: [{ type: "text" as const, text: "No channels found." }] };
  }

  const lines = channels.map(
    (c) =>
      `${c.isPrivate ? "🔒" : "#"}${c.name} (${c.memberCount} members)${c.topic ? ` — ${c.topic}` : ""}`
  );

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

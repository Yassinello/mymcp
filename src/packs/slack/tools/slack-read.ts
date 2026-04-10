import { z } from "zod";
import { readMessages } from "../lib/slack-api";

export const slackReadSchema = {
  channel: z.string().describe("Channel ID (e.g., C01ABCDEF). Use slack_channels to find IDs."),
  limit: z.number().optional().describe("Max messages to return (default: 20)"),
};

export async function handleSlackRead(params: { channel: string; limit?: number }) {
  const messages = await readMessages(params.channel, params.limit);

  if (messages.length === 0) {
    return { content: [{ type: "text" as const, text: "No messages found." }] };
  }

  const lines = messages.map((m) => {
    const thread = m.replyCount ? ` [${m.replyCount} replies]` : "";
    return `[${m.date.slice(0, 16)}] ${m.user}: ${m.text}${thread}`;
  });

  return {
    content: [{ type: "text" as const, text: lines.join("\n\n") }],
  };
}

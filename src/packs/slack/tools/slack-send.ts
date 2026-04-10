import { z } from "zod";
import { sendMessage } from "../lib/slack-api";

export const slackSendSchema = {
  channel: z.string().describe("Channel ID to send to (e.g., C01ABCDEF)"),
  text: z.string().describe("Message text (supports Slack markdown)"),
  thread_ts: z
    .string()
    .optional()
    .describe("Thread timestamp to reply to (makes it a threaded reply)"),
};

export async function handleSlackSend(params: {
  channel: string;
  text: string;
  thread_ts?: string;
}) {
  const result = await sendMessage(params.channel, params.text, params.thread_ts);
  return {
    content: [
      {
        type: "text" as const,
        text: `Message sent to ${result.channel} (ts: ${result.ts})`,
      },
    ],
  };
}

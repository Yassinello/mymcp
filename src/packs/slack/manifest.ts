import type { PackManifest } from "@/core/types";
import { slackChannelsSchema, handleSlackChannels } from "./tools/slack-channels";
import { slackReadSchema, handleSlackRead } from "./tools/slack-read";
import { slackSendSchema, handleSlackSend } from "./tools/slack-send";
import { slackSearchSchema, handleSlackSearch } from "./tools/slack-search";

export const slackPack: PackManifest = {
  id: "slack",
  label: "Slack",
  description: "Channels, messages, search, send",
  requiredEnvVars: ["SLACK_BOT_TOKEN"],
  diagnose: async () => {
    try {
      const res = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
      });
      const data = (await res.json()) as { ok: boolean; team?: string; error?: string };
      if (data.ok) return { ok: true, message: `Connected to ${data.team}` };
      return { ok: false, message: `Slack auth failed: ${data.error}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Cannot reach Slack" };
    }
  },
  tools: [
    {
      name: "slack_channels",
      description:
        "List Slack channels the bot has access to. Returns channel name, topic, member count, and ID.",
      schema: slackChannelsSchema,
      handler: async (params) => handleSlackChannels(params as { limit?: number }),
    },
    {
      name: "slack_read",
      description:
        "Read recent messages from a Slack channel. Returns sender, text, timestamp, and thread info. Use slack_channels to find the channel ID.",
      schema: slackReadSchema,
      handler: async (params) =>
        handleSlackRead(params as { channel: string; limit?: number }),
    },
    {
      name: "slack_send",
      description:
        "Send a message to a Slack channel. Supports Slack markdown. Can reply in a thread using thread_ts. Always show the message to the user for approval before calling.",
      schema: slackSendSchema,
      handler: async (params) =>
        handleSlackSend(params as { channel: string; text: string; thread_ts?: string }),
    },
    {
      name: "slack_search",
      description:
        "Search Slack messages. Supports Slack search operators: from:user, in:channel, has:link, before:date, after:date.",
      schema: slackSearchSchema,
      handler: async (params) =>
        handleSlackSearch(params as { query: string; count?: number }),
    },
  ],
};

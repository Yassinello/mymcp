import { McpToolError, ErrorCode } from "@/core/errors";

const SLACK_API = "https://slack.com/api";

interface SlackResponse {
  ok: boolean;
  error?: string;
}

async function slackFetch<T extends SlackResponse>(
  method: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token)
    throw new McpToolError({
      code: ErrorCode.CONFIGURATION_ERROR,
      toolName: "slack",
      message: "SLACK_BOT_TOKEN not configured",
      userMessage:
        "Slack pack is not configured. Add SLACK_BOT_TOKEN to your environment variables.",
      retryable: false,
    });

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.set(k, String(v));
  }

  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = (await res.json()) as T;
  if (!data.ok) {
    const slackError = data.error || "unknown";
    const isAuth =
      slackError === "not_authed" ||
      slackError === "invalid_auth" ||
      slackError === "token_revoked";
    throw new McpToolError({
      code: isAuth ? ErrorCode.AUTH_FAILED : ErrorCode.EXTERNAL_API_ERROR,
      toolName: "slack",
      message: `Slack API error: ${slackError}`,
      userMessage: isAuth
        ? `Slack authentication failed (${slackError}). Check your SLACK_BOT_TOKEN.`
        : `Slack API error: ${slackError}`,
      retryable: slackError === "ratelimited",
    });
  }
  return data;
}

// --- Types ---

export interface SlackChannel {
  id: string;
  name: string;
  topic: string;
  memberCount: number;
  isPrivate: boolean;
}

export interface SlackMessage {
  user: string;
  text: string;
  ts: string;
  date: string;
  threadTs?: string;
  replyCount?: number;
}

// --- List channels ---

export async function listChannels(limit?: number): Promise<SlackChannel[]> {
  const data = await slackFetch<
    SlackResponse & {
      channels?: {
        id: string;
        name: string;
        topic?: { value?: string };
        num_members?: number;
        is_private?: boolean;
      }[];
    }
  >("conversations.list", {
    types: "public_channel,private_channel",
    limit: limit || 50,
    exclude_archived: true,
  });

  return (data.channels || []).map((c) => ({
    id: c.id,
    name: c.name,
    topic: c.topic?.value || "",
    memberCount: c.num_members || 0,
    isPrivate: c.is_private || false,
  }));
}

// --- Read messages ---

export async function readMessages(channel: string, limit?: number): Promise<SlackMessage[]> {
  const data = await slackFetch<
    SlackResponse & {
      messages?: {
        user?: string;
        text?: string;
        ts: string;
        thread_ts?: string;
        reply_count?: number;
      }[];
    }
  >("conversations.history", {
    channel,
    limit: limit || 20,
  });

  return (data.messages || []).map((m) => ({
    user: m.user || "unknown",
    text: m.text || "",
    ts: m.ts,
    date: new Date(parseFloat(m.ts) * 1000).toISOString(),
    threadTs: m.thread_ts,
    replyCount: m.reply_count,
  }));
}

// --- Send message ---

export async function sendMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<{ ts: string; channel: string }> {
  const data = await slackFetch<SlackResponse & { ts: string; channel: string }>(
    "chat.postMessage",
    { channel, text, thread_ts: threadTs }
  );
  return { ts: data.ts, channel: data.channel };
}

// --- Read thread ---

export async function readThread(
  channel: string,
  threadTs: string,
  limit?: number
): Promise<SlackMessage[]> {
  const data = await slackFetch<
    SlackResponse & {
      messages?: {
        user?: string;
        text?: string;
        ts: string;
        thread_ts?: string;
      }[];
    }
  >("conversations.replies", {
    channel,
    ts: threadTs,
    limit: limit || 50,
  });

  // First message is the parent — skip it to return only replies
  const replies = (data.messages || []).slice(1);
  return replies.map((m) => ({
    user: m.user || "unknown",
    text: m.text || "",
    ts: m.ts,
    date: new Date(parseFloat(m.ts) * 1000).toISOString(),
    threadTs: m.thread_ts,
  }));
}

// --- User profile ---

export interface SlackProfile {
  userId: string;
  realName: string;
  displayName: string;
  title: string;
  email: string;
  phone: string;
  tz: string;
  statusText: string;
  statusEmoji: string;
}

export async function getUserProfile(userId: string): Promise<SlackProfile> {
  const data = await slackFetch<
    SlackResponse & {
      user?: {
        id: string;
        real_name?: string;
        tz?: string;
        profile?: {
          display_name?: string;
          title?: string;
          email?: string;
          phone?: string;
          status_text?: string;
          status_emoji?: string;
        };
      };
    }
  >("users.info", { user: userId });

  const u = data.user;
  return {
    userId: u?.id || userId,
    realName: u?.real_name || "",
    displayName: u?.profile?.display_name || "",
    title: u?.profile?.title || "",
    email: u?.profile?.email || "",
    phone: u?.profile?.phone || "",
    tz: u?.tz || "",
    statusText: u?.profile?.status_text || "",
    statusEmoji: u?.profile?.status_emoji || "",
  };
}

// --- Search messages ---

export async function searchMessages(
  query: string,
  count?: number
): Promise<{ text: string; channel: string; user: string; ts: string; date: string }[]> {
  // Note: search requires a user token (xoxp-), not a bot token
  const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
  if (!token)
    throw new McpToolError({
      code: ErrorCode.CONFIGURATION_ERROR,
      toolName: "slack",
      message: "SLACK_BOT_TOKEN or SLACK_USER_TOKEN not configured",
      userMessage:
        "Slack search requires SLACK_USER_TOKEN or SLACK_BOT_TOKEN in your environment variables.",
      retryable: false,
    });

  const res = await fetch(
    `${SLACK_API}/search.messages?query=${encodeURIComponent(query)}&count=${count || 10}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = (await res.json()) as SlackResponse & {
    messages?: {
      matches?: {
        text: string;
        channel?: { name: string };
        user?: string;
        ts: string;
      }[];
    };
  };

  if (!data.ok)
    throw new McpToolError({
      code: ErrorCode.EXTERNAL_API_ERROR,
      toolName: "slack",
      message: `Slack search error: ${data.error}`,
      userMessage: `Slack search failed: ${data.error}`,
      retryable: data.error === "ratelimited",
    });

  return (data.messages?.matches || []).map((m) => ({
    text: m.text,
    channel: m.channel?.name || "",
    user: m.user || "",
    ts: m.ts,
    date: new Date(parseFloat(m.ts) * 1000).toISOString(),
  }));
}

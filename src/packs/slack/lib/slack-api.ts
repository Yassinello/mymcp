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
  if (!token) throw new Error("SLACK_BOT_TOKEN not configured");

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
    throw new Error(`Slack API error: ${data.error || "unknown"}`);
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

export async function readMessages(
  channel: string,
  limit?: number
): Promise<SlackMessage[]> {
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

// --- Search messages ---

export async function searchMessages(
  query: string,
  count?: number
): Promise<{ text: string; channel: string; user: string; ts: string; date: string }[]> {
  // Note: search requires a user token (xoxp-), not a bot token
  const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN or SLACK_USER_TOKEN not configured");

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

  if (!data.ok) throw new Error(`Slack search error: ${data.error}`);

  return (data.messages?.matches || []).map((m) => ({
    text: m.text,
    channel: m.channel?.name || "",
    user: m.user || "",
    ts: m.ts,
    date: new Date(parseFloat(m.ts) * 1000).toISOString(),
  }));
}

import { getGoogleAccessToken } from "./google-auth";

interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  snippet: string;
}

export async function listEmails(opts: {
  maxResults?: number;
  query?: string;
}): Promise<EmailSummary[]> {
  const token = await getGoogleAccessToken();
  const maxResults = opts.maxResults || 10;
  const q = opts.query || "";

  const listUrl =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?` +
    `maxResults=${maxResults}&q=${encodeURIComponent(q)}`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();

  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  const emails = await Promise.all(
    listData.messages.map(async (msg: { id: string }) => {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
      const msgRes = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const msgData = await msgRes.json();

      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find(
          (h: { name: string; value: string }) =>
            h.name.toLowerCase() === name.toLowerCase()
        )?.value || "";

      return {
        id: msg.id,
        from: getHeader("From").replace(/<[^>]+>/g, "").trim(),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        unread: (msgData.labelIds || []).includes("UNREAD"),
        snippet: msgData.snippet || "",
      };
    })
  );

  return emails;
}

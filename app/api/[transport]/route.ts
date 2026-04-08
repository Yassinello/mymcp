import { createMcpHandler } from "mcp-handler";
import { timingSafeEqual } from "crypto";
import { withLogging } from "@/lib/logging";
import { vaultWriteSchema, handleVaultWrite } from "@/tools/vault-write";
import { vaultReadSchema, handleVaultRead } from "@/tools/vault-read";
import { vaultSearchSchema, handleVaultSearch } from "@/tools/vault-search";
import { vaultListSchema, handleVaultList } from "@/tools/vault-list";
import { vaultDeleteSchema, handleVaultDelete } from "@/tools/vault-delete";
import { vaultMoveSchema, handleVaultMove } from "@/tools/vault-move";
import { saveArticleSchema, handleSaveArticle } from "@/tools/save-article";
import { readPaywalledSchema, handleReadPaywalled } from "@/tools/read-paywalled";
import { handleMyContext } from "@/tools/my-context";
import { vaultAppendSchema, handleVaultAppend } from "@/tools/vault-append";
import { vaultBatchReadSchema, handleVaultBatchRead } from "@/tools/vault-batch-read";
import { vaultRecentSchema, handleVaultRecent } from "@/tools/vault-recent";
import { vaultStatsSchema, handleVaultStats } from "@/tools/vault-stats";
import { vaultBacklinksSchema, handleVaultBacklinks } from "@/tools/vault-backlinks";
import { vaultDueSchema, handleVaultDue } from "@/tools/vault-due";
import { gmailInboxSchema, handleGmailInbox } from "@/tools/gmail-inbox";
import { gmailReadSchema, handleGmailRead } from "@/tools/gmail-read";
import { gmailSendSchema, handleGmailSend } from "@/tools/gmail-send";
import { gmailReplySchema, handleGmailReply } from "@/tools/gmail-reply";
import { gmailTrashSchema, handleGmailTrash } from "@/tools/gmail-trash";
import { gmailLabelSchema, handleGmailLabel } from "@/tools/gmail-label";
import { gmailSearchSchema, handleGmailSearch } from "@/tools/gmail-search";
import { gmailDraftSchema, handleGmailDraft } from "@/tools/gmail-draft";
import { gmailAttachmentSchema, handleGmailAttachment } from "@/tools/gmail-attachment";
import { calendarEventsSchema, handleCalendarEvents } from "@/tools/calendar-events";
import { calendarCreateSchema, handleCalendarCreate } from "@/tools/calendar-create";
import { calendarDeleteSchema, handleCalendarDelete } from "@/tools/calendar-delete";
import { calendarUpdateSchema, handleCalendarUpdate } from "@/tools/calendar-update";
import { calendarFindFreeSchema, handleCalendarFindFree } from "@/tools/calendar-find-free";
import { calendarRsvpSchema, handleCalendarRsvp } from "@/tools/calendar-rsvp";
import { contactsSearchSchema, handleContactsSearch } from "@/tools/contacts-search";
import { driveSearchSchema, handleDriveSearch } from "@/tools/drive-search";
import { driveReadSchema, handleDriveRead } from "@/tools/drive-read";
import { mcpLogsSchema, handleMcpLogs } from "@/tools/mcp-logs";
import { webBrowseSchema, handleWebBrowse } from "@/tools/web-browse";
import { webExtractSchema, handleWebExtract } from "@/tools/web-extract";
import { webActSchema, handleWebAct } from "@/tools/web-act";
import { linkedinFeedSchema, handleLinkedinFeed } from "@/tools/linkedin-feed";

const mcpHandler = createMcpHandler(
  (server) => {
    server.tool(
      "vault_write",
      "Create or update a note in the Obsidian vault. Handles base64 encoding, SHA resolution for updates, and optional YAML frontmatter. Pass 'sha' from a previous vault_read to skip an extra API call.",
      vaultWriteSchema,
      withLogging("vault_write", async (params) => handleVaultWrite(params))
    );

    server.tool(
      "vault_read",
      "Read a note from the Obsidian vault. Returns the markdown body, parsed frontmatter (via js-yaml), and the file SHA (reusable for vault_write updates).",
      vaultReadSchema,
      withLogging("vault_read", async (params) => handleVaultRead(params))
    );

    server.tool(
      "vault_search",
      "Full-text search across the Obsidian vault via GitHub Search API. Supports pagination with page parameter.",
      vaultSearchSchema,
      withLogging("vault_search", async (params) => handleVaultSearch(params))
    );

    server.tool(
      "vault_list",
      "List notes and folders in a vault directory. Useful for browsing the vault structure.",
      vaultListSchema,
      withLogging("vault_list", async (params) => handleVaultList(params))
    );

    server.tool(
      "vault_delete",
      "Delete a note from the Obsidian vault.",
      vaultDeleteSchema,
      withLogging("vault_delete", async (params) => handleVaultDelete(params))
    );

    server.tool(
      "vault_move",
      "Move or rename a note. Reads source, writes to new path, deletes original. Reports partial failures if delete fails after successful write.",
      vaultMoveSchema,
      withLogging("vault_move", async (params) => handleVaultMove(params))
    );

    server.tool(
      "save_article",
      "Save a web article to the vault. Fetches URL via Jina Reader (markdown extraction), adds YAML frontmatter (title, source, date, tags), writes to Veille/ folder. Auto-detects Medium URLs and uses stored session cookie to bypass paywall. Max 5MB.",
      saveArticleSchema,
      withLogging("save_article", async (params) => handleSaveArticle(params))
    );

    server.tool(
      "read_paywalled",
      "Read a paywalled article (Medium, etc.) and return its full markdown content. Uses stored session cookies to access premium content. Does NOT save to vault — use save_article for that, or vault_write manually after analysis.",
      readPaywalledSchema,
      withLogging("read_paywalled", async (params) => handleReadPaywalled(params))
    );

    server.tool(
      "vault_append",
      "Append content to an existing note without rewriting it. Reads the note, appends your content with a separator, and writes back in one operation (2 API calls instead of 3). Ideal for journals, running logs, and accumulating ideas.",
      vaultAppendSchema,
      withLogging("vault_append", async (params) => handleVaultAppend(params))
    );

    server.tool(
      "vault_batch_read",
      "Read multiple notes in a single call (max 20). Returns all contents with parsed frontmatter and SHA. Perfect for weekly reviews, daily digests, or loading context from several notes at once.",
      vaultBatchReadSchema,
      withLogging("vault_batch_read", async (params) => handleVaultBatchRead(params))
    );

    server.tool(
      "vault_recent",
      "Get the N most recently modified notes in the vault (or a specific folder). Returns paths, commit messages, and dates. Essential for weekly reviews and catching up on recent activity.",
      vaultRecentSchema,
      withLogging("vault_recent", async (params) => handleVaultRecent(params))
    );

    server.tool(
      "vault_stats",
      "Get vault statistics: total notes, notes per folder, inbox count, total size. Useful for housekeeping and understanding vault structure at a glance.",
      vaultStatsSchema,
      withLogging("vault_stats", async (params) => handleVaultStats(params))
    );

    server.tool(
      "vault_backlinks",
      "Find all notes that link to a given note via [[wikilinks]]. Also returns forward links from the target note. Enables graph-of-knowledge navigation — ask 'what references [[cadens]]' or 'what's connected to this note'.",
      vaultBacklinksSchema,
      withLogging("vault_backlinks", async (params) => handleVaultBacklinks(params))
    );

    server.tool(
      "vault_due",
      "Find notes with a 'resurface' frontmatter field whose date has passed. Supports resurface: YYYY-MM-DD (date-based) and resurface: when_relevant (always included). Use for spaced repetition, reminders, and resurfacing forgotten insights.",
      vaultDueSchema,
      withLogging("vault_due", async (params) => handleVaultDue(params))
    );

    // --- Gmail tools ---

    server.tool(
      "gmail_inbox",
      "List recent emails from Gmail. Supports Gmail search queries (is:unread, from:xxx, subject:xxx, newer_than:7d). Returns sender, subject, date, read/unread status, snippet, and message ID.",
      gmailInboxSchema,
      withLogging("gmail_inbox", async (params) => handleGmailInbox(params))
    );

    server.tool(
      "gmail_read",
      "Read the full content of an email (body, headers, attachments list). Use the message ID from gmail_inbox.",
      gmailReadSchema,
      withLogging("gmail_read", async (params) => handleGmailRead(params))
    );

    server.tool(
      "gmail_send",
      "Send a new email from Yassine's Gmail. Supports To, CC, BCC. Plain text body. Always show the draft to the user for approval before calling this tool.",
      gmailSendSchema,
      withLogging("gmail_send", async (params) => handleGmailSend(params))
    );

    server.tool(
      "gmail_reply",
      "Reply to an existing email thread. Automatically sets In-Reply-To, References, and thread ID. Always show the reply to the user for approval before calling this tool.",
      gmailReplySchema,
      withLogging("gmail_reply", async (params) => handleGmailReply(params))
    );

    server.tool(
      "gmail_trash",
      "Move an email to trash. Requires the message ID from gmail_inbox.",
      gmailTrashSchema,
      withLogging("gmail_trash", async (params) => handleGmailTrash(params))
    );

    server.tool(
      "gmail_label",
      "Add or remove labels on an email. Use to archive (remove INBOX), mark read (remove UNREAD), star (add STARRED), etc.",
      gmailLabelSchema,
      withLogging("gmail_label", async (params) => handleGmailLabel(params))
    );

    server.tool(
      "gmail_search",
      "Search emails with full body content. Supports all Gmail operators (from:, subject:, has:attachment, after:, label:, etc.). Returns up to 10 results with full message body.",
      gmailSearchSchema,
      withLogging("gmail_search", async (params) => handleGmailSearch(params))
    );

    server.tool(
      "gmail_draft",
      "Create a draft email in Gmail without sending it. The user can review and send from Gmail. Safer than gmail_send for important emails.",
      gmailDraftSchema,
      withLogging("gmail_draft", async (params) => handleGmailDraft(params))
    );

    server.tool(
      "gmail_attachment",
      "Download and read an email attachment. Returns text content for text files, or metadata for binary files. Get attachment IDs from gmail_read.",
      gmailAttachmentSchema,
      withLogging("gmail_attachment", async (params) => handleGmailAttachment(params))
    );

    // --- Calendar tools ---

    server.tool(
      "calendar_events",
      "List upcoming events from ALL Google Calendars (personal, shared, etc.). Returns event title, time, calendar name, location, and Meet link.",
      calendarEventsSchema,
      withLogging("calendar_events", async (params) => handleCalendarEvents(params))
    );

    server.tool(
      "calendar_create",
      "Create a new event on Google Calendar. Supports datetime or all-day events, location, and description. Default calendar is primary.",
      calendarCreateSchema,
      withLogging("calendar_create", async (params) => handleCalendarCreate(params))
    );

    server.tool(
      "calendar_delete",
      "Delete/cancel an event from Google Calendar. Requires event ID from calendar_events.",
      calendarDeleteSchema,
      withLogging("calendar_delete", async (params) => handleCalendarDelete(params))
    );

    server.tool(
      "calendar_update",
      "Update an existing calendar event (reschedule, rename, change location). Only pass the fields you want to change.",
      calendarUpdateSchema,
      withLogging("calendar_update", async (params) => handleCalendarUpdate(params))
    );

    server.tool(
      "calendar_find_free",
      "Find free time slots across all calendars. Checks busy times via FreeBusy API and returns available slots during working hours (8h-19h, Mon-Fri, Europe/Paris).",
      calendarFindFreeSchema,
      withLogging("calendar_find_free", async (params) => handleCalendarFindFree(params))
    );

    server.tool(
      "calendar_rsvp",
      "Accept, decline, or tentatively accept a calendar invitation. Sends update to organizer.",
      calendarRsvpSchema,
      withLogging("calendar_rsvp", async (params) => handleCalendarRsvp(params))
    );

    // --- Contacts tools ---

    server.tool(
      "contacts_search",
      "Search Google Contacts by name, email, phone, or company. Returns name, email, phone, organization, and job title. Use to find someone's email before sending.",
      contactsSearchSchema,
      withLogging("contacts_search", async (params) => handleContactsSearch(params))
    );

    // --- Drive tools ---

    server.tool(
      "drive_search",
      "Search Google Drive for files by name or content. Returns file name, type (Doc/Sheet/Slides/PDF), last modified date, and link. Searches across all shared drives.",
      driveSearchSchema,
      withLogging("drive_search", async (params) => handleDriveSearch(params))
    );

    server.tool(
      "drive_read",
      "Read the content of a Google Drive file. Exports Google Docs as plain text, Sheets as CSV, Slides as text. For binary files (PDF, images), returns metadata with a link.",
      driveReadSchema,
      withLogging("drive_read", async (params) => handleDriveRead(params))
    );

    // --- Admin tools ---

    server.tool(
      "mcp_logs",
      "View recent MCP tool call logs. Shows tool name, duration, status, and errors. Useful for debugging failed calls. Logs are in-memory (reset on cold start).",
      mcpLogsSchema,
      withLogging("mcp_logs", async (params) => handleMcpLogs(params))
    );

    // --- Browser tools ---

    server.tool(
      "web_browse",
      "Open a URL in a cloud browser and return the visible text content. Handles JavaScript-rendered pages, login-protected pages (if session exists), and dynamic content. Use scroll_count to load more content. Use context_name='linkedin' for LinkedIn pages (uses saved login session).",
      webBrowseSchema,
      withLogging("web_browse", async (params) => handleWebBrowse(params))
    );

    server.tool(
      "web_extract",
      "Open a URL and extract structured data using AI. Provide a natural language instruction describing what to extract. Returns JSON data. Great for: LinkedIn feed posts, competitor pricing, changelogs, news headlines, product features, job listings.",
      webExtractSchema,
      withLogging("web_extract", async (params) => handleWebExtract(params))
    );

    server.tool(
      "web_act",
      "Open a URL and perform actions in the browser using natural language commands. Each action is executed sequentially. DANGEROUS: can click buttons, fill forms, submit data. The calling agent should always ask user confirmation before invoking this tool. Examples: post on LinkedIn, fill a form, click a button, accept cookies.",
      webActSchema,
      withLogging("web_act", async (params) => handleWebAct(params))
    );

    server.tool(
      "linkedin_feed",
      "Read your LinkedIn feed. Returns recent posts with author, content text, engagement metrics (likes, comments), and relative date. Automatically uses saved LinkedIn session. Call max 3 times per day.",
      linkedinFeedSchema,
      withLogging("linkedin_feed", async (params) => handleLinkedinFeed(params))
    );

    // --- Context ---

    server.tool(
      "my_context",
      "Get Yassine's personal context (role, active projects, priorities, tech stack). Reads from System/context.md in the vault.",
      {},
      withLogging("my_context", async () => handleMyContext())
    );
  },
  {
    serverInfo: {
      name: "YassMCP",
      version: "4.0.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
  }
);

function checkAuth(request: Request): Response | null {
  const token = process.env.MCP_AUTH_TOKEN?.trim();
  if (!token) return null;

  // Check Authorization header (timing-safe)
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer.length === token.length) {
      try {
        if (timingSafeEqual(Buffer.from(bearer), Buffer.from(token))) {
          return null;
        }
      } catch { /* noop */ }
    }
  }

  // Fallback: query string token (needed for Claude Desktop which embeds token in URL)
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken && queryToken.length === token.length) {
    try {
      if (timingSafeEqual(Buffer.from(queryToken), Buffer.from(token))) {
        return null;
      }
    } catch { /* noop */ }
  }

  return new Response("Unauthorized", { status: 401 });
}

async function handler(request: Request): Promise<Response> {
  const authError = checkAuth(request);
  if (authError) return authError;
  return mcpHandler(request);
}

export { handler as GET, handler as POST, handler as DELETE };

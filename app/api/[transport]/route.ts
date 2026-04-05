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
import { calendarEventsSchema, handleCalendarEvents } from "@/tools/calendar-events";

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

    server.tool(
      "gmail_inbox",
      "List recent emails from Gmail. Supports Gmail search queries (is:unread, from:xxx, subject:xxx, newer_than:7d). Returns sender, subject, date, read/unread status, and snippet.",
      gmailInboxSchema,
      withLogging("gmail_inbox", async (params) => handleGmailInbox(params))
    );

    server.tool(
      "calendar_events",
      "List upcoming events from ALL Google Calendars (personal, shared, etc.). Returns event title, time, calendar name, location, and Meet link.",
      calendarEventsSchema,
      withLogging("calendar_events", async (params) => handleCalendarEvents(params))
    );

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

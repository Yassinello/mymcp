import { createMcpHandler } from "mcp-handler";
import { withLogging } from "@/lib/logging";
import { vaultWriteSchema, handleVaultWrite } from "@/tools/vault-write";
import { vaultReadSchema, handleVaultRead } from "@/tools/vault-read";
import { vaultSearchSchema, handleVaultSearch } from "@/tools/vault-search";
import { vaultListSchema, handleVaultList } from "@/tools/vault-list";
import { vaultDeleteSchema, handleVaultDelete } from "@/tools/vault-delete";
import { vaultMoveSchema, handleVaultMove } from "@/tools/vault-move";
import { saveArticleSchema, handleSaveArticle } from "@/tools/save-article";
import { handleMyContext } from "@/tools/my-context";

const mcpHandler = createMcpHandler(
  (server) => {
    server.tool(
      "vault_write",
      "Create or update a note in the Obsidian vault. Handles base64 encoding, SHA resolution for updates, and optional YAML frontmatter.",
      vaultWriteSchema,
      withLogging("vault_write", async (params) => handleVaultWrite(params))
    );

    server.tool(
      "vault_read",
      "Read a note from the Obsidian vault. Returns the markdown body and parsed frontmatter.",
      vaultReadSchema,
      withLogging("vault_read", async (params) => handleVaultRead(params))
    );

    server.tool(
      "vault_search",
      "Full-text search across the Obsidian vault. Returns matching notes with text excerpts.",
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
      "Move or rename a note in the Obsidian vault. Reads the source, writes to the new path, then deletes the original.",
      vaultMoveSchema,
      withLogging("vault_move", async (params) => handleVaultMove(params))
    );

    server.tool(
      "save_article",
      "Save a web article to the vault. Fetches the URL, extracts clean markdown via Jina Reader, adds frontmatter (title, source, date, tags), and writes to Veille/ folder.",
      saveArticleSchema,
      withLogging("save_article", async (params) => handleSaveArticle(params))
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
      version: "2.0.0",
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

  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer === token) return null;
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken === token) return null;

  return new Response("Unauthorized", { status: 401 });
}

async function handler(request: Request): Promise<Response> {
  const authError = checkAuth(request);
  if (authError) return authError;
  return mcpHandler(request);
}

export { handler as GET, handler as POST, handler as DELETE };

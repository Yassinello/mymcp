import type { PackManifest } from "@/core/types";
import { notionSearchSchema, handleNotionSearch } from "./tools/notion-search";
import { notionReadSchema, handleNotionRead } from "./tools/notion-read";
import { notionCreateSchema, handleNotionCreate } from "./tools/notion-create";

export const notionPack: PackManifest = {
  id: "notion",
  label: "Notion",
  description: "Search, read, and create pages in Notion",
  requiredEnvVars: ["NOTION_API_KEY"],
  diagnose: async () => {
    try {
      const res = await fetch("https://api.notion.com/v1/users/me", {
        headers: {
          Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
          "Notion-Version": "2022-06-28",
        },
      });
      if (res.ok) return { ok: true, message: "Notion API connected" };
      return { ok: false, message: `Notion API ${res.status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Cannot reach Notion" };
    }
  },
  tools: [
    {
      name: "notion_search",
      description:
        "Search Notion pages by title or content. Returns page title, URL, last edited date, and properties.",
      schema: notionSearchSchema,
      handler: async (params) =>
        handleNotionSearch(params as { query: string; limit?: number }),
    },
    {
      name: "notion_read",
      description:
        "Read the full content of a Notion page. Returns title and content as markdown (headings, paragraphs, lists, code blocks).",
      schema: notionReadSchema,
      handler: async (params) => handleNotionRead(params as { page_id: string }),
    },
    {
      name: "notion_create",
      description:
        "Create a new page in a Notion database. Provide the database ID, title, and optional content.",
      schema: notionCreateSchema,
      handler: async (params) =>
        handleNotionCreate(
          params as { database_id: string; title: string; content?: string }
        ),
    },
  ],
};

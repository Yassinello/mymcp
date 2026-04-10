import { z } from "zod";
import { readPage } from "../lib/notion-api";

export const notionReadSchema = {
  page_id: z.string().describe("Notion page ID (from notion_search results or page URL)"),
};

export async function handleNotionRead(params: { page_id: string }) {
  const page = await readPage(params.page_id);

  return {
    content: [
      {
        type: "text" as const,
        text: `# ${page.title}\n\n${page.content || "(empty page)"}`,
      },
    ],
  };
}

import { z } from "zod";
import { createPage } from "../lib/notion-api";

export const notionCreateSchema = {
  database_id: z
    .string()
    .describe("Parent database ID where the page will be created"),
  title: z.string().describe("Page title"),
  content: z
    .string()
    .optional()
    .describe("Page content as plain text (paragraphs separated by double newlines)"),
};

export async function handleNotionCreate(params: {
  database_id: string;
  title: string;
  content?: string;
}) {
  const page = await createPage({
    parentId: params.database_id,
    title: params.title,
    content: params.content,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: `Page created: ${page.url}`,
      },
    ],
  };
}

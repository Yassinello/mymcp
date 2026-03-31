import { z } from "zod";
import { vaultWrite } from "@/lib/github";

export const saveArticleSchema = {
  url: z.string().url().describe("URL of the article to save"),
  title: z
    .string()
    .optional()
    .describe("Article title (auto-extracted if omitted)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags to add, e.g. ['ai', 'strategy']"),
  folder: z
    .string()
    .optional()
    .describe('Target folder in vault (default: "Veille/")'),
};

export async function handleSaveArticle(params: {
  url: string;
  title?: string;
  tags?: string[];
  folder?: string;
}) {
  // Fetch article content via Jina Reader (markdown extraction)
  const jinaUrl = `https://r.jina.ai/${params.url}`;
  const res = await fetch(jinaUrl, {
    headers: { Accept: "text/markdown" },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch article: ${res.status} ${res.statusText}`
    );
  }

  const markdown = await res.text();

  // Extract title from markdown (first # heading) if not provided
  let title = params.title;
  if (!title) {
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    title = titleMatch ? titleMatch[1] : new URL(params.url).hostname;
  }

  // Build filename from title
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const folder = params.folder?.replace(/\/$/, "") || "Veille";
  const path = `${folder}/${slug}.md`;
  const date = new Date().toISOString().split("T")[0];

  // Build frontmatter
  const fmLines = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `source: "${params.url}"`,
    `date: ${date}`,
    `saved_via: YassMCP`,
  ];
  if (params.tags && params.tags.length > 0) {
    fmLines.push(`tags:\n${params.tags.map((t) => `  - ${t}`).join("\n")}`);
  }
  fmLines.push("---\n");

  const fullContent = fmLines.join("\n") + "\n" + markdown;

  // Save to vault
  const result = await vaultWrite(
    path,
    fullContent,
    `Save article: ${title} via YassMCP`
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            title,
            path: result.path,
            source: params.url,
            contentLength: markdown.length,
            message:
              "Article saved. The raw markdown content is in the vault — use Claude to analyze, summarize, or extract takeaways from it.",
          },
          null,
          2
        ),
      },
    ],
  };
}

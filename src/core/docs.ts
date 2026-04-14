/**
 * Documentation loader for the in-dashboard Documentation tab.
 *
 * Reads markdown files from `content/docs/` at request time. Each file's
 * frontmatter (a small TOML-ish header between two `---` lines) provides
 * the title, summary, and ordering. Files are ordered by `order` then
 * filename. Missing frontmatter is tolerated — the slug is used as title.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { cache } from "react";
import { parseFrontmatter } from "./frontmatter";

export interface DocEntry {
  slug: string;
  title: string;
  summary: string;
  content: string;
  order: number;
}

const DOCS_DIR = resolve(process.cwd(), "content", "docs");

/**
 * React.cache memoization — `loadDocs()` is called from a server
 * component (`app/config/page.tsx`). Wrapping with `cache()` ensures
 * the filesystem read runs at most once per render tree, even if the
 * page logic branches and asks for docs from multiple places.
 *
 * Cache key is implicit (no args), so this is effectively a singleton
 * for the current request — perfect for static in-repo content.
 */
export const loadDocs = cache((): DocEntry[] => {
  if (!existsSync(DOCS_DIR)) return [];
  let files: string[];
  try {
    files = readdirSync(DOCS_DIR);
  } catch {
    return [];
  }

  const docs: DocEntry[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const path = join(DOCS_DIR, file);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    let raw;
    try {
      raw = readFileSync(path, "utf-8");
    } catch {
      continue;
    }

    const { meta, body } = parseFrontmatter(raw);
    const slug = file.replace(/\.md$/, "");
    const title =
      typeof meta.title === "string" && meta.title
        ? meta.title
        : slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const summary = typeof meta.summary === "string" ? meta.summary : "";
    const orderRaw = meta.order;
    const order =
      typeof orderRaw === "number"
        ? orderRaw
        : typeof orderRaw === "string"
          ? parseInt(orderRaw, 10) || 999
          : 999;
    docs.push({ slug, title, summary, content: body.trim(), order });
  }

  return docs.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
});

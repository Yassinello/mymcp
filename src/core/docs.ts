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

export interface DocEntry {
  slug: string;
  title: string;
  summary: string;
  content: string;
  order: number;
}

const DOCS_DIR = resolve(process.cwd(), "content", "docs");

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
    if (key) meta[key] = value;
  }
  return { meta, body: match[2] };
}

export function loadDocs(): DocEntry[] {
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
    docs.push({
      slug,
      title: meta.title || slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      summary: meta.summary || "",
      content: body.trim(),
      order: meta.order ? parseInt(meta.order, 10) || 999 : 999,
    });
  }

  return docs.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

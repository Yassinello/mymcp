import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/core/auth";
import { fetchRemote } from "@/connectors/skills/lib/remote-fetcher";
import { createSkill } from "@/connectors/skills/store";

/**
 * POST /api/config/skills/import
 *
 * Two actions:
 * - { url, action: "preview" } → fetch + parse, return preview without saving
 * - { url, action: "save" }    → fetch + parse + persist as a remote skill
 *
 * Frontmatter parser supports:
 *   ---
 *   name: my-skill
 *   description: ...
 *   arguments:
 *     - name: arg1
 *       description: ...
 *       required: true
 *   ---
 *
 * Falls back to inferring name from the URL filename when frontmatter is
 * missing.
 */

interface ParsedSkill {
  name: string;
  description: string;
  content: string;
  arguments: { name: string; description?: string; required?: boolean }[];
}

interface FrontmatterArg {
  name?: unknown;
  description?: unknown;
  required?: unknown;
}

function parseFrontmatter(raw: string): {
  meta: Record<string, unknown>;
  body: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw, warnings: ["No frontmatter found — inferring name from URL"] };

  const meta: Record<string, unknown> = {};
  const lines = match[1].split(/\r?\n/);
  let currentArrayKey: string | null = null;
  let currentArray: FrontmatterArg[] = [];
  let currentItem: FrontmatterArg | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");

    // Top-level key
    const topLevel = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (topLevel && !line.startsWith(" ") && !line.startsWith("-")) {
      // Flush previous array
      if (currentArrayKey) {
        if (currentItem) currentArray.push(currentItem);
        meta[currentArrayKey] = currentArray;
        currentArrayKey = null;
        currentArray = [];
        currentItem = null;
      }
      const [, key, value] = topLevel;
      const trimmed = value.trim();
      if (trimmed === "") {
        // Likely starts an array
        currentArrayKey = key;
        currentArray = [];
        currentItem = null;
      } else {
        meta[key] = trimmed.replace(/^["']|["']$/g, "");
      }
      continue;
    }

    // Array item start
    const itemStart = line.match(/^\s*-\s+(.*)$/);
    if (itemStart && currentArrayKey) {
      if (currentItem) currentArray.push(currentItem);
      currentItem = {};
      const inline = itemStart[1].match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
      if (inline) {
        const [, k, v] = inline;
        (currentItem as Record<string, unknown>)[k] = parseScalar(v);
      }
      continue;
    }

    // Array item field
    const itemField = line.match(/^\s+([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (itemField && currentItem) {
      const [, k, v] = itemField;
      (currentItem as Record<string, unknown>)[k] = parseScalar(v);
      continue;
    }
  }

  if (currentArrayKey) {
    if (currentItem) currentArray.push(currentItem);
    meta[currentArrayKey] = currentArray;
  }

  return { meta, body: match[2], warnings };
}

function parseScalar(s: string): unknown {
  const trimmed = s.trim().replace(/^["']|["']$/g, "");
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  return trimmed;
}

function inferNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").filter(Boolean);
    const last = path[path.length - 1] || "imported-skill";
    return last.replace(/\.(md|markdown|txt)$/i, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  } catch {
    return "imported-skill";
  }
}

function buildSkillFromContent(url: string, content: string): { skill: ParsedSkill; warnings: string[] } {
  const { meta, body, warnings } = parseFrontmatter(content);

  const name =
    typeof meta.name === "string" && meta.name.trim() ? (meta.name as string).trim() : inferNameFromUrl(url);
  const description =
    typeof meta.description === "string" ? (meta.description as string).trim() : "";

  const args: { name: string; description?: string; required?: boolean }[] = [];
  if (Array.isArray(meta.arguments)) {
    for (const a of meta.arguments as FrontmatterArg[]) {
      if (a && typeof a === "object" && typeof a.name === "string") {
        args.push({
          name: a.name,
          description: typeof a.description === "string" ? a.description : undefined,
          required: a.required === true,
        });
      }
    }
  } else if (meta.arguments) {
    warnings.push("`arguments` field present but not in expected list format — ignored");
  }

  return {
    skill: {
      name,
      description,
      content: body.trim(),
      arguments: args,
    },
    warnings,
  };
}

export async function POST(request: Request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  let body: { url?: string; action?: "preview" | "save" };
  try {
    body = (await request.json()) as { url?: string; action?: "preview" | "save" };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const url = body.url?.trim();
  const action = body.action || "preview";
  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }

  // fetchRemote enforces https-only, SSRF protection, byte cap, timeout.
  const fetched = await fetchRemote(url);
  if (!fetched.ok || !fetched.content) {
    return NextResponse.json({ ok: false, error: fetched.error || "Fetch failed" });
  }

  const { skill, warnings } = buildSkillFromContent(url, fetched.content);

  if (action === "preview") {
    return NextResponse.json({ ok: true, skill, warnings });
  }

  // action === "save"
  if (!skill.name || skill.name.length < 1) {
    return NextResponse.json({ ok: false, error: "Could not infer a skill name" }, { status: 400 });
  }

  try {
    const created = await createSkill({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      arguments: skill.arguments.map((a) => ({
        name: a.name,
        description: a.description ?? "",
        required: a.required ?? false,
      })),
      source: { type: "remote", url, cachedContent: fetched.content, cachedAt: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Save failed",
    });
  }
}

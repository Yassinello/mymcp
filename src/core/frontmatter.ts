/**
 * Shared frontmatter parser built on js-yaml (already a project dep).
 *
 * Replaces the hand-rolled YAML-subset parser that lived in
 * app/api/config/skills/import/route.ts and src/core/docs.ts. The old
 * parser silently dropped multiline block scalars, nested maps, and
 * every other YAML feature beyond single-line `key: value` — see
 * TECH-IMPROVEMENTS-v0.5 T2 and code-review H3 for the incident history.
 *
 * Usage:
 *   const { meta, body, warnings } = parseFrontmatter(raw);
 *
 * Contract:
 *   - Returns `{ meta: {}, body: raw, warnings: [...] }` when the
 *     `--- ... ---` delimiters are missing, so callers can still handle
 *     un-fenced markdown.
 *   - YAML parse errors degrade gracefully: meta is empty, warning is
 *     recorded, body is the portion after the second `---`.
 *   - Meta values are typed `unknown` — callers validate shape before
 *     trusting individual fields.
 */

import yaml from "js-yaml";

export interface FrontmatterResult {
  meta: Record<string, unknown>;
  body: string;
  warnings: string[];
}

export function parseFrontmatter(raw: string): FrontmatterResult {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return {
      meta: {},
      body: raw,
      warnings: ["No frontmatter found — meta is empty"],
    };
  }

  const [, frontText, body] = match;
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = yaml.load(frontText, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    warnings.push(
      `Frontmatter YAML parse failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { meta: {}, body, warnings };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    warnings.push("Frontmatter parsed but is not a key/value map — ignored");
    return { meta: {}, body, warnings };
  }

  return {
    meta: parsed as Record<string, unknown>,
    body,
    warnings,
  };
}

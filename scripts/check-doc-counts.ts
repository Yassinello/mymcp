/**
 * Doc consistency check — fails CI when README or in-app docs claim a
 * tool/connector count that drifts from the registry.
 *
 * Truth source: `defineTool(` occurrences in src/connectors/* /manifest.ts
 * + the count of manifest files. We use static AST-ish grep instead of
 * importing the registry because the registry conditionally hides tools
 * based on env (e.g. `read_paywalled_hard` only registers when Browserbase
 * is configured), and we want the "what ships when fully configured" number.
 *
 * Run: `npx tsx scripts/check-doc-counts.ts`
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const CONNECTORS_DIR = join(ROOT, "src", "connectors");
const DOCS_DIR = join(ROOT, "content", "docs");
const README_PATH = join(ROOT, "README.md");

interface Drift {
  file: string;
  line: number;
  text: string;
  claimed: number;
  expected: number;
  unit: "tools" | "connectors";
}

function countToolsPerConnector(): Map<string, number> {
  const out = new Map<string, number>();
  for (const dir of readdirSync(CONNECTORS_DIR)) {
    const manifest = join(CONNECTORS_DIR, dir, "manifest.ts");
    try {
      if (!statSync(manifest).isFile()) continue;
    } catch {
      continue;
    }
    const src = readFileSync(manifest, "utf-8");
    const matches = src.match(/\bdefineTool\s*\(\s*\{/g);
    out.set(dir, matches ? matches.length : 0);
  }
  return out;
}

/**
 * Scan a doc for "<num>(+)? tools" and "<num> connectors" claims. Allow
 * the docs to use "N+" when N <= expected (forward-compat phrasing).
 *
 * False-positive guard: only match the digits when they're directly
 * adjacent to the unit word — "86+ tools" matches, "free tier covers
 * 100 deploys" doesn't.
 */
function scanFile(
  path: string,
  expectedTools: number,
  expectedConnectors: number,
  perConnectorCounts: Set<number>
): Drift[] {
  const drifts: Drift[] = [];
  let body: string;
  try {
    body = readFileSync(path, "utf-8");
  } catch {
    return drifts;
  }
  const lines = body.split("\n");
  // word-boundary, optional "+" suffix, the unit word; case-insensitive.
  const toolsRe = /\b(\d{1,4})(\+?)\s+tools?\b/gi;
  const connRe = /\b(\d{1,3})\s+connectors?\b/gi;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    toolsRe.lastIndex = 0;
    while ((m = toolsRe.exec(line)) !== null) {
      const claimed = parseInt(m[1], 10);
      const plus = m[2] === "+";
      // Per-connector mentions ("18 tools" inside the Google section) are
      // legitimate. Only flag drift on the global hero-style claim. Heuristic:
      // a number that matches a per-connector count is allowed.
      if (perConnectorCounts.has(claimed)) continue;
      const ok = plus ? claimed <= expectedTools : claimed === expectedTools;
      if (!ok) {
        drifts.push({
          file: path,
          line: i + 1,
          text: m[0],
          claimed,
          expected: expectedTools,
          unit: "tools",
        });
      }
    }
    connRe.lastIndex = 0;
    while ((m = connRe.exec(line)) !== null) {
      const claimed = parseInt(m[1], 10);
      if (claimed !== expectedConnectors) {
        drifts.push({
          file: path,
          line: i + 1,
          text: m[0],
          claimed,
          expected: expectedConnectors,
          unit: "connectors",
        });
      }
    }
  }
  return drifts;
}

function main() {
  const perConnector = countToolsPerConnector();
  const expectedTools = Array.from(perConnector.values()).reduce((a, b) => a + b, 0);
  const expectedConnectors = perConnector.size;
  const perConnectorSet = new Set(perConnector.values());

  console.log(
    `[check-doc-counts] registry truth: ${expectedTools} tools across ${expectedConnectors} connectors`
  );

  const filesToCheck: string[] = [README_PATH];
  for (const f of readdirSync(DOCS_DIR)) {
    if (f.endsWith(".md")) filesToCheck.push(join(DOCS_DIR, f));
  }

  const drifts: Drift[] = [];
  for (const f of filesToCheck) {
    drifts.push(...scanFile(f, expectedTools, expectedConnectors, perConnectorSet));
  }

  if (drifts.length === 0) {
    console.log("[check-doc-counts] OK — no drift");
    return;
  }

  console.error(`[check-doc-counts] ${drifts.length} drift(s):`);
  for (const d of drifts) {
    const rel = d.file.replace(ROOT, "").replace(/\\/g, "/").replace(/^\//, "");
    console.error(`  ${rel}:${d.line}  claims "${d.text}" — expected ${d.expected} ${d.unit}`);
  }
  process.exit(1);
}

main();

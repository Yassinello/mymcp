/**
 * Contract test (OBS-03): every `try/catch` block in scope files must
 * either (a) rethrow, (b) return, (c) call a logger, or (d) carry a
 * `// silent-swallow-ok: <reason>` annotation on the same line or the
 * previous line.
 *
 * Closes .planning/milestones/v0.10-durability-ROADMAP.md Phase 38 OBS-03.
 *
 * Scope files (scanned by glob):
 *   - src/core/first-run.ts
 *   - src/core/first-run-edge.ts
 *   - src/core/kv-store.ts
 *   - app/api/welcome/**\/route.ts
 *
 * Rationale: the 2026-04-20 debugging session had multiple bugs caused
 * by silently-swallowed exceptions in the bootstrap / KV layer (e.g.
 * a malformed /tmp payload silently treated as missing, leading to
 * "bootstrap should be re-hydrating but isn't" on cold starts). This
 * contract test surfaces those sites and forces either a log or an
 * explicit annotation, going forward.
 *
 * The test matches the precedent set by tests/contract/fire-and-forget.test.ts
 * and tests/contract/route-rehydrate-coverage.test.ts (Phase 37).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const PROJECT_ROOT = join(__dirname, "..", "..");

const SCAN_TARGETS = [
  "src/core/first-run.ts",
  "src/core/first-run-edge.ts",
  "src/core/kv-store.ts",
];

function discoverWelcomeRoutes(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (st.isFile() && entry === "route.ts") out.push(full);
    }
  }
  walk(join(root, "app", "api", "welcome"));
  return out;
}

const MARKER = "silent-swallow-ok";

/**
 * Matches a try/catch block's contents. Handles:
 *   catch { ... }
 *   catch (e) { ... }
 *   catch (e: unknown) { ... }
 *
 * Uses a non-greedy match on the body and a depth counter for nested
 * braces so we can handle `catch (e) { if (...) { ... } }` without
 * bailing at the inner close brace.
 */
function findCatchBlocks(source: string): Array<{ start: number; body: string }> {
  const out: Array<{ start: number; body: string }> = [];
  const re = /catch\s*(?:\(\s*[\w: ]*\s*\))?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (depth === 0) break;
      i++;
    }
    if (depth === 0) {
      out.push({ start: m.index, body: source.slice(bodyStart, i) });
    }
  }
  return out;
}

function isSilentSwallow(body: string, neighborhood: string): boolean {
  // Any identifier ending in `Log`/`Logger` (e.g. firstRunLog, kvLogger) or
  // the raw `console` / `logger` / `getLogger(...)` patterns count as
  // logged. The convention is "*Log" — narrower than a pure method match,
  // tight enough that `foo.warn(x)` alone doesn't accidentally whitelist.
  if (/\b(?:console|logger|getLogger|\w+Log(?:ger)?)\s*\.(info|warn|error|debug|log)/.test(body))
    return false;
  // Throw — rethrown
  if (/\bthrow\b/.test(body)) return false;
  // Return — caller handles
  if (/\breturn\b/.test(body)) return false;
  // Explicit annotation on the line above OR inside the block
  if (neighborhood.includes(MARKER)) return false;
  // Empty body — trivially silent (still requires annotation)
  const trimmed = body.replace(/\s+/g, "").replace(/\/\/.*?(?=$|\n)/g, "");
  if (trimmed === "") return true;
  return true;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

describe("no-silent-swallows contract (OBS-03)", () => {
  it("every try/catch in scope files logs, rethrows, returns, or is annotated", () => {
    const files = [
      ...SCAN_TARGETS.map((p) => join(PROJECT_ROOT, p)),
      ...discoverWelcomeRoutes(PROJECT_ROOT),
    ];

    const violations: { file: string; line: number; snippet: string }[] = [];

    for (const abs of files) {
      const src = readFileSync(abs, "utf-8");
      const blocks = findCatchBlocks(src);
      for (const blk of blocks) {
        const line = lineOf(src, blk.start);
        // Walk backward to find the matching `try` keyword, then grab
        // the line immediately above it. That's where our annotation
        // convention places `// silent-swallow-ok: <reason>`. Also
        // include the catch body (for inline annotations) and the two
        // lines immediately above the catch.
        const tryKeywordIdx = src.lastIndexOf("try", blk.start);
        const aboveTry =
          tryKeywordIdx > 0 ? src.slice(Math.max(0, tryKeywordIdx - 400), tryKeywordIdx) : "";
        const aboveCatch = src.slice(Math.max(0, blk.start - 200), blk.start);
        const neighborhood = aboveTry + aboveCatch + blk.body;
        if (isSilentSwallow(blk.body, neighborhood)) {
          const rel = relative(PROJECT_ROOT, abs).split(sep).join("/");
          violations.push({
            file: rel,
            line,
            snippet: blk.body.slice(0, 120).replace(/\s+/g, " ").trim(),
          });
        }
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.file}:${v.line}\n    catch { ${v.snippet} }`)
        .join("\n");
      throw new Error(
        `Silent try/catch swallow(s) detected (OBS-03):\n\n` +
          summary +
          `\n\nFix: either (a) call a logger (getLogger("TAG").warn/error), ` +
          `(b) rethrow, (c) return something, or (d) add the annotation ` +
          `\`// ${MARKER}: <reason>\` on the same line or immediately above.`
      );
    }

    expect(violations).toEqual([]);
  });
});

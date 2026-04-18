/**
 * Spec test for the .husky/pre-commit env-file guard regex.
 *
 * The hook itself is a shell script that uses `grep -E` with two regexes:
 *   - block:   (^|/)\.env(\.|$)
 *   - allow:   (^|/)\.env\.example(\.|$)
 *
 * This test re-implements the spec in JS regex form and asserts against
 * a fixed table of cases. If you change the hook regex, mirror the change
 * here. If a case below regresses, the hook regex has drifted from spec.
 *
 * Why a JS test instead of a shell test: avoids bash availability
 * differences across CI runners and Windows dev machines. The behavior
 * being tested is regex semantics, not shell plumbing.
 */
import { describe, it, expect } from "vitest";

const BLOCK = /(^|\/)\.env(\.|$)/;
const ALLOW = /(^|\/)\.env\.example(\.|$)/;

function shouldBlock(path: string): boolean {
  return BLOCK.test(path) && !ALLOW.test(path);
}

describe("pre-commit env-file guard", () => {
  describe("blocks secret env files", () => {
    const cases = [
      ".env",
      ".env.local",
      ".env.vercel",
      ".env.production",
      ".env.staging",
      ".env.development",
      ".env.test",
      "subdir/.env",
      "packages/foo/.env.local",
      "deeply/nested/path/.env.production",
    ];
    for (const path of cases) {
      it(`blocks ${path}`, () => {
        expect(shouldBlock(path)).toBe(true);
      });
    }
  });

  describe("allows .env.example variants", () => {
    const cases = [
      ".env.example",
      ".env.example.local",
      ".env.example.regression",
      "subdir/.env.example",
      "packages/foo/.env.example.template",
    ];
    for (const path of cases) {
      it(`allows ${path}`, () => {
        expect(shouldBlock(path)).toBe(false);
      });
    }
  });

  describe("ignores files that are not env files", () => {
    const cases = [
      "myenv.txt",
      "notenv.md",
      "config/myenv.json",
      ".envrc",
      "src/env.ts",
      "package.json",
      "README.md",
      "src/connectors/google/manifest.ts",
    ];
    for (const path of cases) {
      it(`ignores ${path}`, () => {
        expect(shouldBlock(path)).toBe(false);
      });
    }
  });
});

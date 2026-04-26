/**
 * Phase 062 STAB-03 — Live GitHub Compare API integration test.
 *
 * Exercises the github-api update path against the REAL GitHub REST API
 * to validate semantics that mocked unit tests can't catch:
 *   1. Compare URL direction (BASE=upstream, HEAD=fork) returns
 *      status: "behind" + behind_by > 0 when the fork is N commits
 *      behind upstream (D-01, D-02).
 *   2. Compare URL with same direction returns ahead_by > 0 when the
 *      fork has local commits not in upstream (diverged scenario).
 *   3. Compare URL returns status: "identical" when the fork is in
 *      sync.
 *
 * ── ENV-GATED ─────────────────────────────────────────────────────
 * Skipped automatically in CI when GITHUB_TEST_TOKEN and
 * GITHUB_TEST_FORK_OWNER are not set. Contributors without the
 * fixture should NOT see CI failures (D-10).
 *
 * To run locally:
 *   GITHUB_TEST_TOKEN=ghp_xxx \
 *   GITHUB_TEST_FORK_OWNER=your-username \
 *   GITHUB_TEST_FORK_BEHIND=kebab-mcp-test-behind \
 *   GITHUB_TEST_FORK_AHEAD=kebab-mcp-test-ahead \
 *   GITHUB_TEST_FORK_IDENTICAL=kebab-mcp-test-identical \
 *   npx vitest run tests/integration/config-update-github-live.test.ts
 *
 * ── FIXTURE SETUP ─────────────────────────────────────────────────
 * Maintain three fork repos under your account (or one configurable
 * fork at a known commit offset — see GITHUB_TEST_FORK_AHEAD note):
 *
 *   1. GITHUB_TEST_FORK_BEHIND — fork of Yassinello/kebab-mcp at a
 *      commit older than the current main (e.g., reset to a tag from
 *      v0.10). GitHub Compare with BASE=upstream:main HEAD=fork:main
 *      MUST return status="behind" + behind_by > 0.
 *
 *   2. GITHUB_TEST_FORK_AHEAD — fork with one local commit on top of
 *      upstream main (a no-op edit to README.md is enough). MUST
 *      return ahead_by >= 1. If the fork is also behind, returns
 *      "diverged"; otherwise "ahead".
 *
 *   3. GITHUB_TEST_FORK_IDENTICAL (optional) — fork that exactly
 *      mirrors upstream main. MUST return status="identical".
 *      If unset, the identical case is skipped — non-fatal.
 *
 * Re-create offsets:
 *   git remote add upstream https://github.com/Yassinello/kebab-mcp.git
 *   git fetch upstream
 *   git reset --hard <known-offset-sha>     # for BEHIND fork
 *   git push --force origin main
 */
import { describe, it, expect } from "vitest";
import { UPSTREAM_OWNER, UPSTREAM_REPO_SLUG } from "../../app/landing/deploy-url";

const FIXTURE_TOKEN = process.env.GITHUB_TEST_TOKEN;
const FIXTURE_OWNER = process.env.GITHUB_TEST_FORK_OWNER;
const FORK_BEHIND = process.env.GITHUB_TEST_FORK_BEHIND;
const FORK_AHEAD = process.env.GITHUB_TEST_FORK_AHEAD;
const FORK_IDENTICAL = process.env.GITHUB_TEST_FORK_IDENTICAL;

const ENABLED = Boolean(FIXTURE_TOKEN && FIXTURE_OWNER && FORK_BEHIND && FORK_AHEAD);

const upstream = `${UPSTREAM_OWNER}:${UPSTREAM_REPO_SLUG}:main`;

async function compare(repoSlug: string): Promise<{
  status: "ahead" | "behind" | "diverged" | "identical";
  ahead_by: number;
  behind_by: number;
}> {
  // Corrected direction (Phase 62-01): BASE=upstream, HEAD=fork
  const url = `https://api.github.com/repos/${FIXTURE_OWNER}/${repoSlug}/compare/${upstream}...main`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${FIXTURE_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub /compare ${repoSlug} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as {
    status: "ahead" | "behind" | "diverged" | "identical";
    ahead_by: number;
    behind_by: number;
  };
}

describe.skipIf(!ENABLED)("STAB-03 live GitHub Compare semantics", () => {
  it("BEHIND fork → status='behind' + behind_by > 0 (corrected direction works)", async () => {
    const cmp = await compare(FORK_BEHIND!);
    expect(cmp.status).toBe("behind");
    expect(cmp.behind_by).toBeGreaterThan(0);
    expect(cmp.ahead_by).toBe(0);
  }, 15_000);

  it("AHEAD/DIVERGED fork → ahead_by > 0 (UI must block update button)", async () => {
    const cmp = await compare(FORK_AHEAD!);
    expect(cmp.ahead_by).toBeGreaterThan(0);
    // Either "ahead" (only local commits) or "diverged" (local + upstream commits)
    expect(["ahead", "diverged"]).toContain(cmp.status);
  }, 15_000);

  it.skipIf(!FORK_IDENTICAL)(
    "IDENTICAL fork → status='identical' + behind_by=0 + ahead_by=0",
    async () => {
      const cmp = await compare(FORK_IDENTICAL!);
      expect(cmp.status).toBe("identical");
      expect(cmp.behind_by).toBe(0);
      expect(cmp.ahead_by).toBe(0);
    },
    15_000
  );
});

// Negative control — always runs, asserts the env-gating itself works
describe("STAB-03 env-gating sanity", () => {
  it("describe.skipIf flag is computed correctly from env presence", () => {
    // This test MUST pass in CI without fixture vars set
    if (!FIXTURE_TOKEN || !FIXTURE_OWNER || !FORK_BEHIND || !FORK_AHEAD) {
      expect(ENABLED).toBe(false);
    } else {
      expect(ENABLED).toBe(true);
    }
  });
});

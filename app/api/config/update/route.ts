import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import {
  composeRequestPipeline,
  rehydrateStep,
  authStep,
  hydrateCredentialsStep,
} from "@/core/pipeline";
import { errorResponse } from "@/core/error-response";
import { getConfig } from "@/core/config-facade";
import { getCredential } from "@/core/request-context";
import { UPSTREAM_OWNER, UPSTREAM_REPO_SLUG } from "../../../landing/deploy-url";

/**
 * GET  /api/config/update → check if updates are available
 * POST /api/config/update → apply updates
 *
 * Three modes:
 *   "git"        — local dev / Docker: uses git CLI (existing path, unchanged)
 *   "github-api" — Vercel fork with VERCEL_GIT_REPO_OWNER + VERCEL_GIT_REPO_SLUG: uses GitHub REST API
 *   "disabled"   — Vercel without owner/slug, or KEBAB_DISABLE_UPDATE_API=1
 */

/**
 * Pipeline composition note (Phase 62, STAB-02):
 *   This route uses an EXPLICIT pipeline rather than the `withAdminAuth`
 *   HOC because it reads `KEBAB_UPDATE_PAT` / `GITHUB_TOKEN` via
 *   `getCredential()`. `withAdminAuth` does NOT include
 *   `hydrateCredentialsStep`, so a PAT saved via /api/config/env
 *   (which writes to `cred:*` KV) would be invisible here. We add
 *   `hydrateCredentialsStep` per-route — extending `withAdminAuth`
 *   itself was rejected (D-08): adds KV-read latency to 30+ admin
 *   routes that don't need credentials. Per-route opt-in is cleaner.
 *   See .planning/phases/062-stabilize-phase-61/062-CONTEXT.md.
 */

// ── Mode resolution ────────────────────────────────────────────────────

type UpdateMode = "git" | "github-api" | "disabled";

function resolveMode(): UpdateMode {
  if (getConfig("KEBAB_DISABLE_UPDATE_API") === "1") return "disabled";
  if (getConfig("VERCEL") === "1") {
    const owner = getConfig("VERCEL_GIT_REPO_OWNER");
    const slug = getConfig("VERCEL_GIT_REPO_SLUG");
    return owner && slug ? "github-api" : "disabled";
  }
  return "git";
}

// ── git-CLI helpers (existing path — zero changes) ─────────────────────

function run(cmd: string): { ok: boolean; out: string; err: string } {
  try {
    const out = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
    }).trim();
    return { ok: true, out, err: "" };
  } catch (err) {
    const e = err as { message?: string; stderr?: Buffer | string };
    const stderr = e.stderr ? e.stderr.toString().trim() : "";
    return { ok: false, out: "", err: stderr || e.message || String(err) };
  }
}

function resolveRemote(): { ok: true; remote: string } | { ok: false; error: string } {
  const inside = run("git rev-parse --is-inside-work-tree");
  if (!inside.ok || inside.out !== "true") {
    return { ok: false, error: "Not a git work tree." };
  }
  const remotes = run("git remote");
  if (!remotes.ok) return { ok: false, error: "git remote failed." };
  const list = remotes.out.split(/\s+/).filter(Boolean);
  if (list.includes("upstream")) return { ok: true, remote: "upstream" };
  if (list.includes("origin")) return { ok: true, remote: "origin" };
  return { ok: false, error: "No upstream or origin remote configured." };
}

// ── GitHub API fetch helper ────────────────────────────────────────────

const GH_API_VERSION = "2022-11-28";
const GH_ACCEPT = "application/vnd.github+json";

interface GitHubFetchResult {
  ok: boolean;
  status: number;
  data: unknown;
  scopesHeader: string | null;
}

async function ghFetch(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<GitHubFetchResult> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: GH_ACCEPT,
      "X-GitHub-Api-Version": GH_API_VERSION,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, data, scopesHeader: res.headers.get("x-oauth-scopes") };
}

// ── Breaking-change detection ──────────────────────────────────────────

function detectBreaking(commits: Array<{ commit: { message: string } }>): {
  breaking: boolean;
  breakingReasons: string[];
} {
  const reasons: string[] = [];
  const CONV_BANG = /^(?:feat|fix|refactor|perf|chore|docs|style|test|build|ci)!:/m;
  const BREAK_FOOTER = /BREAKING CHANGE:/m;
  for (const c of commits) {
    const msg = c.commit.message;
    if (CONV_BANG.test(msg)) reasons.push(msg.split("\n")[0]!.slice(0, 80));
    else if (BREAK_FOOTER.test(msg)) reasons.push(msg.split("\n")[0]!.slice(0, 80));
  }
  return { breaking: reasons.length > 0, breakingReasons: reasons };
}

// ── GitHub API GET handler ─────────────────────────────────────────────

async function githubApiGetHandler(): Promise<Response> {
  const owner = getConfig("VERCEL_GIT_REPO_OWNER")!;
  const slug = getConfig("VERCEL_GIT_REPO_SLUG")!;
  const upstream = `${UPSTREAM_OWNER}:${UPSTREAM_REPO_SLUG}:main`;

  // Token resolution: dedicated PAT first, fallback GITHUB_TOKEN
  const token =
    (getCredential("KEBAB_UPDATE_PAT") ?? getConfig("KEBAB_UPDATE_PAT")) ||
    (getCredential("GITHUB_TOKEN") ?? getConfig("GITHUB_TOKEN")) ||
    null;

  if (!token) {
    return NextResponse.json({
      mode: "github-api",
      available: false,
      reason: "no-token",
      configureUrl: "/config?tab=settings&sub=advanced",
      tokenConfigured: false,
    });
  }

  // Fetch fork visibility
  const repoRes = await ghFetch(`/repos/${owner}/${slug}`, token);
  if (!repoRes.ok) {
    if (repoRes.status === 401 || repoRes.status === 403) {
      return NextResponse.json({
        mode: "github-api",
        available: false,
        reason: "auth",
        tokenConfigured: true,
      });
    }
    return errorResponse(new Error(`GitHub /repos lookup failed: ${repoRes.status}`), {
      status: 502,
      route: "config/update",
    });
  }
  const repoData = repoRes.data as { private: boolean };
  const forkPrivate = repoData.private ?? false;

  // Compare fork HEAD with upstream
  // BASE=upstream, HEAD=fork → response describes fork's position relative to upstream
  // (status: "behind" + behind_by:N means fork is N commits behind upstream → updates available)
  const compareRes = await ghFetch(`/repos/${owner}/${slug}/compare/${upstream}...main`, token);
  if (!compareRes.ok) {
    return errorResponse(new Error(`GitHub compare failed: ${compareRes.status}`), {
      status: 502,
      route: "config/update",
    });
  }

  const cmp = compareRes.data as {
    status: "ahead" | "behind" | "diverged" | "identical";
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    commits: Array<{ sha: string; html_url: string; commit: { message: string } }>;
    html_url: string;
  };

  const { breaking, breakingReasons } = detectBreaking(cmp.commits);
  const displayCommits = [...cmp.commits]
    .reverse()
    .slice(0, 5)
    .map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0]!.slice(0, 80),
      url: c.html_url,
    }));

  return NextResponse.json({
    mode: "github-api",
    available: cmp.status === "behind",
    behind_by: cmp.behind_by,
    ahead_by: cmp.ahead_by,
    status: cmp.status,
    breaking,
    breakingReasons,
    commits: displayCommits,
    totalCommits: cmp.total_commits,
    diffUrl: cmp.html_url,
    tokenConfigured: true,
    forkPrivate,
  });
}

// ── GitHub API POST handler ────────────────────────────────────────────

async function githubApiPostHandler(): Promise<Response> {
  const owner = getConfig("VERCEL_GIT_REPO_OWNER")!;
  const slug = getConfig("VERCEL_GIT_REPO_SLUG")!;

  const token =
    (getCredential("KEBAB_UPDATE_PAT") ?? getConfig("KEBAB_UPDATE_PAT")) ||
    (getCredential("GITHUB_TOKEN") ?? getConfig("GITHUB_TOKEN")) ||
    null;

  if (!token) {
    return NextResponse.json({ ok: false, reason: "no-token" }, { status: 400 });
  }

  // Server-side guard: re-check ahead_by before merge (D-04)
  // BASE=upstream, HEAD=fork → ahead_by>0 means fork has local commits → block merge
  const upstream = `${UPSTREAM_OWNER}:${UPSTREAM_REPO_SLUG}:main`;
  const compareRes = await ghFetch(`/repos/${owner}/${slug}/compare/${upstream}...main`, token);
  if (!compareRes.ok) {
    return errorResponse(new Error(`Pre-merge compare failed: ${compareRes.status}`), {
      status: 502,
      route: "config/update",
    });
  }
  const cmp = compareRes.data as { ahead_by: number; behind_by: number; html_url: string };
  if (cmp.ahead_by > 0) {
    return NextResponse.json(
      {
        ok: false,
        reason: "diverged",
        resolveUrl: `https://github.com/${owner}/${slug}/compare/main...${UPSTREAM_OWNER}:${UPSTREAM_REPO_SLUG}:main`,
      },
      { status: 409 }
    );
  }
  if (cmp.behind_by === 0) {
    return NextResponse.json({ ok: true, pulled: 0, reason: "Already up to date." });
  }

  // Perform merge-upstream
  const mergeRes = await ghFetch(`/repos/${owner}/${slug}/merge-upstream`, token, {
    method: "POST",
    body: { branch: "main" },
  });

  if (mergeRes.status === 409) {
    const ghMsg = (mergeRes.data as { message?: string })?.message ?? "Conflict";
    return NextResponse.json(
      {
        ok: false,
        reason: "conflict",
        message: ghMsg,
        resolveUrl: `https://github.com/${owner}/${slug}/compare/main...${UPSTREAM_OWNER}:${UPSTREAM_REPO_SLUG}:main`,
      },
      { status: 409 }
    );
  }
  if (mergeRes.status === 401 || mergeRes.status === 403) {
    const ghMsg = (mergeRes.data as { message?: string })?.message ?? "Auth error";
    return NextResponse.json({ ok: false, reason: "auth", message: ghMsg }, { status: 403 });
  }
  if (mergeRes.status === 422) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not-a-fork",
        message: "Repository may not be a GitHub fork. Use the GitHub UI to sync manually.",
      },
      { status: 422 }
    );
  }
  if (!mergeRes.ok) {
    return errorResponse(new Error(`merge-upstream failed: ${mergeRes.status}`), {
      status: 502,
      route: "config/update",
    });
  }

  const mergeData = mergeRes.data as { merge_type?: string };
  const deployUrl = `https://vercel.com/${owner}/${slug}/deployments`;

  return NextResponse.json({
    ok: true,
    pulled: cmp.behind_by,
    merge_type: mergeData.merge_type ?? "fast-forward",
    deployUrl,
  });
}

// ── GET handler ────────────────────────────────────────────────────────

async function getHandler() {
  const mode = resolveMode();
  if (mode === "disabled") {
    return NextResponse.json({
      available: false,
      behind: 0,
      remote: "",
      disabled: "Updates disabled.",
    });
  }
  if (mode === "github-api") {
    return githubApiGetHandler();
  }

  // ── git-CLI path (non-Vercel) — unchanged ─────────────────────────

  const remoteRes = resolveRemote();
  if (!remoteRes.ok) {
    return NextResponse.json({
      available: false,
      behind: 0,
      remote: "",
      disabled: remoteRes.error,
    });
  }
  const { remote } = remoteRes;

  const fetch = run(`git fetch ${remote} main --quiet`);
  if (!fetch.ok) {
    return NextResponse.json({
      available: false,
      behind: 0,
      remote,
      disabled: `git fetch ${remote} failed: ${fetch.err.split("\n")[0]}`,
    });
  }

  const behind = run(`git rev-list --count HEAD..${remote}/main`);
  const ahead = run(`git rev-list --count ${remote}/main..HEAD`);
  const latest = run(`git rev-parse ${remote}/main`);

  const behindCount = behind.ok ? Number(behind.out) : 0;
  const aheadCount = ahead.ok ? Number(ahead.out) : 0;

  return NextResponse.json({
    available: behindCount > 0,
    behind: behindCount,
    ahead: aheadCount,
    remote,
    latest: latest.ok ? latest.out.slice(0, 7) : null,
  });
}

// ── POST handler ───────────────────────────────────────────────────────

async function postHandler() {
  const mode = resolveMode();
  if (mode === "disabled")
    return NextResponse.json({ ok: false, reason: "Updates disabled." }, { status: 403 });
  if (mode === "github-api") return githubApiPostHandler();

  // ── git-CLI path (non-Vercel) — unchanged ─────────────────────────

  const remoteRes = resolveRemote();
  if (!remoteRes.ok) {
    return NextResponse.json({ ok: false, reason: remoteRes.error }, { status: 400 });
  }
  const { remote } = remoteRes;

  // Refuse if local has uncommitted changes or diverged commits
  const status = run("git status --porcelain");
  if (status.ok && status.out.length > 0) {
    return NextResponse.json(
      { ok: false, reason: "Uncommitted local changes — commit or stash first." },
      { status: 409 }
    );
  }

  const fetch = run(`git fetch ${remote} main --quiet`);
  if (!fetch.ok) {
    return NextResponse.json(
      { ok: false, reason: `git fetch failed: ${fetch.err.split("\n")[0]}` },
      { status: 502 }
    );
  }

  const ahead = run(`git rev-list --count ${remote}/main..HEAD`);
  if (ahead.ok && Number(ahead.out) > 0) {
    return NextResponse.json(
      {
        ok: false,
        reason: `${ahead.out} local commits ahead of ${remote}/main — resolve manually with 'git merge ${remote}/main'.`,
      },
      { status: 409 }
    );
  }

  const behind = run(`git rev-list --count HEAD..${remote}/main`);
  const pulled = behind.ok ? Number(behind.out) : 0;

  if (pulled === 0) {
    return NextResponse.json({ ok: true, pulled: 0, reason: "Already up to date." });
  }

  const merge = run(`git merge --ff-only ${remote}/main`);
  if (!merge.ok) {
    // P1 fold-in: wrap the git-shell error in the canonical 500 shape.
    // Server log retains the full (sanitized) merge.err for correlation;
    // the client sees only `{ error, errorId, hint }`.
    return errorResponse(new Error(`Merge failed: ${merge.err}`), {
      status: 500,
      route: "config/update",
    });
  }

  return NextResponse.json({
    ok: true,
    pulled,
    remote,
    note: "Merged. Restart the dev server to load new code (Next.js auto-reloads most changes).",
  });
}

export const GET = composeRequestPipeline(
  [rehydrateStep, authStep("admin"), hydrateCredentialsStep],
  getHandler
);
export const POST = composeRequestPipeline(
  [rehydrateStep, authStep("admin"), hydrateCredentialsStep],
  postHandler
);

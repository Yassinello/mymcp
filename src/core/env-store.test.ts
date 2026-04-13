import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseEnvFile,
  serializeEnv,
  isVercelAutoMagicAvailable,
  triggerVercelRedeploy,
} from "./env-store";

describe("parseEnvFile", () => {
  it("parses simple KEY=value pairs", () => {
    const { vars } = parseEnvFile("FOO=bar\nBAZ=qux\n");
    expect(vars).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("strips double-quoted values", () => {
    const { vars } = parseEnvFile(`FOO="hello world"\n`);
    expect(vars.FOO).toBe("hello world");
  });

  it("strips single-quoted values", () => {
    const { vars } = parseEnvFile(`FOO='hello'\n`);
    expect(vars.FOO).toBe("hello");
  });

  it("ignores comments and blank lines", () => {
    const { vars } = parseEnvFile("# a comment\n\nFOO=bar\n# another\nBAZ=qux\n");
    expect(vars).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("returns rawLines preserving original order", () => {
    const content = "# header\nFOO=1\nBAR=2\n";
    const { rawLines } = parseEnvFile(content);
    expect(rawLines).toEqual(["# header", "FOO=1", "BAR=2", ""]);
  });

  it("handles CRLF line endings", () => {
    const { vars } = parseEnvFile("FOO=bar\r\nBAZ=qux\r\n");
    expect(vars).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ignores lines without KEY=VAL shape", () => {
    const { vars } = parseEnvFile("not a var\nFOO=bar\n");
    expect(vars).toEqual({ FOO: "bar" });
  });
});

describe("serializeEnv", () => {
  it("updates an existing var in place", () => {
    const { rawLines } = parseEnvFile("FOO=old\nBAR=keep\n");
    const out = serializeEnv(rawLines, { FOO: "new" });
    expect(out).toContain("FOO=new");
    expect(out).toContain("BAR=keep");
    expect(out).not.toContain("FOO=old");
  });

  it("appends a new var at the end", () => {
    const { rawLines } = parseEnvFile("FOO=bar\n");
    const out = serializeEnv(rawLines, { NEW: "value" });
    const idx = out.indexOf("FOO=bar");
    const newIdx = out.indexOf("NEW=value");
    expect(newIdx).toBeGreaterThan(idx);
  });

  it("preserves comments across updates", () => {
    const { rawLines } = parseEnvFile("# important comment\nFOO=old\n");
    const out = serializeEnv(rawLines, { FOO: "new" });
    expect(out).toContain("# important comment");
    expect(out).toContain("FOO=new");
  });

  it("preserves blank lines", () => {
    const { rawLines } = parseEnvFile("FOO=bar\n\nBAZ=qux\n");
    const out = serializeEnv(rawLines, { FOO: "updated" });
    expect(out).toMatch(/FOO=updated\n\nBAZ=qux/);
  });

  it("roundtrip: parse → serialize → parse yields same vars", () => {
    const original = "# header\nFOO=bar\nBAZ=qux\n";
    const parsed = parseEnvFile(original);
    const rewritten = serializeEnv(parsed.rawLines, {});
    const reparsed = parseEnvFile(rewritten);
    expect(reparsed.vars).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ensures trailing newline", () => {
    const { rawLines } = parseEnvFile("FOO=bar");
    const out = serializeEnv(rawLines, {});
    expect(out.endsWith("\n")).toBe(true);
  });

  it("adds both new and updates existing in one call", () => {
    const { rawLines } = parseEnvFile("OLD=1\n");
    const out = serializeEnv(rawLines, { OLD: "2", NEW: "3" });
    expect(out).toContain("OLD=2");
    expect(out).toContain("NEW=3");
  });
});

describe("isVercelAutoMagicAvailable", () => {
  const origToken = process.env.VERCEL_TOKEN;
  const origProj = process.env.VERCEL_PROJECT_ID;

  afterEach(() => {
    process.env.VERCEL_TOKEN = origToken;
    process.env.VERCEL_PROJECT_ID = origProj;
  });

  it("returns false when token missing", () => {
    delete process.env.VERCEL_TOKEN;
    process.env.VERCEL_PROJECT_ID = "proj";
    expect(isVercelAutoMagicAvailable()).toBe(false);
  });

  it("returns false when projectId missing", () => {
    process.env.VERCEL_TOKEN = "tkn";
    delete process.env.VERCEL_PROJECT_ID;
    expect(isVercelAutoMagicAvailable()).toBe(false);
  });

  it("returns true when both present", () => {
    process.env.VERCEL_TOKEN = "tkn";
    process.env.VERCEL_PROJECT_ID = "proj";
    expect(isVercelAutoMagicAvailable()).toBe(true);
  });
});

describe("triggerVercelRedeploy", () => {
  const origToken = process.env.VERCEL_TOKEN;
  const origProj = process.env.VERCEL_PROJECT_ID;
  const origTeam = process.env.VERCEL_TEAM_ID;
  const origFetch = global.fetch;

  beforeEach(() => {
    process.env.VERCEL_TOKEN = "secret-tkn-xyz";
    process.env.VERCEL_PROJECT_ID = "proj_123";
    delete process.env.VERCEL_TEAM_ID;
  });

  afterEach(() => {
    process.env.VERCEL_TOKEN = origToken;
    process.env.VERCEL_PROJECT_ID = origProj;
    process.env.VERCEL_TEAM_ID = origTeam;
    global.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("returns error when env not set", async () => {
    delete process.env.VERCEL_TOKEN;
    const out = await triggerVercelRedeploy();
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/VERCEL_TOKEN/);
  });

  it("returns ok with deploymentId on happy path", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/v6/deployments")) {
        return new Response(
          JSON.stringify({
            deployments: [
              {
                uid: "dpl_old",
                name: "my-mcp",
                meta: { githubCommitRef: "main" },
                gitSource: { type: "github", repoId: 12345, ref: "main" },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v13/deployments")) {
        return new Response(JSON.stringify({ id: "dpl_new" }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const out = await triggerVercelRedeploy();
    expect(out.ok).toBe(true);
    expect(out.deploymentId).toBe("dpl_new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("strips the Vercel token from upstream errors", async () => {
    global.fetch = (async () =>
      new Response("error containing secret-tkn-xyz oops", {
        status: 500,
      })) as unknown as typeof fetch;
    const out = await triggerVercelRedeploy();
    expect(out.ok).toBe(false);
    expect(out.error).toBeDefined();
    expect(out.error).not.toContain("secret-tkn-xyz");
    expect(out.error).toContain("<redacted>");
  });

  it("returns error when no prior production deployment exists", async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ deployments: [] }), {
        status: 200,
      })) as unknown as typeof fetch;
    const out = await triggerVercelRedeploy();
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/No prior production deployment/);
  });

  it("returns error when latest deployment lacks gitSource", async () => {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          deployments: [{ uid: "dpl_x", name: "my-mcp" }],
        }),
        { status: 200 }
      )) as unknown as typeof fetch;
    const out = await triggerVercelRedeploy();
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/gitSource/);
  });

  it("never throws — wraps thrown fetch errors", async () => {
    global.fetch = (async () => {
      throw new Error("boom secret-tkn-xyz");
    }) as unknown as typeof fetch;
    const out = await triggerVercelRedeploy();
    expect(out.ok).toBe(false);
    expect(out.error).not.toContain("secret-tkn-xyz");
  });
});

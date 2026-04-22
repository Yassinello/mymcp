/**
 * Phase 44 SCM-02 (suite introduced) / Phase 51 LANG-02 (matrix expanded).
 *
 * Regression suite for the 4 Stagehand-driven browser tools across all
 * KEBAB_BROWSER_CONNECTOR_V2 flag states.
 *
 * Test matrix: 4 tools × 3 flag states × 2 scenarios (happy path + SSRF guard)
 *   = 24 cases.
 *
 * Flag states (updated Phase 51):
 *   - flag unset  → v3 (new default after Phase 51)
 *   - flag = "0"  → v2 (explicit opt-out, rollback window)
 *   - flag = "1"  → v3 (explicit set — equivalent to unset, kept for defense in depth)
 *
 * Stagehand + Browserbase SDK are mocked — no real API calls. The mocks
 * mirror the v3.2.x surface: Stagehand class with init/close, stagehand.act,
 * stagehand.extract, stagehand.context.pages() returning Playwright-like
 * Pages with goto/title/url/evaluate. Assertions verify that:
 *   1. The right Stagehand method is invoked (goto for browse, extract for
 *      extract + linkedin_feed, act for act).
 *   2. The URL passed to page.goto is validated through src/core/url-safety
 *      BEFORE the session is created (SSRF guard rejection short-circuits).
 *   3. Both V2 and V3 dispatches produce structurally equivalent output
 *      today. When V3 diverges from V2 in a future phase, these tests
 *      document the contract for that divergence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Shared fake Stagehand scaffolding --------------------------------------

type GotoOpts = { waitUntil?: string; timeoutMs?: number };
type ActArg = string;
type ExtractArg = string;

/** Fake Page (the object stagehand.context.pages()[0] returns). */
interface FakePage {
  goto: ReturnType<typeof vi.fn>;
  title: ReturnType<typeof vi.fn>;
  url: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
}

/** Fake Stagehand class. Captures constructor args + method calls for assertions. */
interface FakeStagehandInstance {
  init: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  act: ReturnType<typeof vi.fn<(arg: ActArg) => Promise<void>>>;
  extract: ReturnType<typeof vi.fn<(arg: ExtractArg) => Promise<unknown>>>;
  context: { pages: () => FakePage[] };
}

let stagehandConstructorArgs: unknown[] = [];
let lastStagehand: FakeStagehandInstance | null = null;
let lastPage: FakePage | null = null;

function makeFakePage(): FakePage {
  const page: FakePage = {
    goto: vi.fn(async (_url: string, _opts?: GotoOpts) => undefined),
    title: vi.fn(async () => "Fake Page Title"),
    url: vi.fn(() => "https://example.com/final"),
    evaluate: vi.fn(async (_fn: unknown) => "visible text content"),
  };
  lastPage = page;
  return page;
}

function makeFakeStagehand(args: unknown): FakeStagehandInstance {
  const page = makeFakePage();
  const inst: FakeStagehandInstance = {
    init: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    act: vi.fn(async (_arg: ActArg) => undefined),
    extract: vi.fn(async (_arg: ExtractArg) => ({ posts: [{ author: "A", content: "B" }] })),
    context: { pages: () => [page] },
  };
  stagehandConstructorArgs.push(args);
  lastStagehand = inst;
  return inst;
}

vi.mock("@browserbasehq/stagehand", () => {
  // Constructor returns a fake instance. We use a factory-style class.
  class Stagehand {
    constructor(args: unknown) {
      const inst = makeFakeStagehand(args);
      Object.assign(this, inst);
    }
  }
  return { Stagehand };
});

// Browserbase SDK — only contexts.create is called from browserbase.ts
vi.mock("@browserbasehq/sdk", () => {
  class Browserbase {
    contexts = {
      create: vi.fn(async () => ({ id: "ctx_test_" + Math.random().toString(36).slice(2, 8) })),
    };
    constructor(_args: { apiKey: string }) {}
  }
  return { default: Browserbase };
});

// --- Environment setup ------------------------------------------------------

function setBrowserEnv() {
  process.env.BROWSERBASE_API_KEY = "bb_live_test";
  process.env.BROWSERBASE_PROJECT_ID = "proj_test";
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  // Provide a pre-existing context ID so getOrCreateContext short-circuits.
  process.env.BROWSERBASE_CONTEXT_DEFAULT = "ctx_env_default";
  process.env.BROWSERBASE_CONTEXT_LINKEDIN = "ctx_env_linkedin";
}

function unsetBrowserEnv() {
  delete process.env.BROWSERBASE_API_KEY;
  delete process.env.BROWSERBASE_PROJECT_ID;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.BROWSERBASE_CONTEXT_DEFAULT;
  delete process.env.BROWSERBASE_CONTEXT_LINKEDIN;
}

const FLAG_STATES = [
  { label: "v3 (flag unset — default after Phase 51)", env: undefined },
  { label: "v2 (flag = 0 explicit opt-out)", env: "0" },
  { label: "v3 (flag = 1 explicit)", env: "1" },
] as const;

// --- Test suite -------------------------------------------------------------

describe("browser connector regression — 4 tools × 3 flag states (Phase 44 SCM-02 / Phase 51 LANG-02)", () => {
  beforeEach(() => {
    stagehandConstructorArgs = [];
    lastStagehand = null;
    lastPage = null;
    setBrowserEnv();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    unsetBrowserEnv();
  });

  for (const { label, env } of FLAG_STATES) {
    describe(label, () => {
      beforeEach(() => {
        if (env === undefined) {
          delete process.env.KEBAB_BROWSER_CONNECTOR_V2;
        } else {
          vi.stubEnv("KEBAB_BROWSER_CONNECTOR_V2", env);
        }
      });

      // --- web_browse ---------------------------------------------------------

      describe("handleWebBrowse", () => {
        it("happy path: navigates to URL, returns text content", async () => {
          const { handleWebBrowse } = await import("@/connectors/browser/tools/web-browse");
          const result = await handleWebBrowse({
            url: "https://example.com/",
            scroll_count: 0,
          });
          expect(result.content[0]?.type).toBe("text");
          expect(result.content[0]?.text).toContain("Fake Page Title");
          // Stagehand was constructed with the right env
          expect(stagehandConstructorArgs.length).toBeGreaterThanOrEqual(1);
          const args = stagehandConstructorArgs[0] as { env: string };
          expect(args.env).toBe("BROWSERBASE");
          // page.goto was invoked with our URL
          expect(lastPage?.goto).toHaveBeenCalledWith(
            "https://example.com/",
            expect.objectContaining({ waitUntil: "domcontentloaded" })
          );
          // close was called in finally
          expect(lastStagehand?.close).toHaveBeenCalled();
        });

        it("SSRF guard: rejects a private-IP URL without invoking Stagehand", async () => {
          const { handleWebBrowse } = await import("@/connectors/browser/tools/web-browse");
          await expect(
            handleWebBrowse({ url: "http://10.0.0.1/", scroll_count: 0 })
          ).rejects.toThrow(/private networks/);
          // No Stagehand was constructed — guard ran first
          expect(stagehandConstructorArgs.length).toBe(0);
        });
      });

      // --- web_extract --------------------------------------------------------

      describe("handleWebExtract", () => {
        it("happy path: calls stagehand.extract with the instruction", async () => {
          const { handleWebExtract } = await import("@/connectors/browser/tools/web-extract");
          const result = await handleWebExtract({
            url: "https://example.com/",
            instruction: "Extract all posts",
          });
          expect(result.content[0]?.type).toBe("text");
          expect(result.content[0]?.text).toContain("posts");
          expect(lastStagehand?.extract).toHaveBeenCalledWith("Extract all posts");
          expect(lastPage?.goto).toHaveBeenCalled();
          expect(lastStagehand?.close).toHaveBeenCalled();
        });

        it("SSRF guard: rejects RFC1918 URL before Stagehand runs", async () => {
          const { handleWebExtract } = await import("@/connectors/browser/tools/web-extract");
          await expect(
            handleWebExtract({
              url: "http://192.168.1.1/",
              instruction: "anything",
            })
          ).rejects.toThrow(/private networks/);
          expect(stagehandConstructorArgs.length).toBe(0);
        });
      });

      // --- web_act ------------------------------------------------------------

      describe("handleWebAct", () => {
        it("happy path: executes each action via stagehand.act", async () => {
          const { handleWebAct } = await import("@/connectors/browser/tools/web-act");
          const result = await handleWebAct({
            url: "https://example.com/",
            actions: ["click start", "type hello"],
          });
          expect(result.content[0]?.type).toBe("text");
          expect(result.content[0]?.text).toContain("click start");
          expect(lastStagehand?.act).toHaveBeenCalledWith("click start");
          expect(lastStagehand?.act).toHaveBeenCalledWith("type hello");
          expect(lastStagehand?.close).toHaveBeenCalled();
        });

        it("SSRF guard: rejects loopback URL", async () => {
          const { handleWebAct } = await import("@/connectors/browser/tools/web-act");
          await expect(
            handleWebAct({
              url: "http://127.0.0.1/",
              actions: ["anything"],
            })
          ).rejects.toThrow(/loopback/);
          expect(stagehandConstructorArgs.length).toBe(0);
        });
      });

      // --- linkedin_feed ------------------------------------------------------

      describe("handleLinkedinFeed", () => {
        it("happy path: rate-limit check + extract on linkedin feed URL", async () => {
          // Mock the rate-limit check via mocking the browserbase module's
          // exported function. We go through a fresh import.
          vi.doMock("@/connectors/browser/lib/browserbase", async () => {
            const actual = await vi.importActual<
              typeof import("@/connectors/browser/lib/browserbase")
            >("@/connectors/browser/lib/browserbase");
            return {
              ...actual,
              checkAndIncrementDailyLimit: vi.fn(async () => ({ allowed: true, count: 1 })),
            };
          });

          const { handleLinkedinFeed } = await import("@/connectors/browser/tools/linkedin-feed");
          const result = await handleLinkedinFeed({ max_posts: 20 });
          expect(result.content[0]?.type).toBe("text");
          expect(lastStagehand?.extract).toHaveBeenCalled();
          // The URL passed to goto should be the LinkedIn feed URL
          expect(lastPage?.goto).toHaveBeenCalledWith(
            "https://www.linkedin.com/feed/",
            expect.objectContaining({ waitUntil: "domcontentloaded" })
          );
          vi.doUnmock("@/connectors/browser/lib/browserbase");
        });

        it("rate-limit rejection: returns an isError payload WITHOUT invoking Stagehand", async () => {
          vi.doMock("@/connectors/browser/lib/browserbase", async () => {
            const actual = await vi.importActual<
              typeof import("@/connectors/browser/lib/browserbase")
            >("@/connectors/browser/lib/browserbase");
            return {
              ...actual,
              checkAndIncrementDailyLimit: vi.fn(async () => ({ allowed: false, count: 3 })),
            };
          });

          const { handleLinkedinFeed } = await import("@/connectors/browser/tools/linkedin-feed");
          const result = await handleLinkedinFeed({ max_posts: 20 });
          expect(result.isError).toBe(true);
          expect(result.content[0]?.text).toContain("rate limited");
          // No Stagehand spin-up because rate-limit short-circuited
          expect(stagehandConstructorArgs.length).toBe(0);
          vi.doUnmock("@/connectors/browser/lib/browserbase");
        });
      });
    });
  }
});

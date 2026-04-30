/**
 * Page-level helpers shared across the browser tool handlers.
 *
 * Kept separate from `browserbase.ts` so the heavy Stagehand/Browserbase
 * imports stay localized — these helpers only need a Stagehand `page`
 * (Playwright-shaped) handle.
 */

type StagehandPage = {
  evaluate: <R>(fn: () => R | Promise<R>) => Promise<R>;
  url: () => string;
};

const DEFAULT_NAV_TIMEOUT_MS = 30_000;
const SCROLL_STEP_DELAY_MIN_MS = 800;
const SCROLL_STEP_DELAY_MAX_MS = 1500;
const AUTO_SCROLL_MAX_ROUNDS = 12;
const AUTO_SCROLL_QUIESCENCE_MS = 2_000;
// Page height can jitter by a handful of pixels even when no new content
// is loading — sticky footers, ad slot reflows, scrollbar fade-out, etc.
// Using strict equality (`height === lastHeight`) means a 1-pixel wobble
// resets the stable counter forever and we hit MAX_ROUNDS instead of
// quiescing properly (review finding #8, 2026-05-01).
const AUTO_SCROLL_HEIGHT_JITTER_PX = 50;

export const PAGE_HELPER_DEFAULTS = {
  navTimeoutMs: DEFAULT_NAV_TIMEOUT_MS,
  autoScrollMaxRounds: AUTO_SCROLL_MAX_ROUNDS,
} as const;

/**
 * Scroll the page to load lazy/infinite-scroll content. Two modes:
 *
 * - `count` (number ≥ 0) — fixed number of `scrollBy(innerHeight)` steps,
 *   with random jitter between steps to look human. Same behavior the
 *   original web-browse / web-extract handlers had, kept for compat.
 * - `"auto"` — scroll until the page stops growing (document height stable
 *   for {@link AUTO_SCROLL_QUIESCENCE_MS}) OR we hit
 *   {@link AUTO_SCROLL_MAX_ROUNDS}, whichever comes first. Useful when the
 *   caller doesn't know up front how many scrolls a feed needs.
 */
export async function scrollPage(
  page: StagehandPage,
  scroll: number | "auto" | undefined
): Promise<{ rounds: number; finalHeight: number }> {
  if (scroll === undefined || scroll === 0) {
    const finalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    return { rounds: 0, finalHeight };
  }

  if (scroll === "auto") {
    let rounds = 0;
    let stable = 0;
    let lastHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    while (rounds < AUTO_SCROLL_MAX_ROUNDS && stable < 2) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(SCROLL_STEP_DELAY_MIN_MS + Math.random() * 600);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      if (Math.abs(height - lastHeight) < AUTO_SCROLL_HEIGHT_JITTER_PX) {
        stable += 1;
        await sleep(AUTO_SCROLL_QUIESCENCE_MS / 2);
      } else {
        stable = 0;
        lastHeight = height;
      }
      rounds += 1;
    }
    return { rounds, finalHeight: lastHeight };
  }

  // Numeric path
  const n = Math.max(0, Math.floor(scroll));
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await sleep(
      SCROLL_STEP_DELAY_MIN_MS +
        Math.random() * (SCROLL_STEP_DELAY_MAX_MS - SCROLL_STEP_DELAY_MIN_MS)
    );
  }
  const finalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  return { rounds: n, finalHeight };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolve a navigation timeout from a caller-provided value, clamped to a
 * sane range. Defaults to 30s. Min 5s (anything lower fails on slow first
 * paints), max 90s (Browserbase session would otherwise idle out).
 */
export function clampNavTimeout(ms: number | undefined): number {
  if (ms === undefined || !Number.isFinite(ms)) return DEFAULT_NAV_TIMEOUT_MS;
  return Math.max(5_000, Math.min(90_000, Math.floor(ms)));
}

import { fetchWithByteCap } from "@/core/fetch-utils";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Phase 44 SCM-05b: 10s explicit timeout preserved. The inline AbortController
// is retained here because fetchWithByteCap is a specialized streaming variant
// that owns its own body reader — layering fetchWithTimeout on top would
// double-wrap the signal for no benefit. This is the ONE site where an
// inline AbortController+setTimeout pattern is preserved; it is not a
// fetchWithTimeout-equivalent because the timeout needs to cover the full
// streaming read window, not just the fetch() promise resolution.
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB safety cap

export async function fetchHtmlWithCookie(
  url: string,
  cookieHeader: string
): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const result = await fetchWithByteCap(
      url,
      {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: cookieHeader,
        },
      },
      MAX_HTML_BYTES
    );
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Upstream returned ${result.status}`);
    }
    if (result.truncated) {
      throw new Error(
        `Response body too large (exceeded ${Math.round(MAX_HTML_BYTES / 1024 / 1024)}MB cap)`
      );
    }
    return { html: result.text, finalUrl: result.finalUrl };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

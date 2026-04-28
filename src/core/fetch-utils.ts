/**
 * fetch-utils — shared helpers for HTTP fetches across connectors.
 *
 * Exports:
 *   - fetchWithTimeout(url, init?, timeoutMs?) — cancels after timeoutMs
 *   - fetchWithByteCap(url, init, maxBytes)    — streams with a byte ceiling
 *   - FetchCapResult                           — return shape of fetchWithByteCap
 *
 * Phase 44 SCM-05b — fetchWithTimeout consolidates 5 prior inline copies
 * (apify/client.ts, vault/github.ts, paywall/fetch-html.ts,
 * skills/remote-fetcher.ts, core/storage-mode.ts). Default 15_000ms is
 * a safety net; every call site passes its prior explicit default so
 * behavior is unchanged.
 */

/**
 * fetchWithTimeout — wrap `fetch` with an abort controller that fires
 * after `timeoutMs`. If the caller supplies `init.signal`, it is linked
 * to the internal controller (either firing aborts the fetch).
 *
 * - Default timeout: 15_000ms. Every existing call site passes its prior
 *   explicit default; the 15s default is a safety net for future callers.
 * - Rethrows raw AbortError on timeout (callers wrap for friendly messages).
 * - Clears the timer in `finally`, no leaked handles.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = 15_000
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  // Link caller-supplied signal so either source can abort the fetch.
  const callerSignal = init.signal;
  let onCallerAbort: (() => void) | null = null;
  if (callerSignal) {
    if (callerSignal.aborted) {
      ctrl.abort();
    } else {
      onCallerAbort = () => ctrl.abort();
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    if (callerSignal && onCallerAbort) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}

/**
 * fetchWithByteCap — fetch a URL and stream the body, aborting if it
 * exceeds `maxBytes`. Returns `{ text, truncated }` where `truncated`
 * is true when the cap was hit before the stream completed.
 *
 * Rationale: `response.text()` / `response.arrayBuffer()` read the full
 * body into memory first, which is unsafe for attacker-controlled URLs.
 * Streaming via `response.body.getReader()` lets us bail out early.
 *
 * Bytes are decoded as UTF-8 at the end via TextDecoder. The cap is
 * measured against accumulated bytes, not UTF-16 code units, so it is
 * a real memory guard.
 */

export interface FetchCapResult {
  text: string;
  truncated: boolean;
  status: number;
  finalUrl: string;
  /** Location header for 3xx responses. Callers using `redirect: "manual"`
   *  must read this and re-validate before following the redirect. */
  location: string | null;
  /** Response headers — exposed so callers can read auth/signature
   *  headers (e.g. `x-skill-signature`) without a second fetch. */
  headers: Headers;
}

export async function fetchWithByteCap(
  url: string,
  init: RequestInit,
  maxBytes: number
): Promise<FetchCapResult> {
  const res = await fetch(url, init);

  const location = res.headers.get("location");

  // Short-circuit for 3xx redirects under `redirect: "manual"`. The body
  // is uninteresting; just hand the Location header back to the caller.
  if (init.redirect === "manual" && res.status >= 300 && res.status < 400) {
    return {
      text: "",
      truncated: false,
      status: res.status,
      finalUrl: res.url || url,
      location,
      headers: res.headers,
    };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    // No streaming body (some runtimes) — fall back to text() with a soft check.
    const text = await res.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    return {
      text,
      truncated: bytes > maxBytes,
      status: res.status,
      finalUrl: res.url || url,
      location,
      headers: res.headers,
    };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      truncated = true;
      // Keep the bytes we have so the partial text is still usable.
      const remaining = maxBytes - (total - value.byteLength);
      if (remaining > 0) chunks.push(value.subarray(0, remaining));
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    chunks.push(value);
  }

  // Concatenate into a single buffer for decoding.
  const buf = new Uint8Array(truncated ? maxBytes : total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(buf.subarray(0, offset));

  return {
    text,
    truncated,
    status: res.status,
    finalUrl: res.url || url,
    location,
    headers: res.headers,
  };
}

/**
 * fetchWithValidation — fetch + JSON parse + Zod validation in one call.
 *
 * DX-A-01 (v0.16): Connector lib code commonly does
 *   `const data = (await res.json()) as MyResponse;`
 * which silently passes through any garbage the upstream API returns.
 * If the API drifts (Slack returns null for `ok`, GitHub adds a wrapper
 * field, Notion swaps a string for an object), the cast hides the
 * mismatch and the bug surfaces deep in the handler as a TypeError.
 *
 * This helper composes `fetchWithTimeout` + `response.json()` +
 * `schema.parse()` so the validation failure is loud and located at
 * the network boundary. Throws `FetchValidationError` on parse
 * failure, with the upstream URL + truncated response body for
 * debugging. HTTP errors (non-2xx) are NOT thrown — caller decides
 * how to handle a 404 vs a 500.
 *
 * Use Zod's `.passthrough()` if the upstream may add fields you
 * don't validate. Use `.strict()` to fail when the response has
 * unknown fields (rare; useful for security-sensitive responses).
 *
 * Caveats:
 * - Empty response bodies are validated against `undefined`. If your
 *   schema can accept undefined (e.g. `z.object({}).optional()`), this
 *   passes; otherwise it errors.
 * - Schemas with `.transform()` that throw at runtime: the throw is
 *   caught by safeParse and surfaces as FetchValidationError — but if
 *   you need async transforms, use `parseAsync` directly outside this
 *   helper. This signature stays sync-parse-only on purpose.
 *
 * Example:
 *   const SlackOk = z.object({ ok: z.literal(true), ts: z.string() });
 *   const data = await fetchWithValidation(url, init, SlackOk);
 *   data.ts; // typed as string, validated at runtime
 */
import type { z } from "zod";

export class FetchValidationError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly body: string,
    public readonly status: number,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = "FetchValidationError";
  }
}

export async function fetchWithValidation<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  timeoutMs: number = 15_000
): Promise<{ data: T; status: number; response: Response }> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  let raw: string;
  try {
    raw = await res.text();
  } catch (err) {
    throw new FetchValidationError(
      `Failed to read response body from ${url}`,
      url,
      "",
      res.status,
      err
    );
  }
  let parsed: unknown;
  if (raw.length === 0) {
    parsed = undefined;
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new FetchValidationError(
        `Response from ${url} is not valid JSON (status ${res.status})`,
        url,
        raw.slice(0, 500),
        res.status,
        err
      );
    }
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new FetchValidationError(
      `Response from ${url} failed schema validation: ${result.error.message}`,
      url,
      raw.slice(0, 500),
      res.status,
      result.error
    );
  }
  return { data: result.data, status: res.status, response: res };
}

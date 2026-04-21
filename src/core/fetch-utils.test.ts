import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Tests for fetchWithTimeout (Phase 44 SCM-05b) living alongside the
// pre-existing fetchWithByteCap behavior which is separately covered by
// call-site integration tests in skills/paywall. Here we only test the
// timeout helper's own contract.

describe("fetchWithTimeout", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("resolves a fast response before the timer fires", async () => {
    const mockRes = new Response("hello", { status: 200 });
    globalThis.fetch = vi.fn(async () => mockRes) as unknown as typeof fetch;

    const { fetchWithTimeout } = await import("./fetch-utils");
    const p = fetchWithTimeout("https://example.com/", {}, 5_000);
    const res = await p;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
  });

  it("aborts with AbortError when the timeout elapses", async () => {
    // Stub fetch with a promise that rejects only when its signal aborts.
    globalThis.fetch = vi.fn((_url, init: RequestInit = {}) => {
      return new Promise((resolve, reject) => {
        const signal = init.signal;
        if (signal) {
          if (signal.aborted) {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            },
            { once: true }
          );
        }
        // otherwise hang forever — the test advances fake timers to force abort
      });
    }) as unknown as typeof fetch;

    const { fetchWithTimeout } = await import("./fetch-utils");
    const p = fetchWithTimeout("https://slow.example.com/", {}, 100);
    // Catch the rejection up-front so vitest doesn't flag an unhandled rejection
    // when the abort resolves before the awaiter below runs.
    const caught = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(150);
    const err = (await caught) as Error;
    expect(err).toBeInstanceOf(Error);
    expect((err as { name?: string }).name).toBe("AbortError");
  });

  it("honors a caller-supplied AbortSignal — external abort propagates", async () => {
    let capturedSignal: AbortSignal | null = null;
    globalThis.fetch = vi.fn((_url, init: RequestInit = {}) => {
      capturedSignal = init.signal ?? null;
      return new Promise((_resolve, reject) => {
        const signal = init.signal;
        if (signal) {
          signal.addEventListener(
            "abort",
            () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            { once: true }
          );
        }
      });
    }) as unknown as typeof fetch;

    const { fetchWithTimeout } = await import("./fetch-utils");
    const ctrl = new AbortController();
    const p = fetchWithTimeout("https://example.com/", { signal: ctrl.signal }, 60_000);
    const caught = p.catch((e: unknown) => e);
    // Abort the caller's signal BEFORE the timer fires.
    ctrl.abort();
    const err = (await caught) as Error;
    expect((err as { name?: string }).name).toBe("AbortError");
    expect(capturedSignal).not.toBeNull();
    // The internal fetch signal is the linked controller, not the caller's
    // directly — assert that the fetch was actually invoked with a signal.
    expect((capturedSignal as unknown as AbortSignal).aborted).toBe(true);
  });

  it("uses a 15_000ms default when timeoutMs is omitted", async () => {
    // We can't easily assert the timer duration without poking internals,
    // but we can assert the helper does NOT abort at 10_000ms and DOES
    // abort at 16_000ms — the 15s default sits between those.
    globalThis.fetch = vi.fn((_url, init: RequestInit = {}) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal;
        if (signal) {
          signal.addEventListener(
            "abort",
            () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            { once: true }
          );
        }
      });
    }) as unknown as typeof fetch;

    const { fetchWithTimeout } = await import("./fetch-utils");
    const p = fetchWithTimeout("https://example.com/"); // no init, no timeoutMs
    const caught = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    // At 10s the fetch is still pending; the catch handler hasn't fired.
    let settled = false;
    caught.then(() => {
      settled = true;
    });
    // microtask flush
    await Promise.resolve();
    expect(settled).toBe(false);
    // Advance past 15s (cumulative 16s).
    await vi.advanceTimersByTimeAsync(6_000);
    const err = (await caught) as Error;
    expect((err as { name?: string }).name).toBe("AbortError");
  });

  it("clears the timer on early fetch resolution (no leaked handles)", async () => {
    const mockRes = new Response("ok", { status: 200 });
    globalThis.fetch = vi.fn(async () => mockRes) as unknown as typeof fetch;

    // Spy setTimeout/clearTimeout via vi.spyOn on globalThis.
    const setSpy = vi.spyOn(globalThis, "setTimeout");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    const { fetchWithTimeout } = await import("./fetch-utils");
    await fetchWithTimeout("https://example.com/", {}, 5_000);

    expect(setSpy).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();

    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
});

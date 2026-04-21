/**
 * Unit tests for `src/core/with-admin-auth.ts` — PIPE-05.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { withAdminAuth } from "@/core/with-admin-auth";
import { __resetFirstRunForTests } from "@/core/first-run";

const ENV_KEYS = ["ADMIN_AUTH_TOKEN", "MCP_AUTH_TOKEN", "VERCEL"];
function snap(): Record<string, string | undefined> {
  const o: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) o[k] = process.env[k];
  return o;
}
function restore(s: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("withAdminAuth (PIPE-05)", () => {
  let s: Record<string, string | undefined>;

  beforeEach(() => {
    s = snap();
    __resetFirstRunForTests();
  });

  afterEach(() => {
    restore(s);
  });

  it("returns 401 on unauthed request", async () => {
    process.env.ADMIN_AUTH_TOKEN = "admin-t";
    process.env.VERCEL = "1";

    const handler = vi.fn(async () => new Response("never", { status: 200 }));
    const wrapped = withAdminAuth(handler);
    const res = await wrapped(new Request("https://test.local/api/config/x", { method: "GET" }));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes handler on authed request; handler sees ctx.authKind='admin'", async () => {
    process.env.ADMIN_AUTH_TOKEN = "admin-t";

    const handler = vi.fn(async (ctx) => {
      expect(ctx.authKind).toBe("admin");
      return new Response("ok", { status: 200 });
    });
    const wrapped = withAdminAuth(handler);
    const res = await wrapped(
      new Request("https://test.local/api/config/x", {
        method: "GET",
        headers: { authorization: "Bearer admin-t" },
      })
    );
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns a Next.js-compatible (request, routeCtx?) handler — routeCtx flows to ctx.routeParams", async () => {
    process.env.ADMIN_AUTH_TOKEN = "admin-t";

    let seenRouteParams: unknown = "unset";
    const wrapped = withAdminAuth(async (ctx) => {
      seenRouteParams = ctx.routeParams;
      return new Response("ok");
    });

    const fakeRouteCtx = { params: Promise.resolve({ id: "abc" }) };
    await wrapped(
      new Request("https://test.local/api/config/skills/abc", {
        method: "GET",
        headers: { authorization: "Bearer admin-t" },
      }),
      fakeRouteCtx
    );
    expect(seenRouteParams).toBe(fakeRouteCtx);
  });

  it("CSRF mismatch on POST → 403 (checkAdminAuth runs CSRF internally)", async () => {
    process.env.ADMIN_AUTH_TOKEN = "admin-t";

    const wrapped = withAdminAuth(async () => new Response("ok", { status: 200 }));
    const res = await wrapped(
      new Request("http://test.local/api/config/x", {
        method: "POST",
        headers: {
          authorization: "Bearer admin-t",
          origin: "https://evil.example",
          host: "test.local",
        },
      })
    );
    expect(res.status).toBe(403);
  });
});

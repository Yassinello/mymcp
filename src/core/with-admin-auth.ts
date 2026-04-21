/**
 * withAdminAuth — PIPE-05.
 *
 * Thin HOC that wraps an admin-auth-only route handler in
 * `composeRequestPipeline([rehydrateStep, authStep('admin')])`. Replaces
 * the 40-site `const authError = await checkAdminAuth(req); if (authError) return authError;`
 * preamble with a single wrapper, collapsing the boilerplate to one call.
 *
 * Routes that need additional state (body-parse, tenant resolution, rate
 * limits, custom CSRF) compose the full pipeline directly. This HOC is
 * the majority case — ~31 admin routes that just need "rehydrate +
 * admin-authed".
 *
 * Internally delegates to `composeRequestPipeline`, so the resulting
 * handler is contract-compliant for both `route-rehydrate-coverage`
 * (DUR-03) and `pipeline-coverage` (PIPE-06) without the caller having
 * to spell out the pipeline.
 *
 * `authStep('admin')` already runs CSRF + admin-token check (see auth.ts
 * checkAdminAuth), so callers don't need to add a separate csrfStep.
 */

import { composeRequestPipeline, rehydrateStep, authStep } from "./pipeline";
import type { PipelineContext } from "./pipeline/types";

/**
 * Signature of an admin route handler:
 *   (ctx) => Promise<Response>
 *
 * ctx gives access to `ctx.request`, `ctx.routeParams`, and `ctx.tokenId`.
 * Admin routes that don't need any of those can ignore the arg.
 */
export type AdminRouteHandler = (ctx: PipelineContext) => Promise<Response>;

/**
 * Wrap an admin route handler in the admin-auth pipeline. Returns a
 * Next.js-compatible `(request, routeCtx?) => Promise<Response>`.
 *
 * Usage:
 *   import { withAdminAuth } from "@/core/with-admin-auth";
 *
 *   async function handler(ctx) {
 *     const req = ctx.request;
 *     // ... admin-only logic ...
 *     return Response.json({ ok: true });
 *   }
 *   export const POST = withAdminAuth(handler);
 */
export function withAdminAuth(
  handler: AdminRouteHandler
): (request: Request, routeCtx?: unknown) => Promise<Response> {
  return composeRequestPipeline([rehydrateStep, authStep("admin")], handler);
}

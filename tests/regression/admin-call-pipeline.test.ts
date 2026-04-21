/**
 * admin/call pipeline regression — Phase 41 Task 4.
 *
 * Asserts the `app/api/admin/call/route.ts` file uses the pipeline
 * (contract anticipation for PIPE-06) and that the public contract
 * shape is preserved:
 *  - unauthed → 401/403 (handled inside authStep/checkAdminAuth; full
 *    response-shape integration covered by existing tenant-auth.test.ts
 *    + the regression tests for the 34-admin-route migration in Task 6)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("admin/call pipeline regression (Phase 41 Task 4)", () => {
  const routePath = resolve(process.cwd(), "app/api/admin/call/route.ts");
  const source = readFileSync(routePath, "utf-8");

  it("route exports POST via composeRequestPipeline", () => {
    expect(source).toMatch(/composeRequestPipeline\(/);
    expect(source).toMatch(/export\s+const\s+POST\s*=\s*composeRequestPipeline/);
  });

  it("pipeline composes rehydrateStep, authStep('admin'), bodyParseStep", () => {
    expect(source).toMatch(/rehydrateStep/);
    expect(source).toMatch(/authStep\(["']admin["']\)/);
    expect(source).toMatch(/bodyParseStep\(/);
  });

  it("hand-rolled preamble is gone (no inline checkAdminAuth / request.json)", () => {
    // The admin auth check is now in authStep, not inline
    expect(source).not.toMatch(/const\s+authError\s*=\s*await\s+checkAdminAuth/);
    // Body parsing is now in bodyParseStep (ctx.parsedBody), not inline
    expect(source).not.toMatch(/await\s+request\.json\(\)/);
  });

  it("tenant resolution via x-mymcp-tenant stays handler-local", () => {
    // The handler reads tenantId from getTenantId(request) + wraps the
    // tool invocation in a nested requestContext.run. This is the
    // documented migration note from INVENTORY.md.
    expect(source).toMatch(/getTenantId\(/);
    expect(source).toMatch(/requestContext\.run\(/);
  });
});

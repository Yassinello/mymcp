/**
 * storage/status pipeline regression — Phase 41 Task 4.
 *
 * Asserts the `app/api/storage/status/route.ts` file uses the pipeline
 * (contract anticipation for PIPE-06) and preserves the triple-way
 * auth ladder (loopback || isClaimer || checkAdminAuth) as inline
 * handler logic — too bespoke for a generic authStep variant.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("storage/status pipeline regression (Phase 41 Task 4)", () => {
  const routePath = resolve(process.cwd(), "app/api/storage/status/route.ts");
  const source = readFileSync(routePath, "utf-8");

  it("route exports GET via composeRequestPipeline", () => {
    expect(source).toMatch(/composeRequestPipeline\(/);
    expect(source).toMatch(/export\s+const\s+GET\s*=\s*composeRequestPipeline/);
  });

  it("pipeline is exactly [rehydrateStep] — partial pipeline usage is legit", () => {
    expect(source).toMatch(/rehydrateStep/);
    // No authStep — the triple-way auth ladder stays inline
    expect(source).not.toMatch(/authStep\(/);
  });

  it("triple-way auth ladder preserved (loopback || isClaimer || checkAdminAuth)", () => {
    expect(source).toMatch(/isLoopbackRequest\(/);
    expect(source).toMatch(/isClaimer\(/);
    expect(source).toMatch(/checkAdminAuth\(/);
  });

  it("legacy withBootstrapRehydrate HOC is gone (pipeline now owns rehydrate)", () => {
    expect(source).not.toMatch(/withBootstrapRehydrate/);
  });
});

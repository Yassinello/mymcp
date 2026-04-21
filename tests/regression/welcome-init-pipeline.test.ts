/**
 * welcome/init pipeline regression — Phase 41 Task 4.
 *
 * Asserts the `app/api/welcome/init/route.ts` file uses the pipeline
 * (contract anticipation for PIPE-06) and preserves the route-specific
 * gates that didn't fold into generic steps.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("welcome/init pipeline regression (Phase 41 Task 4)", () => {
  const routePath = resolve(process.cwd(), "app/api/welcome/init/route.ts");
  const source = readFileSync(routePath, "utf-8");

  it("route exports POST via composeRequestPipeline", () => {
    expect(source).toMatch(/composeRequestPipeline\(/);
    expect(source).toMatch(/export\s+const\s+POST\s*=\s*composeRequestPipeline/);
  });

  it("pipeline is exactly [rehydrateStep, csrfStep] — no authStep (bespoke isClaimer gate)", () => {
    expect(source).toMatch(/rehydrateStep/);
    expect(source).toMatch(/csrfStep/);
    // authStep NOT used — welcome/init's auth is the bespoke isClaimer gate
    expect(source).not.toMatch(/authStep\(/);
  });

  it("MYMCP_RECOVERY_RESET + firstRunMode gates stay inline in handler", () => {
    expect(source).toMatch(/MYMCP_RECOVERY_RESET/);
    expect(source).toMatch(/isFirstRunMode\(/);
    expect(source).toMatch(/isBootstrapActive\(/);
  });

  it("isClaimer gate preserved (SigningSecretUnavailableError branch intact)", () => {
    expect(source).toMatch(/await\s+isClaimer\(/);
    expect(source).toMatch(/SigningSecretUnavailableError/);
  });

  it("flushBootstrapToKv await + 500-on-failure branch preserved (DUR-04)", () => {
    expect(source).toMatch(/await\s+flushBootstrapToKv\(/);
    expect(source).toMatch(/persistence\s+to\s+KV\s+failed/);
  });

  it("legacy withBootstrapRehydrate HOC is gone (pipeline now owns rehydrate)", () => {
    expect(source).not.toMatch(/withBootstrapRehydrate/);
  });
});

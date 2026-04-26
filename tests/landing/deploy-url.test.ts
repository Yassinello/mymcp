import { describe, it, expect } from "vitest";

describe("deploy-url constants", () => {
  it("REPO_URL exports the kebab-mcp GitHub URL", async () => {
    const { REPO_URL } = await import("../../app/landing/deploy-url");
    expect(REPO_URL).toBe("https://github.com/Yassinello/kebab-mcp");
  });

  it("UPSTREAM_OWNER is 'Yassinello' derived from REPO_URL", async () => {
    const { UPSTREAM_OWNER } = await import("../../app/landing/deploy-url");
    expect(UPSTREAM_OWNER).toBe("Yassinello");
  });

  it("UPSTREAM_REPO_SLUG is 'kebab-mcp' derived from REPO_URL", async () => {
    const { UPSTREAM_REPO_SLUG } = await import("../../app/landing/deploy-url");
    expect(UPSTREAM_REPO_SLUG).toBe("kebab-mcp");
  });

  it("UPSTREAM_OWNER and UPSTREAM_REPO_SLUG are derived from REPO_URL segments", async () => {
    const { REPO_URL, UPSTREAM_OWNER, UPSTREAM_REPO_SLUG } =
      await import("../../app/landing/deploy-url");
    const segments = REPO_URL.split("/");
    expect(UPSTREAM_OWNER).toBe(segments.at(-2));
    expect(UPSTREAM_REPO_SLUG).toBe(segments.at(-1));
  });
});

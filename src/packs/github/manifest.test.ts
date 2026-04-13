import { describe, it, expect } from "vitest";
import { githubPack } from "./manifest";

describe("githubPack manifest", () => {
  it("registers all 6 tools with correct names", () => {
    const names = githubPack.tools.map((t) => t.name);
    expect(names).toContain("github_list_issues");
    expect(names).toContain("github_get_issue");
    expect(names).toContain("github_create_issue");
    expect(names).toContain("github_update_issue");
    expect(names).toContain("github_add_comment");
    expect(names).toContain("github_search_issues");
    expect(names).toHaveLength(6);
  });

  it("marks write tools as destructive", () => {
    const destructiveTools = githubPack.tools.filter((t) => t.destructive).map((t) => t.name);
    expect(destructiveTools).toContain("github_create_issue");
    expect(destructiveTools).toContain("github_update_issue");
    expect(destructiveTools).toContain("github_add_comment");
  });

  it("does not mark read tools as destructive", () => {
    const readToolNames = ["github_list_issues", "github_get_issue", "github_search_issues"];
    for (const name of readToolNames) {
      const tool = githubPack.tools.find((t) => t.name === name);
      expect(tool?.destructive).toBeFalsy();
    }
  });

  it("requires GITHUB_TOKEN env var", () => {
    expect(githubPack.requiredEnvVars).toContain("GITHUB_TOKEN");
  });

  it("has id 'github'", () => {
    expect(githubPack.id).toBe("github");
  });
});

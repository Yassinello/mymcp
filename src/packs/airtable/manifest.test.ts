import { describe, it, expect } from "vitest";
import { airtablePack } from "./manifest";

describe("airtablePack manifest", () => {
  it("registers all 7 tools with correct names", () => {
    const names = airtablePack.tools.map((t) => t.name);
    expect(names).toContain("airtable_list_bases");
    expect(names).toContain("airtable_list_tables");
    expect(names).toContain("airtable_list_records");
    expect(names).toContain("airtable_get_record");
    expect(names).toContain("airtable_create_record");
    expect(names).toContain("airtable_update_record");
    expect(names).toContain("airtable_search_records");
    expect(names).toHaveLength(7);
  });

  it("marks exactly 2 write tools as destructive", () => {
    const destructiveTools = airtablePack.tools.filter((t) => t.destructive).map((t) => t.name);
    expect(destructiveTools).toContain("airtable_create_record");
    expect(destructiveTools).toContain("airtable_update_record");
    expect(destructiveTools).toHaveLength(2);
  });

  it("does not mark read tools as destructive", () => {
    const readToolNames = [
      "airtable_list_bases",
      "airtable_list_tables",
      "airtable_list_records",
      "airtable_get_record",
      "airtable_search_records",
    ];
    for (const name of readToolNames) {
      const tool = airtablePack.tools.find((t) => t.name === name);
      expect(tool?.destructive).toBeFalsy();
    }
  });

  it("requires AIRTABLE_API_KEY env var", () => {
    expect(airtablePack.requiredEnvVars).toContain("AIRTABLE_API_KEY");
  });

  it("has id 'airtable'", () => {
    expect(airtablePack.id).toBe("airtable");
  });
});

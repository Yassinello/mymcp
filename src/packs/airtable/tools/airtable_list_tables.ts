import { z } from "zod";
import { airtableRequest } from "../lib/airtable-api";

export const airtableListTablesSchema = {
  base_id: z.string().describe("Airtable base ID (e.g. 'appXXXXXXXXXXXXXX')"),
};

interface TablesResponse {
  tables: Array<{
    id: string;
    name: string;
    primaryFieldId: string;
    fields: Array<{ id: string; name: string; type: string }>;
    views: Array<{ id: string; name: string; type: string }>;
  }>;
}

export async function handleAirtableListTables(params: { base_id: string }) {
  const data = await airtableRequest<TablesResponse>(`/meta/bases/${params.base_id}/tables`);

  const tables = data.tables;
  if (tables.length === 0) {
    return { content: [{ type: "text" as const, text: "No tables found in this base." }] };
  }

  const lines = tables.map((t) => {
    const fieldList = t.fields.map((f) => `\`${f.name}\` (${f.type})`).join(", ");
    const viewList = t.views.map((v) => v.name).join(", ");
    return `### ${t.name} (ID: \`${t.id}\`)\n**Fields:** ${fieldList}\n**Views:** ${viewList || "none"}`;
  });

  return {
    content: [
      {
        type: "text" as const,
        text: `## Tables in Base \`${params.base_id}\` (${tables.length})\n\n${lines.join("\n\n")}`,
      },
    ],
  };
}

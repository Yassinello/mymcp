import { z } from "zod";
import { airtableRequest, formatFieldValue } from "../lib/airtable-api";

export const airtableListRecordsSchema = {
  base_id: z.string().describe("Airtable base ID"),
  table: z.string().describe("Table name or table ID"),
  view: z.string().optional().describe("View name or ID to filter records"),
  filter_formula: z
    .string()
    .optional()
    .describe("Airtable formula to filter records (e.g. `{Status}='Active'`)"),
  sort_field: z.string().optional().describe("Field name to sort by"),
  sort_direction: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: asc)"),
  limit: z.number().optional().describe("Max records to return (default: 25, max: 100)"),
};

interface ListRecordsResponse {
  records: Array<{
    id: string;
    createdTime: string;
    fields: Record<string, unknown>;
  }>;
}

export async function handleAirtableListRecords(params: {
  base_id: string;
  table: string;
  view?: string;
  filter_formula?: string;
  sort_field?: string;
  sort_direction?: "asc" | "desc";
  limit?: number;
}) {
  const maxRecords = Math.min(params.limit ?? 25, 100);
  const url = new URL(
    `https://api.airtable.com/v0/${params.base_id}/${encodeURIComponent(params.table)}`
  );
  url.searchParams.set("maxRecords", String(maxRecords));
  if (params.view) url.searchParams.set("view", params.view);
  if (params.filter_formula) url.searchParams.set("filterByFormula", params.filter_formula);
  if (params.sort_field) {
    url.searchParams.set("sort[0][field]", params.sort_field);
    url.searchParams.set("sort[0][direction]", params.sort_direction ?? "asc");
  }

  const data = await airtableRequest<ListRecordsResponse>(url.toString());

  const records = data.records;
  if (records.length === 0) {
    return { content: [{ type: "text" as const, text: "No records found." }] };
  }

  const lines = records.map((r) => {
    const fieldSummary = Object.entries(r.fields)
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${formatFieldValue(v)}`)
      .join(" | ");
    return `- \`${r.id}\` — ${fieldSummary}`;
  });

  return {
    content: [
      {
        type: "text" as const,
        text: `## Records in ${params.table} (${records.length})\n\n${lines.join("\n")}`,
      },
    ],
  };
}

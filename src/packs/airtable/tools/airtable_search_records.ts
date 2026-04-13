import { z } from "zod";
import { airtableRequest, formatFieldValue } from "../lib/airtable-api";

export const airtableSearchRecordsSchema = {
  base_id: z.string().describe("Airtable base ID"),
  table: z.string().describe("Table name or table ID"),
  search_field: z.string().describe("Field name to search within"),
  query: z.string().describe("Text to search for (case-insensitive)"),
  limit: z.number().optional().describe("Max records to return (default: 25, max: 100)"),
};

interface SearchRecordsResponse {
  records: Array<{
    id: string;
    createdTime: string;
    fields: Record<string, unknown>;
  }>;
}

export async function handleAirtableSearchRecords(params: {
  base_id: string;
  table: string;
  search_field: string;
  query: string;
  limit?: number;
}) {
  const maxRecords = Math.min(params.limit ?? 25, 100);
  const formula = `SEARCH(LOWER("${params.query.replace(/"/g, '\\"')}"), LOWER({${params.search_field}}))`;
  const url = new URL(
    `https://api.airtable.com/v0/${params.base_id}/${encodeURIComponent(params.table)}`
  );
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("maxRecords", String(maxRecords));

  const data = await airtableRequest<SearchRecordsResponse>(url.toString());

  const records = data.records;
  if (records.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No records found matching "${params.query}" in field "${params.search_field}".`,
        },
      ],
    };
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
        text: `## Search results for "${params.query}" in ${params.table}.${params.search_field} (${records.length})\n\n${lines.join("\n")}`,
      },
    ],
  };
}

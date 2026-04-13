import { z } from "zod";
import { airtableRequest, formatFieldValue } from "../lib/airtable-api";

export const airtableGetRecordSchema = {
  base_id: z.string().describe("Airtable base ID"),
  table: z.string().describe("Table name or table ID"),
  record_id: z.string().describe("Record ID (e.g. 'recXXXXXXXXXXXXXX')"),
};

interface RecordResponse {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

export async function handleAirtableGetRecord(params: {
  base_id: string;
  table: string;
  record_id: string;
}) {
  const data = await airtableRequest<RecordResponse>(
    `/${params.base_id}/${encodeURIComponent(params.table)}/${params.record_id}`
  );

  const fieldLines = Object.entries(data.fields).map(
    ([k, v]) => `**${k}:** ${formatFieldValue(v)}`
  );

  return {
    content: [
      {
        type: "text" as const,
        text: [
          `## Record \`${data.id}\``,
          `**Created:** ${data.createdTime}`,
          "",
          ...fieldLines,
        ].join("\n"),
      },
    ],
  };
}

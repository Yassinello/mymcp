import { z } from "zod";
import { airtableRequest, formatFieldValue } from "../lib/airtable-api";

export const airtableCreateRecordSchema = {
  base_id: z.string().describe("Airtable base ID"),
  table: z.string().describe("Table name or table ID"),
  fields: z
    .record(z.string(), z.unknown())
    .describe("Field values for the new record as key-value pairs"),
};

interface CreateRecordResponse {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

export async function handleAirtableCreateRecord(params: {
  base_id: string;
  table: string;
  fields: Record<string, unknown>;
}) {
  const data = await airtableRequest<CreateRecordResponse>(
    `/${params.base_id}/${encodeURIComponent(params.table)}`,
    {
      method: "POST",
      body: JSON.stringify({ fields: params.fields }),
    }
  );

  const primaryField = Object.entries(data.fields)[0];
  const preview = primaryField
    ? `${primaryField[0]}: ${formatFieldValue(primaryField[1])}`
    : data.id;

  return {
    content: [
      {
        type: "text" as const,
        text: `Record created: \`${data.id}\` — ${preview}`,
      },
    ],
  };
}

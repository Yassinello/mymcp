import { z } from "zod";
import { airtableRequest } from "../lib/airtable-api";

export const airtableUpdateRecordSchema = {
  base_id: z.string().describe("Airtable base ID"),
  table: z.string().describe("Table name or table ID"),
  record_id: z.string().describe("Record ID to update"),
  fields: z
    .record(z.string(), z.unknown())
    .describe(
      "Fields to update as key-value pairs (partial update — untouched fields are preserved)"
    ),
};

interface UpdateRecordResponse {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

export async function handleAirtableUpdateRecord(params: {
  base_id: string;
  table: string;
  record_id: string;
  fields: Record<string, unknown>;
}) {
  const data = await airtableRequest<UpdateRecordResponse>(
    `/${params.base_id}/${encodeURIComponent(params.table)}/${params.record_id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: params.fields }),
    }
  );

  const updatedFields = Object.keys(params.fields).join(", ");

  return {
    content: [
      {
        type: "text" as const,
        text: `Record \`${data.id}\` updated. Changed fields: ${updatedFields}`,
      },
    ],
  };
}

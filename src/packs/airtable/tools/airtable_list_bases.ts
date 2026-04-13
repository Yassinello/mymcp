import { z } from "zod";
import { airtableRequest } from "../lib/airtable-api";

export const airtableListBasesSchema = {
  _placeholder: z.string().optional().describe("No parameters required"),
};

interface BasesResponse {
  bases: Array<{
    id: string;
    name: string;
    permissionLevel: string;
  }>;
}

export async function handleAirtableListBases(_params: Record<string, unknown>) {
  const data = await airtableRequest<BasesResponse>("/meta/bases");

  const bases = data.bases;
  if (bases.length === 0) {
    return { content: [{ type: "text" as const, text: "No accessible Airtable bases found." }] };
  }

  const lines = bases.map(
    (b) => `- **${b.name}** (ID: \`${b.id}\`, Permission: ${b.permissionLevel})`
  );

  return {
    content: [
      {
        type: "text" as const,
        text: `## Airtable Bases (${bases.length})\n\n${lines.join("\n")}`,
      },
    ],
  };
}

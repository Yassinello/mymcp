import { z } from "zod";
import { searchActors } from "../lib/search";

export const apifySearchActorsSchema = {
  query: z.string().describe("Keyword to search Apify actors (your own + public store)"),
};

export async function handleApifySearchActors(params: { query: string }) {
  const results = await searchActors(params.query);
  if (results.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No actors found for query "${params.query}".`,
        },
      ],
    };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
  };
}

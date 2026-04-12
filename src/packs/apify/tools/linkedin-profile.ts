import { z } from "zod";
import { runActor } from "../lib/client";

// Actor input shape assumed from CONTEXT.md (harvestapi/linkedin-profile-scraper).
// If upstream schema differs, verify via GET /v2/acts/{id} and adjust here.
export const APIFY_LINKEDIN_PROFILE_ACTOR = "harvestapi/linkedin-profile-scraper";

export const apifyLinkedinProfileSchema = {
  url: z.string().url().describe("Public LinkedIn profile URL (https://www.linkedin.com/in/...)"),
};

export async function handleApifyLinkedinProfile(params: { url: string }) {
  const items = await runActor(APIFY_LINKEDIN_PROFILE_ACTOR, { profileUrls: [params.url] });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
  };
}

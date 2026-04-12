import { z } from "zod";
import { runActor } from "../lib/client";

export const APIFY_LINKEDIN_COMPANY_POSTS_ACTOR = "harvestapi/linkedin-company-posts";

export const apifyLinkedinCompanyPostsSchema = {
  url: z.string().url().describe("LinkedIn company page URL"),
  maxPosts: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max number of posts to fetch (default: 20)"),
};

export async function handleApifyLinkedinCompanyPosts(params: { url: string; maxPosts?: number }) {
  const maxPosts = params.maxPosts ?? 20;
  const items = await runActor(APIFY_LINKEDIN_COMPANY_POSTS_ACTOR, {
    companyUrls: [params.url],
    maxPosts,
  });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
  };
}

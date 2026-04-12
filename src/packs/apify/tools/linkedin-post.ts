import { z } from "zod";
import { runActor } from "../lib/client";

export const APIFY_LINKEDIN_POST_ACTOR = "supreme_coder/linkedin-post";

export const apifyLinkedinPostSchema = {
  url: z.string().url().describe("LinkedIn post URL (https://www.linkedin.com/posts/...)"),
};

export async function handleApifyLinkedinPost(params: { url: string }) {
  const items = await runActor(APIFY_LINKEDIN_POST_ACTOR, { postUrls: [params.url] });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
  };
}

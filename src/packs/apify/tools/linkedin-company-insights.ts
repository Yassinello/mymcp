import { z } from "zod";
import { runActor } from "../lib/client";

export const APIFY_LINKEDIN_COMPANY_INSIGHTS_ACTOR =
  "bestscrapers/linkedin-company-insights-scraper";

export const apifyLinkedinCompanyInsightsSchema = {
  url: z.string().url().describe("LinkedIn company page URL"),
};

export async function handleApifyLinkedinCompanyInsights(params: { url: string }) {
  const items = await runActor(APIFY_LINKEDIN_COMPANY_INSIGHTS_ACTOR, {
    companyUrls: [params.url],
  });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
  };
}

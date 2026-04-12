import { z } from "zod";
import { runActor } from "../lib/client";

export const APIFY_LINKEDIN_COMPANY_ACTOR = "harvestapi/linkedin-company";

export const apifyLinkedinCompanySchema = {
  url: z
    .string()
    .url()
    .describe("LinkedIn company page URL (https://www.linkedin.com/company/...)"),
};

export async function handleApifyLinkedinCompany(params: { url: string }) {
  const items = await runActor(APIFY_LINKEDIN_COMPANY_ACTOR, { companyUrls: [params.url] });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
  };
}

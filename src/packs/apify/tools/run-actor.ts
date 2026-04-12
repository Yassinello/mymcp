import { z } from "zod";
import { runActor } from "../lib/client";

export const apifyRunActorSchema = {
  actorId: z.string().describe("Apify actor ID (e.g. 'owner/name' or 'owner~name')"),
  input: z
    .record(z.string(), z.unknown())
    .describe("Actor input object (shape depends on the actor)"),
};

/** Normalize both `owner/name` and `owner~name` forms for comparison. */
function canonicalActorId(id: string): string {
  return id.trim().replace("~", "/");
}

export async function handleApifyRunActor(params: {
  actorId: string;
  input: Record<string, unknown>;
}) {
  const raw = process.env.APIFY_ACTORS;
  if (raw && raw.trim()) {
    const allow = raw
      .split(",")
      .map((s) => canonicalActorId(s))
      .filter(Boolean);
    if (allow.length > 0) {
      const requested = canonicalActorId(params.actorId);
      if (!allow.includes(requested)) {
        throw new Error(
          `Actor '${params.actorId}' is not in APIFY_ACTORS allowlist. Allowed: ${allow.join(", ")}`
        );
      }
    }
  }
  const items = await runActor(params.actorId, params.input);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
  };
}

import { z } from "zod";
import { runActor } from "../lib/client";

export const apifyRunActorSchema = {
  actorId: z.string().describe("Apify actor ID (e.g. 'owner/name' or 'owner~name')"),
  input: z
    .record(z.string(), z.unknown())
    .describe("Actor input object (shape depends on the actor)"),
};

export async function handleApifyRunActor(params: {
  actorId: string;
  input: Record<string, unknown>;
}) {
  const items = await runActor(params.actorId, params.input);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
  };
}

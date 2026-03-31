import { z } from "zod";
import { vaultRead, vaultWrite, vaultDelete } from "@/lib/github";

export const vaultMoveSchema = {
  from: z.string().describe("Current path, e.g. Inbox/note.md"),
  to: z.string().describe("New path, e.g. Veille/note.md"),
  message: z
    .string()
    .optional()
    .describe("Git commit message"),
};

export async function handleVaultMove(params: {
  from: string;
  to: string;
  message?: string;
}) {
  // Read source
  const source = await vaultRead(params.from);

  // Write to new location
  const commitMsg =
    params.message || `Move ${params.from} → ${params.to} via YassMCP`;
  await vaultWrite(params.to, source.content, commitMsg);

  // Delete source
  await vaultDelete(params.from, commitMsg);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            action: "moved",
            from: params.from,
            to: params.to,
          },
          null,
          2
        ),
      },
    ],
  };
}

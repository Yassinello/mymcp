/**
 * admin_stream_test — diagnostic tool that streams 5 chunks with delays.
 * Used to verify that the streaming tool result pipeline works end-to-end.
 */

import { z } from "zod";
import type { ToolResult } from "@/core/types";

export const streamTestSchema = {
  chunks: z.number().min(1).max(20).default(5).describe("Number of chunks to stream"),
  delayMs: z.number().min(0).max(2000).default(100).describe("Delay in ms between chunks"),
};

async function* generateChunks(count: number, delayMs: number): AsyncGenerator<string> {
  for (let i = 1; i <= count; i++) {
    if (delayMs > 0 && i > 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    yield `[chunk ${i}/${count}] Hello from stream test at ${new Date().toISOString()}\n`;
  }
}

export async function handleStreamTest(args: {
  chunks?: number;
  delayMs?: number;
}): Promise<ToolResult> {
  const chunks = args.chunks ?? 5;
  const delayMs = args.delayMs ?? 100;

  return {
    // Placeholder content — withLogging will replace this with collected stream data
    content: [{ type: "text", text: "" }],
    stream: generateChunks(chunks, delayMs),
  };
}

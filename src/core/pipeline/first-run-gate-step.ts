/**
 * firstRunGateStep — PIPE-02.
 *
 * Matches the behavior bit-for-bit of the `if (isFirstRunMode()) return
 * new Response(...)` gate that currently lives inline in
 * `[transport]/route.ts:170`. Only the MCP transport path uses this;
 * admin routes reach their own flows.
 *
 * 503 payload is a JSON object, not a bare string, to preserve the
 * existing public contract:
 *   { error: "Instance not yet initialized. Visit /welcome to set it up." }
 */

import type { Step } from "./types";
import { isFirstRunMode } from "../first-run";

export const firstRunGateStep: Step = async (_ctx, next) => {
  if (isFirstRunMode()) {
    return new Response(
      JSON.stringify({
        error: "Instance not yet initialized. Visit /welcome to set it up.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  return next();
};

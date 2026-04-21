/**
 * csrfStep — PIPE-02.
 *
 * Delegates to `checkCsrf(request)` from src/core/auth.ts. On failure
 * returns the 403 Response directly; on success calls `next()`.
 *
 * This standalone step exists so routes that want CSRF semantics
 * independently of admin-auth can compose it (e.g., welcome/init's
 * pipeline includes `[rehydrateStep, csrfStep]` because its bespoke
 * `isClaimer` gate isn't folded into `authStep`, yet we still want
 * Origin-header CSRF defense on the mint endpoint).
 */

import type { Step } from "./types";
import { checkCsrf } from "../auth";

export const csrfStep: Step = async (ctx, next) => {
  const err = checkCsrf(ctx.request);
  if (err) return err;
  return next();
};

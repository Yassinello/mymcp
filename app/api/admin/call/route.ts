import { getEnabledPacks } from "@/core/registry";
import { withLogging } from "@/core/logging";
import { requestContext } from "@/core/request-context";
import { getTenantId } from "@/core/tenant";
import {
  composeRequestPipeline,
  rehydrateStep,
  authStep,
  bodyParseStep,
  type PipelineContext,
} from "@/core/pipeline";

/**
 * Tool call playground API — test any tool from the dashboard.
 * Requires ADMIN_AUTH_TOKEN. Returns the tool's raw response.
 *
 * SEC-03: tool invocation is wrapped in `requestContext.run` so tool
 * handlers that read the tenantId (via `getCurrentTenantId()`) and rely
 * on `getContextKVStore()` see the same tenant isolation as the MCP
 * transport. Without this wrap, playground calls silently operate on
 * the untenanted KV namespace even when called from a tenant-aware
 * dashboard session. See .planning/research/RISKS-AUDIT.md finding #4.
 *
 * v0.11 Phase 41: pipeline handles rehydrate + admin-auth + body-parse.
 * Tenant resolution via `x-mymcp-tenant` header stays handler-local
 * (admin/call is the only route that reads this header on the admin
 * path; no generic `tenantStep` is warranted for a single callsite).
 */
async function adminCallHandler(ctx: PipelineContext): Promise<Response> {
  const request = ctx.request;

  // Resolve tenantId from the x-mymcp-tenant header (null = default).
  // Invalid header shape → 400 via TenantError.
  let tenantId: string | null;
  try {
    tenantId = getTenantId(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid tenant header" },
      { status: 400 }
    );
  }

  const body = ctx.parsedBody;
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Missing or invalid JSON body" }, { status: 400 });
  }
  const { tool: toolName, params } = body as {
    tool: string;
    params: Record<string, unknown>;
  };

  if (!toolName) {
    return Response.json({ error: "Missing 'tool' field" }, { status: 400 });
  }

  // Find the tool in enabled packs
  const enabledPacks = getEnabledPacks();
  let toolDef = null;
  for (const pack of enabledPacks) {
    const found = pack.manifest.tools.find((t) => t.name === toolName);
    if (found) {
      toolDef = found;
      break;
    }
  }

  if (!toolDef) {
    return Response.json(
      { error: `Tool '${toolName}' not found or pack is disabled` },
      { status: 404 }
    );
  }

  try {
    const handler = withLogging(toolName, async (p: Record<string, unknown>) =>
      toolDef!.handler(p)
    );
    // Nest a requestContext.run so tool handlers see the tenant-scoped
    // KV via getContextKVStore(). The pipeline's outer requestContext.run
    // covers authentication state; this nested run applies the admin's
    // requested tenant header on top.
    const result = await requestContext.run({ tenantId }, () => handler(params || {}));
    return Response.json({ result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Tool execution failed" },
      { status: 500 }
    );
  }
}

export const POST = composeRequestPipeline(
  [rehydrateStep, authStep("admin"), bodyParseStep()],
  adminCallHandler
);

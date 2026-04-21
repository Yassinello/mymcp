import { getSkill } from "@/connectors/skills/store";
import { withAdminAuth } from "@/core/with-admin-auth";
import type { PipelineContext } from "@/core/pipeline";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/config/skills/[id]/export
 * Returns a .md file in Claude Skill format:
 *   ---
 *   name: skill-id
 *   description: ...
 *   ---
 *
 *   # Name
 *
 *   {content}
 */
async function getHandler(ctx: PipelineContext) {
  const routeCtx = ctx.routeParams as RouteContext;
  const { id } = await routeCtx.params;

  const skill = await getSkill(id);
  if (!skill) {
    return new Response("Not found", { status: 404 });
  }

  // Prefer inline content; for remote skills use the last cached copy.
  const body =
    skill.content || (skill.source.type === "remote" ? skill.source.cachedContent || "" : "");

  const safeName = skill.id;
  const safeDesc = (skill.description || skill.name).replace(/\n/g, " ").trim();
  const md =
    `---\n` +
    `name: ${safeName}\n` +
    `description: ${safeDesc}\n` +
    `---\n\n` +
    `# ${skill.name}\n\n` +
    `${body}\n`;

  return new Response(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.md"`,
    },
  });
}

export const GET = withAdminAuth(getHandler);

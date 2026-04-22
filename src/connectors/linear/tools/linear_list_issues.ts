import { z } from "zod";
import { linearQuery, type LinearIssue } from "../lib/linear-api";

export const linearListIssuesSchema = {
  team: z.string().optional().describe("Team key to filter by (e.g. 'ENG')"),
  project: z.string().optional().describe("Project name to filter by"),
  state: z.string().optional().describe("Workflow state name to filter by (e.g. 'In Progress')"),
  assignee: z.string().optional().describe("Assignee name or email to filter by"),
  limit: z.number().optional().describe("Max issues to return (default: 25, max: 100)"),
};

interface ListIssuesData {
  issues: {
    nodes: LinearIssue[];
  };
}

export async function handleLinearListIssues(params: {
  team?: string;
  project?: string;
  state?: string;
  assignee?: string;
  limit?: number;
}) {
  const limit = Math.min(params.limit ?? 25, 100);

  const filters: Record<string, unknown>[] = [];
  if (params.team) filters.push({ team: { key: { eq: params.team.toUpperCase() } } });
  if (params.state) filters.push({ state: { name: { eq: params.state } } });
  if (params.assignee) {
    filters.push({
      assignee: {
        or: [{ name: { containsIgnoreCase: params.assignee } }, { email: { eq: params.assignee } }],
      },
    });
  }
  if (params.project) {
    filters.push({ project: { name: { containsIgnoreCase: params.project } } });
  }

  const filter = filters.length > 0 ? { and: filters } : {};

  const data = await linearQuery<ListIssuesData>(
    `query($filter: IssueFilter, $first: Int) {
      issues(filter: $filter, first: $first, orderBy: updatedAt) {
        nodes {
          id identifier title description priority priorityLabel
          state { name type }
          team { key name }
          assignee { name email }
          labels { nodes { name } }
          createdAt updatedAt url
        }
      }
    }`,
    { filter, first: limit }
  );

  const issues = data.issues.nodes;
  if (issues.length === 0) {
    return { content: [{ type: "text" as const, text: "No issues found." }] };
  }

  const lines = issues.map(
    (i) =>
      `- **${i.identifier}** [${i.state.name}] ${i.title} — ${i.assignee?.name ?? "unassigned"}`
  );

  return {
    content: [
      {
        type: "text" as const,
        text: `## Linear Issues (${issues.length})\n\n${lines.join("\n")}`,
      },
    ],
  };
}

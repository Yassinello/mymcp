import { z } from "zod";
import { linearQuery, type LinearIssue } from "../lib/linear-api";

export const linearSearchIssuesSchema = {
  query: z.string().describe("Full-text search query"),
  limit: z.number().optional().describe("Max results to return (default: 20, max: 50)"),
};

interface SearchData {
  searchIssues: {
    nodes: LinearIssue[];
  };
}

export async function handleLinearSearchIssues(params: { query: string; limit?: number }) {
  const limit = Math.min(params.limit ?? 20, 50);

  const data = await linearQuery<SearchData>(
    `query($term: String!, $first: Int) {
      searchIssues(term: $term, first: $first) {
        nodes {
          id identifier title priority priorityLabel
          state { name type }
          team { key name }
          assignee { name email }
          labels { nodes { name } }
          createdAt updatedAt url
        }
      }
    }`,
    { term: params.query, first: limit }
  );

  const issues = data.searchIssues.nodes;
  if (issues.length === 0) {
    return { content: [{ type: "text" as const, text: `No issues found for "${params.query}".` }] };
  }

  const lines = issues.map(
    (i) =>
      `- **${i.identifier}** [${i.state.name}] ${i.title} — ${i.assignee?.name ?? "unassigned"}`
  );

  return {
    content: [
      {
        type: "text" as const,
        text: `## Search results for "${params.query}" (${issues.length})\n\n${lines.join("\n")}`,
      },
    ],
  };
}

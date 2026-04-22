import { z } from "zod";
import { linearQuery, formatLinearIssue, type LinearIssue } from "../lib/linear-api";
import { McpToolError, ErrorCode } from "@/core/errors";

export const linearGetIssueSchema = {
  identifier: z.string().describe("Issue identifier (e.g. 'ENG-123') or internal issue ID"),
  include_comments: z
    .boolean()
    .optional()
    .describe("Include comments on the issue (default: true)"),
};

interface IssueWithComments extends LinearIssue {
  comments: {
    nodes: Array<{
      id: string;
      body: string;
      createdAt: string;
      user: { name: string };
    }>;
  };
}

interface GetIssueData {
  issue: IssueWithComments;
}

interface SearchIssueData {
  issues: { nodes: Array<{ id: string; identifier: string }> };
}

export async function handleLinearGetIssue(params: {
  identifier: string;
  include_comments?: boolean;
}) {
  const includeComments = params.include_comments !== false;

  // Resolve identifier to ID — Linear GraphQL uses issue() by ID
  // First search by identifier
  const searchData = await linearQuery<SearchIssueData>(
    `query($filter: IssueFilter) {
      issues(filter: $filter, first: 1) {
        nodes { id identifier }
      }
    }`,
    { filter: { identifier: { eq: params.identifier.toUpperCase() } } }
  );

  const found = searchData.issues.nodes[0];
  if (!found) {
    throw new McpToolError({
      code: ErrorCode.NOT_FOUND,
      toolName: "linear",
      message: `Issue "${params.identifier}" not found`,
      userMessage: `No Linear issue found with identifier "${params.identifier}".`,
      retryable: false,
    });
  }

  const data = await linearQuery<GetIssueData>(
    `query($id: String!) {
      issue(id: $id) {
        id identifier title description priority priorityLabel
        state { name type }
        team { key name }
        assignee { name email }
        labels { nodes { name } }
        createdAt updatedAt url
        comments {
          nodes {
            id body createdAt
            user { name }
          }
        }
      }
    }`,
    { id: found.id }
  );

  const issue = data.issue;
  const sections: string[] = [formatLinearIssue(issue)];

  if (includeComments && issue.comments.nodes.length > 0) {
    sections.push("---");
    sections.push(`## Comments (${issue.comments.nodes.length})`);
    for (const c of issue.comments.nodes) {
      sections.push(`**${c.user.name}** on ${c.createdAt.slice(0, 10)}:\n${c.body}`);
    }
  }

  return {
    content: [{ type: "text" as const, text: sections.join("\n\n") }],
  };
}

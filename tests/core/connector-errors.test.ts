/**
 * Tests for per-connector structured error types (ERR-01..04).
 * Verifies that recovery hints flow through withLogging to the tool result.
 */
import { describe, it, expect, vi } from "vitest";

// Mock dependencies before imports
vi.mock("@/core/log-store", () => ({
  getLogStore: () => ({
    append: vi.fn().mockResolvedValue(undefined),
    recent: vi.fn().mockResolvedValue([]),
  }),
}));
vi.mock("@/core/tracing", () => ({
  startToolSpan: vi.fn().mockReturnValue({}),
  endToolSpan: vi.fn(),
}));

import { withLogging, getRecentLogs } from "@/core/logging";
import { McpToolError, ErrorCode } from "@/core/errors";
import {
  GoogleAuthError,
  GoogleRateLimitError,
  VaultNotFoundError,
  VaultAuthError,
  SlackRateLimitError,
  SlackAuthError,
  NotionAuthError,
  WebhookNotFoundError,
} from "@/core/connector-errors";
import type { ToolResult } from "@/core/types";

describe("connector-specific error classes", () => {
  it("GoogleAuthError has correct code and recovery", () => {
    const err = new GoogleAuthError("token expired");
    expect(err).toBeInstanceOf(McpToolError);
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    expect(err.recovery).toContain("GOOGLE_CLIENT_ID");
    expect(err.name).toBe("GoogleAuthError");
    expect(err.retryable).toBe(false);
  });

  it("GoogleRateLimitError is retryable with recovery hint", () => {
    const err = new GoogleRateLimitError("429 on calendar API");
    expect(err.code).toBe(ErrorCode.RATE_LIMITED);
    expect(err.retryable).toBe(true);
    expect(err.recovery).toContain("Wait");
  });

  it("VaultNotFoundError includes file path", () => {
    const err = new VaultNotFoundError("Daily/2024-01-01.md");
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.message).toContain("Daily/2024-01-01.md");
    expect(err.recovery).toContain("vault_list");
  });

  it("VaultAuthError has GitHub-specific recovery", () => {
    const err = new VaultAuthError("401 unauthorized");
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    expect(err.recovery).toContain("GITHUB_PAT");
  });

  it("SlackRateLimitError includes method name", () => {
    const err = new SlackRateLimitError("conversations.history");
    expect(err.code).toBe(ErrorCode.RATE_LIMITED);
    expect(err.message).toContain("conversations.history");
    expect(err.retryable).toBe(true);
    expect(err.recovery).toContain("per-method");
  });

  it("SlackAuthError references bot token", () => {
    const err = new SlackAuthError("token_revoked");
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    expect(err.recovery).toContain("SLACK_BOT_TOKEN");
  });

  it("NotionAuthError has Notion-specific recovery", () => {
    const err = new NotionAuthError("unauthorized");
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    expect(err.recovery).toContain("NOTION_API_KEY");
  });

  it("WebhookNotFoundError includes webhook ID", () => {
    const err = new WebhookNotFoundError("wh_abc123");
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.message).toContain("wh_abc123");
  });
});

describe("recovery hint flows through withLogging", () => {
  it("includes recovery in MCP error response", async () => {
    const handler = async (): Promise<ToolResult> => {
      throw new GoogleAuthError("refresh token expired");
    };

    const wrapped = withLogging("test_recovery", handler);
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.errorCode).toBe(ErrorCode.AUTH_FAILED);
    // The response text should contain the recovery hint
    const text = result.content[0].text;
    expect(text).toContain("Recovery:");
    expect(text).toContain("GOOGLE_CLIENT_ID");
  });

  it("logs recovery hint in ToolLog", async () => {
    const handler = async (): Promise<ToolResult> => {
      throw new VaultNotFoundError("test.md");
    };

    const wrapped = withLogging("test_vault_recovery", handler);
    await wrapped({});

    const logs = getRecentLogs(10);
    const log = logs.find((l) => l.tool === "test_vault_recovery");
    expect(log).toBeDefined();
    expect(log!.recovery).toContain("vault_list");
    expect(log!.errorCode).toBe(ErrorCode.NOT_FOUND);
  });

  it("base McpToolError without recovery omits hint", async () => {
    const handler = async (): Promise<ToolResult> => {
      throw new McpToolError({
        code: ErrorCode.TIMEOUT,
        toolName: "test",
        message: "timed out",
      });
    };

    const wrapped = withLogging("test_no_recovery", handler);
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).not.toContain("Recovery:");
  });
});

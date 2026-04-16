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
  it("GoogleAuthError has correct code and split recovery", () => {
    const err = new GoogleAuthError("token expired");
    expect(err).toBeInstanceOf(McpToolError);
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    // Generic recovery should NOT contain env var names
    expect(err.recovery).not.toContain("GOOGLE_CLIENT_ID");
    expect(err.recovery).toContain("dashboard");
    // Internal recovery should contain env var names
    expect(err.internalRecovery).toContain("GOOGLE_CLIENT_ID");
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

  it("VaultAuthError has GitHub-specific internalRecovery", () => {
    const err = new VaultAuthError("401 unauthorized");
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    expect(err.recovery).not.toContain("GITHUB_PAT");
    expect(err.recovery).toContain("dashboard");
    expect(err.internalRecovery).toContain("GITHUB_PAT");
  });

  it("SlackRateLimitError includes method name", () => {
    const err = new SlackRateLimitError("conversations.history");
    expect(err.code).toBe(ErrorCode.RATE_LIMITED);
    expect(err.message).toContain("conversations.history");
    expect(err.retryable).toBe(true);
    expect(err.recovery).toContain("per-method");
  });

  it("SlackAuthError has split recovery", () => {
    const err = new SlackAuthError("token_revoked");
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    expect(err.recovery).not.toContain("SLACK_BOT_TOKEN");
    expect(err.recovery).toContain("dashboard");
    expect(err.internalRecovery).toContain("SLACK_BOT_TOKEN");
  });

  it("NotionAuthError has split recovery", () => {
    const err = new NotionAuthError("unauthorized");
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    expect(err.recovery).not.toContain("NOTION_API_KEY");
    expect(err.recovery).toContain("dashboard");
    expect(err.internalRecovery).toContain("NOTION_API_KEY");
  });

  it("WebhookNotFoundError includes webhook ID", () => {
    const err = new WebhookNotFoundError("wh_abc123");
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.message).toContain("wh_abc123");
  });
});

describe("recovery hint flows through withLogging", () => {
  it("includes generic recovery in MCP response, not env var names", async () => {
    const handler = async (): Promise<ToolResult> => {
      throw new GoogleAuthError("refresh token expired");
    };

    const wrapped = withLogging("test_recovery", handler);
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.errorCode).toBe(ErrorCode.AUTH_FAILED);
    // The response text should contain the generic recovery hint
    const text = result.content[0].text;
    expect(text).toContain("Recovery:");
    expect(text).toContain("dashboard");
    // Must NOT leak env var names to the client
    expect(text).not.toContain("GOOGLE_CLIENT_ID");
    expect(text).not.toContain("GOOGLE_REFRESH_TOKEN");
  });

  it("logs recovery hint in ToolLog (internalRecovery when available)", async () => {
    const handler = async (): Promise<ToolResult> => {
      throw new VaultAuthError("401 unauthorized");
    };

    const wrapped = withLogging("test_vault_recovery", handler);
    await wrapped({});

    const logs = getRecentLogs(10);
    const log = logs.find((l) => l.tool === "test_vault_recovery");
    expect(log).toBeDefined();
    // Server-side log should contain the detailed internalRecovery
    expect(log!.recovery).toContain("GITHUB_PAT");
    expect(log!.errorCode).toBe(ErrorCode.AUTH_FAILED);
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

/**
 * Per-connector structured error classes.
 *
 * Each class extends McpToolError with a `recovery` hint that flows through
 * withLogging into the MCP error response, giving the LLM actionable guidance
 * on how to resolve the issue.
 */

import { McpToolError, ErrorCode } from "./errors";

// ── Google ──────────────────────────────────────────────────────────

export class GoogleAuthError extends McpToolError {
  constructor(message: string, opts?: { cause?: Error }) {
    super({
      code: ErrorCode.AUTH_FAILED,
      toolName: "google",
      message,
      userMessage: `Google authentication failed: ${message}`,
      retryable: false,
      cause: opts?.cause,
      recovery:
        "Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN env vars. " +
        "The refresh token may have expired — re-authorize via the OAuth flow in /config.",
    });
    this.name = "GoogleAuthError";
  }
}

export class GoogleRateLimitError extends McpToolError {
  constructor(message: string, opts?: { cause?: Error }) {
    super({
      code: ErrorCode.RATE_LIMITED,
      toolName: "google",
      message,
      userMessage: "Google API rate limit reached. Please try again in a moment.",
      retryable: true,
      cause: opts?.cause,
      recovery:
        "Wait 30-60 seconds before retrying. If this persists, reduce request frequency " +
        "or check Google Cloud Console for quota increases.",
    });
    this.name = "GoogleRateLimitError";
  }
}

// ── Vault ───────────────────────────────────────────────────────────

export class VaultNotFoundError extends McpToolError {
  constructor(path: string, opts?: { cause?: Error }) {
    super({
      code: ErrorCode.NOT_FOUND,
      toolName: "vault",
      message: `Note not found: ${path}`,
      userMessage: `The file "${path}" does not exist in the vault.`,
      retryable: false,
      cause: opts?.cause,
      recovery:
        "Verify the file path is correct. Use vault_list to browse available files, " +
        "or vault_search to find the note by content.",
    });
    this.name = "VaultNotFoundError";
  }
}

export class VaultAuthError extends McpToolError {
  constructor(message: string, opts?: { cause?: Error }) {
    super({
      code: ErrorCode.AUTH_FAILED,
      toolName: "vault",
      message,
      userMessage: `Vault authentication failed: ${message}`,
      retryable: false,
      cause: opts?.cause,
      recovery:
        "Check GITHUB_PAT env var. The token needs `repo` scope. " +
        "Generate a new token at https://github.com/settings/tokens if expired.",
    });
    this.name = "VaultAuthError";
  }
}

// ── Slack ────────────────────────────────────────────────────────────

export class SlackRateLimitError extends McpToolError {
  constructor(method: string, opts?: { cause?: Error; retryAfter?: number }) {
    const retryHint = opts?.retryAfter
      ? `Wait ${opts.retryAfter} seconds before retrying.`
      : "Wait 30-60 seconds before retrying.";
    super({
      code: ErrorCode.RATE_LIMITED,
      toolName: "slack",
      message: `Slack API rate limited on ${method}`,
      userMessage: `Slack rate limit reached on ${method}. ${retryHint}`,
      retryable: true,
      cause: opts?.cause,
      recovery:
        `${retryHint} Slack rate limits are per-method — other Slack tools may still work. ` +
        "Reduce request frequency if this happens repeatedly.",
    });
    this.name = "SlackRateLimitError";
  }
}

export class SlackAuthError extends McpToolError {
  constructor(slackError: string, opts?: { cause?: Error }) {
    super({
      code: ErrorCode.AUTH_FAILED,
      toolName: "slack",
      message: `Slack authentication failed: ${slackError}`,
      userMessage: `Slack authentication failed (${slackError}). Check your SLACK_BOT_TOKEN.`,
      retryable: false,
      cause: opts?.cause,
      recovery:
        "Check SLACK_BOT_TOKEN env var. The token may have been revoked — " +
        "re-install the Slack app or generate a new bot token at https://api.slack.com/apps.",
    });
    this.name = "SlackAuthError";
  }
}

// ── Notion ───────────────────────────────────────────────────────────

export class NotionAuthError extends McpToolError {
  constructor(message: string, opts?: { cause?: Error }) {
    super({
      code: ErrorCode.AUTH_FAILED,
      toolName: "notion",
      message,
      userMessage: `Notion authentication failed: ${message}`,
      retryable: false,
      cause: opts?.cause,
      recovery:
        "Check NOTION_API_KEY env var. Ensure the integration has access to the " +
        "relevant pages/databases in Notion's sharing settings.",
    });
    this.name = "NotionAuthError";
  }
}

// ── Webhook ──────────────────────────────────────────────────────────

export class WebhookNotFoundError extends McpToolError {
  constructor(webhookId: string, opts?: { cause?: Error }) {
    super({
      code: ErrorCode.NOT_FOUND,
      toolName: "webhook",
      message: `Webhook not found: ${webhookId}`,
      userMessage: `Webhook "${webhookId}" does not exist.`,
      retryable: false,
      cause: opts?.cause,
      recovery: "Verify the webhook ID. Use the admin dashboard to list registered webhooks.",
    });
    this.name = "WebhookNotFoundError";
  }
}

// ── Re-export convenience type for connector authors ────────────────

export type ConnectorErrorClass =
  | typeof GoogleAuthError
  | typeof GoogleRateLimitError
  | typeof VaultNotFoundError
  | typeof VaultAuthError
  | typeof SlackRateLimitError
  | typeof SlackAuthError
  | typeof NotionAuthError
  | typeof WebhookNotFoundError;

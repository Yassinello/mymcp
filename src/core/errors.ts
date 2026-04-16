/**
 * Structured error system for MyMCP tool handlers.
 * All packs should use McpToolError for machine-readable diagnostics.
 */

export const ErrorCode = {
  AUTH_FAILED: "AUTH_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  TIMEOUT: "TIMEOUT",
  INVALID_INPUT: "INVALID_INPUT",
  EXTERNAL_API_ERROR: "EXTERNAL_API_ERROR",
  NOT_FOUND: "NOT_FOUND",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export class McpToolError extends Error {
  readonly code: ErrorCodeType;
  readonly toolName: string;
  readonly userMessage: string;
  readonly retryable: boolean;
  /** Generic recovery hint safe to surface to the MCP client / LLM. */
  readonly recovery?: string;
  /**
   * Detailed recovery hint containing env var names or internal details.
   * Logged server-side only — never sent to the MCP client.
   */
  readonly internalRecovery?: string;

  constructor(opts: {
    code: ErrorCodeType;
    toolName: string;
    message: string;
    userMessage?: string;
    retryable?: boolean;
    cause?: Error;
    recovery?: string;
    internalRecovery?: string;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = "McpToolError";
    this.code = opts.code;
    this.toolName = opts.toolName;
    this.userMessage = opts.userMessage ?? opts.message;
    this.retryable = opts.retryable ?? false;
    this.recovery = opts.recovery;
    this.internalRecovery = opts.internalRecovery;
  }
}

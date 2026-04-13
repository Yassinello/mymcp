import { z } from "zod";

/**
 * Core types for MyMCP framework.
 * These are framework-level types — no instance-specific values.
 */

/** Result shape returned by all tool handlers — index signature for MCP SDK compatibility */
export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
  /** Machine-readable error code from McpToolError — present on error responses only */
  errorCode?: string;
}

/** Single tool definition — the unit of functionality.
 *
 * Stored heterogeneously inside `PackManifest.tools` so its handler takes
 * `Record<string, unknown>` and the schema is `z.ZodRawShape`. Tool authors
 * who want compile-time-typed `args` should reach for the generic
 * `defineTool()` helper below, which infers the exact args type from the
 * schema literal and widens back to this storage shape.
 */
export interface ToolDefinition {
  /** MCP tool name (e.g., "gmail_inbox") */
  name: string;
  /** MCP tool description shown to the LLM */
  description: string;
  /** Zod schema for input validation (shape passed to `z.object(...)`) */
  schema: z.ZodRawShape;
  /** Handler function */
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
  /** Short one-line summary (optional, for docs/dashboard) */
  summary?: string;
  /** Usage example (optional, for docs/dashboard) */
  example?: string;
  /** Deprecation notice — if set, tool is marked deprecated in dashboard + MCP description */
  deprecated?: string;
  /**
   * Write-side-effect flag. When true, the sandbox and dashboard require
   * explicit confirmation before invoking. Tool authors opt-in explicitly;
   * no name-based regex is used. Read-only tools should leave this unset.
   */
  destructive?: boolean;
}

/**
 * Typed tool definition input — used by `defineTool()` to give handler
 * authors compile-time-checked `args` inferred from the schema literal.
 */
export interface TypedToolDefinition<TSchema extends z.ZodRawShape> {
  name: string;
  description: string;
  schema: TSchema;
  handler: (args: z.infer<z.ZodObject<TSchema>>) => Promise<ToolResult>;
  summary?: string;
  example?: string;
  deprecated?: string;
  destructive?: boolean;
}

/**
 * Helper that infers TSchema from the given schema literal so handlers
 * get a fully-typed `args` parameter, while widening the result back to
 * the default `ToolDefinition` for storage in a pack's `tools` array.
 */
export function defineTool<TSchema extends z.ZodRawShape>(
  def: TypedToolDefinition<TSchema>
): ToolDefinition {
  return def as unknown as ToolDefinition;
}

/** Pack manifest — groups related tools */
export interface PackManifest {
  /** Pack identifier (e.g., "google", "vault") */
  id: string;
  /** Human-readable label (e.g., "Google Workspace") */
  label: string;
  /** Short description of what this pack provides */
  description: string;
  /**
   * Env vars that MUST be present to activate this pack (AND semantics).
   * For custom logic (OR semantics, at-least-one, etc.), use `isActive` instead.
   */
  requiredEnvVars: string[];
  /**
   * Optional custom activation predicate. If defined, it overrides the default
   * `requiredEnvVars` check. Receives the current process env and returns
   * `{ active: boolean, reason?: string }` — `reason` is shown on the dashboard
   * when the pack is inactive.
   */
  isActive?: (env: NodeJS.ProcessEnv) => { active: boolean; reason?: string };
  /** All tools in this pack */
  tools: ToolDefinition[];
  /** Optional async health check — verifies credentials actually work */
  diagnose?: () => Promise<{ ok: boolean; message: string }>;
  /**
   * Optional markdown guide shown in `/config → Packs` for per-pack credential
   * instructions that go beyond a simple key/value form (e.g., per-source
   * cookies for the paywall pack).
   */
  guide?: string;
}

/** Resolved state of a pack at runtime */
export interface PackState {
  manifest: PackManifest;
  enabled: boolean;
  reason: string;
}

/** Instance-level configuration from env vars */
export interface InstanceConfig {
  timezone: string;
  locale: string;
  displayName: string;
  contextPath: string;
}

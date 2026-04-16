/**
 * Per-tool enable/disable toggles via KV.
 *
 * Tools are enabled by default. Disabled tools have KV key
 * `tool:disabled:<toolName>` set to `"true"`. The transport
 * route checks this before registering each tool on the MCP server.
 *
 * Connector-level disable overrides: if a connector is disabled,
 * its tools are off regardless of per-tool toggle.
 */

import { getKVStore } from "./kv-store";
import { emit } from "./events";

const KEY_PREFIX = "tool:disabled:";

/** Check if a specific tool is disabled via KV. */
export async function isToolDisabled(toolName: string): Promise<boolean> {
  const kv = getKVStore();
  const val = await kv.get(`${KEY_PREFIX}${toolName}`);
  return val === "true";
}

/** Set or clear the disabled flag for a tool. Emits env.changed to invalidate registry. */
export async function setToolDisabled(toolName: string, disabled: boolean): Promise<void> {
  const kv = getKVStore();
  if (disabled) {
    await kv.set(`${KEY_PREFIX}${toolName}`, "true");
  } else {
    await kv.delete(`${KEY_PREFIX}${toolName}`);
  }
  emit("env.changed");
}

/** Get all disabled tool names. */
export async function getDisabledTools(): Promise<Set<string>> {
  const kv = getKVStore();
  const keys = await kv.list(KEY_PREFIX);
  const disabled = new Set<string>();
  for (const key of keys) {
    const toolName = key.slice(KEY_PREFIX.length);
    disabled.add(toolName);
  }
  return disabled;
}

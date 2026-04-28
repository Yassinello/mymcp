#!/usr/bin/env tsx
/**
 * scaffold-connector — DX-A-03 (v0.16 Phase 66)
 *
 * Generates the boilerplate for a new connector:
 *   - src/connectors/<id>/manifest.ts
 *   - src/connectors/<id>/tools/hello.ts (one example tool)
 *   - src/connectors/<id>/lib/.gitkeep
 *   - Patches src/core/registry.ts to add a ConnectorLoaderEntry
 *   - Appends required env-var stubs to .env.example
 *
 * Usage: npm run scaffold:connector -- <id> [--label "Display Name"] [--env VAR1,VAR2]
 *
 * Conventions:
 *   - id is lowercase, alphanumeric, no dashes (e.g. "stripe", "hubspot")
 *   - manifest exports the connector as `<id>Connector`
 *   - hello tool returns a static "ok" reply for smoke-testing
 */

import { promises as fs } from "node:fs";
import path from "node:path";

interface Args {
  id: string;
  label: string;
  envVars: string[];
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const id = positional[0];
  if (!id || !/^[a-z][a-z0-9]*$/.test(id)) {
    throw new Error(
      "Connector id must be lowercase alphanumeric (e.g. 'stripe', 'hubspot'). Got: " +
        (id ?? "<missing>")
    );
  }
  const labelIdx = argv.indexOf("--label");
  const label =
    labelIdx >= 0 && argv[labelIdx + 1] ? argv[labelIdx + 1]! : id[0]!.toUpperCase() + id.slice(1);
  const envIdx = argv.indexOf("--env");
  const envVars =
    envIdx >= 0 && argv[envIdx + 1]
      ? argv[envIdx + 1]!.split(",").map((s) => s.trim())
      : [`${id.toUpperCase()}_API_KEY`];
  return { id, label, envVars };
}

const MANIFEST_TPL = (a: Args) => `import type { ConnectorManifest } from "@/core/types";
import { helloSchema, handleHello } from "./tools/hello";

export const ${a.id}Connector: ConnectorManifest = {
  id: "${a.id}",
  label: "${a.label}",
  description: "${a.label} connector — TODO describe what this exposes.",
  requiredEnvVars: [${a.envVars.map((v) => `"${v}"`).join(", ")}],
  tools: [
    {
      name: "${a.id}_hello",
      description: "Smoke-test tool — returns 'ok'. Replace with real tools.",
      schema: helloSchema,
      handler: handleHello,
      destructive: false,
    },
  ],
};
`;

const TOOL_TPL = (a: Args) => `import { z } from "zod";

export const helloSchema = {
  name: z.string().optional().describe("Optional name to greet."),
};

export async function handleHello(params: { name?: string | undefined }) {
  return {
    content: [
      {
        type: "text" as const,
        text: \`Hello from ${a.id}\${params.name ? \`, \${params.name}\` : ""}!\`,
      },
    ],
  };
}
`;

const LOADER_TPL = (a: Args) => `  {
    id: "${a.id}",
    label: "${a.label}",
    description: "${a.label} connector — TODO describe what this exposes.",
    requiredEnvVars: [${a.envVars.map((v) => `"${v}"`).join(", ")}],
    toolCount: 1,
    loader: () => import("@/connectors/${a.id}/manifest").then((m) => m.${a.id}Connector),
  },
`;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const dir = path.join(root, "src", "connectors", args.id);

  if (await exists(dir)) {
    throw new Error(`Connector directory already exists: ${dir}`);
  }

  await fs.mkdir(path.join(dir, "tools"), { recursive: true });
  await fs.mkdir(path.join(dir, "lib"), { recursive: true });
  await fs.writeFile(path.join(dir, "manifest.ts"), MANIFEST_TPL(args));
  await fs.writeFile(path.join(dir, "tools", "hello.ts"), TOOL_TPL(args));
  await fs.writeFile(path.join(dir, "lib", ".gitkeep"), "");

  // Patch registry: insert before the closing `];` of ALL_CONNECTOR_LOADERS.
  const registryPath = path.join(root, "src", "core", "registry.ts");
  const registry = await fs.readFile(registryPath, "utf8");
  const marker = "export const ALL_CONNECTOR_LOADERS: ConnectorLoaderEntry[] = [";
  const start = registry.indexOf(marker);
  if (start < 0) {
    throw new Error("Could not find ALL_CONNECTOR_LOADERS in registry.ts");
  }
  // Find matching `];` after the marker.
  let depth = 0;
  let endIdx = -1;
  for (let i = start + marker.length; i < registry.length; i++) {
    if (registry[i] === "[") depth++;
    else if (registry[i] === "]") {
      if (depth === 0) {
        endIdx = i;
        break;
      }
      depth--;
    }
  }
  if (endIdx < 0) throw new Error("Could not find end of ALL_CONNECTOR_LOADERS array");
  const before = registry.slice(0, endIdx);
  const after = registry.slice(endIdx);
  await fs.writeFile(registryPath, before + LOADER_TPL(args) + after);

  // Append env-var stubs to .env.example (de-duped).
  // Validate env var names first — prevents ReDoS on user input + matches
  // the POSIX env-var name shape so we don't write garbage to .env.example.
  const ENV_VAR_RE = /^[A-Z_][A-Z0-9_]*$/;
  for (const v of args.envVars) {
    if (!ENV_VAR_RE.test(v)) {
      throw new Error(
        `Invalid env var name: ${JSON.stringify(v)}. Must match ${ENV_VAR_RE} (e.g. STRIPE_API_KEY).`
      );
    }
  }
  const envPath = path.join(root, ".env.example");
  const env = (await exists(envPath)) ? await fs.readFile(envPath, "utf8") : "";
  // String-based dedup: split into lines, check prefix. No RegExp on user input.
  const existingLines = new Set(env.split(/\r?\n/).map((l) => l.split("=")[0]?.trim() ?? ""));
  const additions: string[] = [];
  for (const v of args.envVars) {
    if (!existingLines.has(v)) additions.push(`${v}=`);
  }
  if (additions.length > 0) {
    const updated =
      env.trimEnd() +
      `\n\n# ${args.label} (auto-added by scaffold-connector)\n` +
      additions.join("\n") +
      "\n";
    await fs.writeFile(envPath, updated);
  }

  console.log(`✓ Scaffolded connector: ${args.id}`);
  console.log(`  Files:`);
  console.log(`    src/connectors/${args.id}/manifest.ts`);
  console.log(`    src/connectors/${args.id}/tools/hello.ts`);
  console.log(`  Registry: ALL_CONNECTOR_LOADERS entry added`);
  if (additions.length > 0) console.log(`  .env.example: added ${additions.length} stub(s)`);
  console.log(`\nNext: edit manifest.ts to add real tools, run \`npm run typecheck\`.`);
}

main().catch((err: unknown) => {
  console.error("✗ scaffold-connector failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Kebab MCP Backup CLI — export / import KV store data.
 *
 * Usage:
 *   npx tsx scripts/backup.ts export          → JSON to stdout
 *   npx tsx scripts/backup.ts import backup.json  → reads file, writes to KV
 */

import { promises as fs } from "node:fs";

// Shared logic is extracted so admin tools can reuse it.
import { exportBackup, importBackup, BACKUP_VERSION } from "../src/core/backup";

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "export") {
    const data = await exportBackup();
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    process.exit(0);
  }

  if (command === "import") {
    // Parse optional --mode=replace|merge flag
    let filePath: string | undefined;
    let mode: "merge" | "replace" = "merge";
    for (const arg of rest) {
      if (arg.startsWith("--mode=")) {
        const val = arg.slice(7);
        if (val === "replace" || val === "merge") mode = val;
        else {
          console.error(`Invalid mode: ${val}. Use "merge" or "replace".`);
          process.exit(1);
        }
      } else {
        filePath = arg;
      }
    }
    if (!filePath) {
      console.error("Usage: npx tsx scripts/backup.ts import <file.json> [--mode=merge|replace]");
      process.exit(1);
    }
    const raw = await fs.readFile(filePath, "utf-8");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error("Error: invalid JSON in", filePath);
      process.exit(1);
    }
    const result = await importBackup(data, { mode });
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  }

  console.error(`Unknown command: ${command}`);
  console.error("Usage: npx tsx scripts/backup.ts <export|import> [file] [--mode=merge|replace]");
  console.error(`Backup format version: ${BACKUP_VERSION}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

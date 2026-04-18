#!/usr/bin/env node

// create-kebab-mcp — Interactive installer for Kebab MCP
// Usage: npx @yassinello/create-kebab-mcp@latest

import { spawnSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readdirSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";

// ── Helpers ──────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

const log = (msg) => console.log(msg);
const step = (n, msg) => log(`\n${CYAN}[${n}]${RESET} ${BOLD}${msg}${RESET}`);
const ok = (msg) => log(`  ${GREEN}✓${RESET} ${msg}`);
const warn = (msg) => log(`  ${YELLOW}!${RESET} ${msg}`);
const info = (msg) => log(`  ${DIM}${msg}${RESET}`);

function openBrowserUrl(url) {
  const cmd =
    process.platform === "win32"
      ? "start"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  spawnSync(cmd, [url], { shell: true, stdio: "ignore" });
}

function cleanPath(input) {
  return input.trim().replace(/^["']|["']$/g, "");
}

function isDirNonEmpty(dir) {
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}


// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  log("");
  log(`${BOLD}  ╔══════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}  ║       ${CYAN}create-kebab-mcp${RESET}${BOLD}                   ║${RESET}`);
  log(`${BOLD}  ║  Your personal AI backend in minutes     ║${RESET}`);
  log(`${BOLD}  ╚══════════════════════════════════════════╝${RESET}`);

  // ── Step 1: Project directory ────────────────────────────────────

  step("1/3", "Project setup");
  info("Just type a folder name, or a full path.");

  const rawInput = (await ask(`  Project directory [mymcp]: `)).trim();
  const cleaned = cleanPath(rawInput) || "mymcp";
  const projectDir = isAbsolute(cleaned) ? cleaned : resolve(cleaned);
  const projectName = projectDir.split(/[/\\]/).pop();

  if (existsSync(projectDir) && isDirNonEmpty(projectDir)) {
    log(`  ${RED}✗${RESET} Directory "${projectDir}" already exists and is not empty.`);
    rl.close();
    process.exit(1);
  }

  info(`Will create: ${projectDir}`);

  // ── Step 2: Clone ────────────────────────────────────────────────

  step("2/3", "Cloning Kebab MCP");

  const cloneResult = spawnSync(
    "git",
    ["clone", "https://github.com/Yassinello/mymcp.git", projectDir],
    { stdio: "inherit" }
  );

  if (cloneResult.status !== 0) {
    log(`  ${RED}✗${RESET} Clone failed. Is git installed?`);
    rl.close();
    process.exit(1);
  }

  // Set up upstream for updates
  spawnSync("git", ["-C", projectDir, "remote", "rename", "origin", "upstream"], {
    stdio: "pipe",
  });
  ok("Cloned and upstream remote configured");

  // ── Step 3: Install + Launch Setup Wizard ────────────────────────

  step("3/3", "Installing & launching setup wizard");

  log("");
  info("Installing dependencies (this takes ~1 minute)...");
  const installResult = spawnSync("npm", ["install", "--loglevel=error"], {
    cwd: projectDir,
    stdio: "inherit",
    shell: true,
  });

  if (installResult.status !== 0) {
    warn("npm install failed — try running it manually:");
    log(`  ${CYAN}cd ${projectName} && npm install${RESET}`);
    rl.close();
    process.exit(1);
  }
  ok("Dependencies installed");

  // Start dev server in background
  log("");
  info("Starting dev server...");

  const devServer = spawn("npm", ["run", "dev"], {
    cwd: projectDir,
    shell: true,
    stdio: "pipe",
    detached: true,
  });

  // Wait for the server to be ready
  let serverReady = false;
  const startTime = Date.now();

  while (!serverReady && Date.now() - startTime < 30000) {
    try {
      const res = await fetch("http://localhost:3000/api/health");
      if (res.ok) serverReady = true;
    } catch {
      // Not ready yet
    }
    if (!serverReady) await new Promise((r) => setTimeout(r, 1000));
  }

  if (serverReady) {
    ok("Dev server running at http://localhost:3000");

    // Open setup wizard in browser
    log("");
    info("Opening setup wizard in your browser...");
    openBrowserUrl("http://localhost:3000/setup");

    log("");
    log(`${BOLD}  ╔══════════════════════════════════════════╗${RESET}`);
    log(`${BOLD}  ║     ${GREEN}Complete the setup in your browser${RESET}${BOLD}    ║${RESET}`);
    log(`${BOLD}  ╚══════════════════════════════════════════╝${RESET}`);
    log("");
    log(`  ${BOLD}Setup wizard:${RESET} ${CYAN}http://localhost:3000/setup${RESET}`);
    log("");
    log(`  ${DIM}The wizard will help you:${RESET}`);
    log(`  ${DIM}  1. Choose your tool packs${RESET}`);
    log(`  ${DIM}  2. Enter credentials (with live testing)${RESET}`);
    log(`  ${DIM}  3. Configure your instance${RESET}`);
    log(`  ${DIM}  4. Save your .env file${RESET}`);
    log("");
    log(`  ${DIM}Press Ctrl+C to stop the dev server when done.${RESET}`);
    log(`  ${DIM}Run ${CYAN}npm run update${RESET}${DIM} anytime to pull updates.${RESET}`);
    log("");

    // Keep process alive while server runs
    devServer.unref();
  } else {
    warn("Server didn't start in time. Start it manually:");
    log(`  ${CYAN}cd ${projectName} && npm run dev${RESET}`);
    log(`  Then open: ${CYAN}http://localhost:3000/setup${RESET}`);
    devServer.kill();
  }

  rl.close();
}

main().catch((err) => {
  console.error(`\n${RED}Error:${RESET} ${err.message}`);
  rl.close();
  process.exit(1);
});

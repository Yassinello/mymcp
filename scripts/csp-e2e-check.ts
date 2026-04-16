/**
 * TECH-01 — CSP nonce e2e test.
 *
 * Builds the app (if not already built), starts `next start` on a
 * random port, fetches an auth-gated page, and asserts:
 * 1. The response HTML contains `<script nonce="..."`.
 * 2. The `Content-Security-Policy` header contains the same nonce.
 *
 * Run: npx tsx scripts/csp-e2e-check.ts
 * Or:  npm run test:csp-e2e
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const NEXT_DIR = path.join(ROOT, ".next");

// ── Helpers ───────────────────────────────────────────────────────────

function getRandomPort(): number {
  return 30000 + Math.floor(Math.random() * 20000);
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

function killTree(proc: ChildProcess) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    // already dead
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  // 1. Build check
  if (!existsSync(NEXT_DIR)) {
    console.log("[CSP-E2E] No .next/ found — building...");
    execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  } else {
    console.log("[CSP-E2E] .next/ exists — skipping build.");
  }

  const port = getRandomPort();
  const adminToken = process.env.MCP_AUTH_TOKEN || "csp-e2e-test-token-1234567890";
  const baseUrl = `http://127.0.0.1:${port}`;

  // 2. Start next
  console.log(`[CSP-E2E] Starting next on port ${port}...`);
  const server: ChildProcess = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      MCP_AUTH_TOKEN: adminToken,
      NODE_ENV: "production",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  // Collect stderr for diagnostics
  let stderr = "";
  server.stderr?.on("data", (d: Buffer) => {
    stderr += d.toString();
  });

  let passed = false;
  try {
    await waitForServer(`${baseUrl}/api/health`);
    console.log("[CSP-E2E] Server is up.");

    // 3. Fetch an auth-gated page with the admin token
    const res = await fetch(`${baseUrl}/config?token=${adminToken}`, {
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`Fetch /config returned ${res.status}: ${await res.text().catch(() => "")}`);
    }

    const html = await res.text();
    const csp = res.headers.get("Content-Security-Policy");

    // 4. Assert HTML contains <script nonce="..."
    const scriptNonceMatch = html.match(/<script[^>]+nonce="([^"]+)"/);
    if (!scriptNonceMatch) {
      throw new Error('FAIL: HTML does not contain <script nonce="...">');
    }
    const htmlNonce = scriptNonceMatch[1];
    console.log(`[CSP-E2E] Found nonce in HTML: ${htmlNonce.slice(0, 8)}...`);

    // 5. Assert CSP header contains the same nonce
    if (!csp) {
      throw new Error("FAIL: No Content-Security-Policy header in response");
    }
    const cspNonceMatch = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/);
    if (!cspNonceMatch) {
      throw new Error("FAIL: CSP header does not contain nonce");
    }
    const cspNonce = cspNonceMatch[1];
    console.log(`[CSP-E2E] Found nonce in CSP: ${cspNonce.slice(0, 8)}...`);

    if (htmlNonce !== cspNonce) {
      throw new Error(`FAIL: Nonce mismatch — HTML="${htmlNonce}" vs CSP="${cspNonce}"`);
    }

    console.log("[CSP-E2E] PASS: HTML nonce matches CSP header nonce.");
    passed = true;
  } catch (err) {
    console.error("[CSP-E2E]", err instanceof Error ? err.message : String(err));
    if (stderr) console.error("[CSP-E2E] Server stderr:\n", stderr.slice(-500));
    process.exitCode = 1;
  } finally {
    // 6. Kill server
    killTree(server);
    console.log(`[CSP-E2E] ${passed ? "All checks passed." : "FAILED."}`);
  }
}

main();

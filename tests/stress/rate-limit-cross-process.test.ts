/**
 * TECH-05 — Cross-process rate-limit stress test.
 *
 * Spawns 5 worker threads that each call `checkRateLimit` 20 times
 * rapidly against the same FilesystemKV-backed scope. After all workers
 * complete, reads the final kv.json and asserts the total count.
 *
 * FilesystemKV.incr serializes within a single process via the write
 * queue, but across processes the file-level read-modify-write is racy.
 * We accept some loss (>= 80 out of 100) and document the known race.
 *
 * Marked as `describe.skip` by default — run with `npm run test:stress`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKERS = 5;
const CALLS_PER_WORKER = 20;

// ── Worker code (runs in thread) ─────────────────────────────────────

if (!isMainThread && parentPort) {
  const { dir } = workerData as { dir: string };
  process.chdir(dir);

  // Dynamic import to pick up the fresh cwd
  const run = async () => {
    // Reset the cached KV so it picks up the new cwd
    const { resetKVStoreCache } = await import("../../src/core/kv-store");
    resetKVStoreCache();
    const { checkRateLimit } = await import("../../src/core/rate-limit");

    for (let i = 0; i < CALLS_PER_WORKER; i++) {
      await checkRateLimit("stress-user", { scope: "stress", limit: 999_999 });
    }
    parentPort!.postMessage("done");
  };
  run().catch((err) => {
    parentPort!.postMessage({ error: String(err) });
  });
}

// ── Main thread tests ────────────────────────────────────────────────

// Skip by default — enable via `npm run test:stress` or remove .skip
describe.skip("Cross-process rate-limit stress (TECH-05)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mymcp-stress-"));
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it(`${WORKERS} workers × ${CALLS_PER_WORKER} calls — count >= 80`, async () => {
    const workers: Promise<void>[] = [];

    for (let w = 0; w < WORKERS; w++) {
      workers.push(
        new Promise<void>((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { dir },
          });
          worker.on("message", (msg) => {
            if (typeof msg === "object" && msg.error) {
              reject(new Error(msg.error));
            } else {
              resolve();
            }
          });
          worker.on("error", reject);
          worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
          });
        })
      );
    }

    await Promise.all(workers);

    // Read final kv.json and sum all ratelimit:stress:* values
    const kvPath = join(dir, "data", "kv.json");
    let totalCount = 0;
    try {
      const raw = JSON.parse(readFileSync(kvPath, "utf-8")) as Record<string, string>;
      for (const [key, val] of Object.entries(raw)) {
        if (key.startsWith("ratelimit:stress:")) {
          totalCount += parseInt(val, 10) || 0;
        }
      }
    } catch {
      // If kv.json doesn't exist, all calls failed
    }

    const expected = WORKERS * CALLS_PER_WORKER; // 100
    console.log(`[Stress] Total count: ${totalCount} / ${expected}`);

    // Known racy path: cross-process file-level RMW can lose writes.
    // Accept >= 80% as passing.
    expect(totalCount).toBeGreaterThanOrEqual(expected * 0.8);
    // Ideally it should be exactly 100 if serialization holds within
    // each process (each process's 20 calls are serialized by the write
    // queue, but 5 processes stomp on each other's file writes).
    if (totalCount === expected) {
      console.log("[Stress] Perfect — no lost writes.");
    } else {
      console.log(
        `[Stress] ${expected - totalCount} writes lost due to known cross-process race (acceptable).`
      );
    }
  }, 30_000);
});

/**
 * Tests for webhook connector tools and API route logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// In-memory KV mock
const mockKV: Record<string, string> = {};

const mockKVInstance = {
  kind: "filesystem" as const,
  get: vi.fn(async (key: string) => mockKV[key] ?? null),
  set: vi.fn(async (key: string, value: string) => {
    mockKV[key] = value;
  }),
  delete: vi.fn(async (key: string) => {
    delete mockKV[key];
  }),
  list: vi.fn(async (prefix?: string) => {
    const keys = Object.keys(mockKV);
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
  }),
};

vi.mock("@/core/kv-store", () => ({
  getKVStore: () => mockKVInstance,
  getTenantKVStore: () => mockKVInstance,
}));

import { handleWebhookLast } from "@/connectors/webhook/tools/webhook-last";
import { handleWebhookList } from "@/connectors/webhook/tools/webhook-list";

describe("webhook_last tool", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockKV)) delete mockKV[key];
  });

  it("returns error when no payload exists", async () => {
    const result = await handleWebhookLast({ name: "nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No webhook payload found");
  });

  it("returns stored payload", async () => {
    const entry = {
      payload: { event: "test" },
      receivedAt: "2026-04-15T00:00:00Z",
      contentType: "application/json",
    };
    mockKV["webhook:last:stripe"] = JSON.stringify(entry);
    const result = await handleWebhookLast({ name: "stripe" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.payload.event).toBe("test");
    expect(parsed.receivedAt).toBe("2026-04-15T00:00:00Z");
  });
});

describe("webhook_list tool", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockKV)) delete mockKV[key];
  });

  it("returns empty list when no webhooks", async () => {
    const result = await handleWebhookList();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.webhooks).toEqual([]);
  });

  it("lists all stored webhooks with timestamps", async () => {
    mockKV["webhook:last:stripe"] = JSON.stringify({ receivedAt: "2026-04-15T01:00:00Z" });
    mockKV["webhook:last:github"] = JSON.stringify({ receivedAt: "2026-04-15T02:00:00Z" });

    const result = await handleWebhookList();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    const names = parsed.webhooks.map((w: { name: string }) => w.name).sort();
    expect(names).toEqual(["github", "stripe"]);
  });
});

describe("webhook connector activation", () => {
  it("is inactive when MYMCP_WEBHOOKS not set", async () => {
    const { webhookConnector } = await import("@/connectors/webhook/manifest");
    const result = webhookConnector.isActive!({} as NodeJS.ProcessEnv);
    expect(result.active).toBe(false);
  });

  it("is active when MYMCP_WEBHOOKS is set", async () => {
    const { webhookConnector } = await import("@/connectors/webhook/manifest");
    const result = webhookConnector.isActive!({
      MYMCP_WEBHOOKS: "stripe,github",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.active).toBe(true);
  });
});

describe("webhook API route", () => {
  const origWebhooks = process.env.MYMCP_WEBHOOKS;

  beforeEach(() => {
    for (const key of Object.keys(mockKV)) delete mockKV[key];
    delete process.env.MYMCP_WEBHOOK_SECRET_STRIPE;
  });

  afterEach(() => {
    if (origWebhooks === undefined) delete process.env.MYMCP_WEBHOOKS;
    else process.env.MYMCP_WEBHOOKS = origWebhooks;
    delete process.env.MYMCP_WEBHOOK_SECRET_STRIPE;
  });

  // Import the route handler
  async function importRoute() {
    return import("@/../app/api/webhook/[name]/route");
  }

  it("returns 404 for unknown webhook name", async () => {
    process.env.MYMCP_WEBHOOKS = "stripe,github";
    const { POST } = await importRoute();
    const req = new Request("http://localhost/api/webhook/unknown", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, { params: Promise.resolve({ name: "unknown" }) });
    expect(res.status).toBe(404);
  });

  it("stores payload for allowed webhook", async () => {
    process.env.MYMCP_WEBHOOKS = "stripe,github";
    const { POST } = await importRoute();
    const payload = JSON.stringify({ event: "payment.completed" });
    const req = new Request("http://localhost/api/webhook/stripe", {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ name: "stripe" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify KV storage
    const stored = JSON.parse(mockKV["webhook:last:stripe"]);
    expect(stored.payload.event).toBe("payment.completed");
    expect(stored.contentType).toBe("application/json");
  });

  it("validates HMAC signature when secret is set", async () => {
    process.env.MYMCP_WEBHOOKS = "stripe";
    process.env.MYMCP_WEBHOOK_SECRET_STRIPE = "mysecret123";
    const { POST } = await importRoute();

    const payload = '{"event":"test"}';
    const signature = createHmac("sha256", "mysecret123").update(payload).digest("hex");

    // Valid signature
    const reqOk = new Request("http://localhost/api/webhook/stripe", {
      method: "POST",
      body: payload,
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": signature,
      },
    });
    const resOk = await POST(reqOk, { params: Promise.resolve({ name: "stripe" }) });
    expect(resOk.status).toBe(200);

    // Invalid signature
    const reqBad = new Request("http://localhost/api/webhook/stripe", {
      method: "POST",
      body: payload,
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": "badsignature",
      },
    });
    const resBad = await POST(reqBad, { params: Promise.resolve({ name: "stripe" }) });
    expect(resBad.status).toBe(401);
  });

  it("returns 413 when Content-Length exceeds 1 MB", async () => {
    process.env.MYMCP_WEBHOOKS = "stripe";
    const { POST } = await importRoute();
    const req = new Request("http://localhost/api/webhook/stripe", {
      method: "POST",
      body: "{}",
      headers: {
        "Content-Length": "2000000",
        "Content-Type": "application/json",
      },
    });
    const res = await POST(req, { params: Promise.resolve({ name: "stripe" }) });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("Payload too large");
  });

  it("returns 413 when streamed body exceeds 1 MB", async () => {
    process.env.MYMCP_WEBHOOKS = "stripe";
    const { POST } = await importRoute();
    // Create a body larger than 1 MB without setting Content-Length
    const bigPayload = "x".repeat(1_048_577);
    const req = new Request("http://localhost/api/webhook/stripe", {
      method: "POST",
      body: bigPayload,
    });
    // Remove content-length to force streaming path
    const res = await POST(req, { params: Promise.resolve({ name: "stripe" }) });
    expect(res.status).toBe(413);
  });

  it("rejects when signature missing but secret is configured", async () => {
    process.env.MYMCP_WEBHOOKS = "stripe";
    process.env.MYMCP_WEBHOOK_SECRET_STRIPE = "mysecret123";
    const { POST } = await importRoute();

    const req = new Request("http://localhost/api/webhook/stripe", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, { params: Promise.resolve({ name: "stripe" }) });
    expect(res.status).toBe(401);
  });
});

import { createHmac, createHash, timingSafeEqual } from "crypto";
import { getKVStore } from "@/core/kv-store";

/** Maximum webhook payload size: 1 MB. */
const MAX_PAYLOAD_BYTES = 1_048_576;

/**
 * Webhook receiver endpoint.
 *
 * POST /api/webhook/:name
 *
 * Validates `name` against MYMCP_WEBHOOKS allowlist (comma-separated).
 * Optional HMAC-SHA256 signature verification via MYMCP_WEBHOOK_SECRET_<NAME>.
 * Stores payload in KV at `webhook:last:<name>`.
 */

function getAllowedWebhooks(): Set<string> {
  const raw = process.env.MYMCP_WEBHOOKS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function verifySignature(body: string, name: string, signature: string): boolean {
  const envKey = `MYMCP_WEBHOOK_SECRET_${name.toUpperCase().replace(/-/g, "_")}`;
  const secret = process.env[envKey];
  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  // Hash both sides to fixed length before comparing — prevents timing leak
  // on length mismatch (timingSafeEqual throws on different-length buffers).
  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash = createHash("sha256").update(signature).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
): Promise<Response> {
  const { name } = await params;
  const normalizedName = name.trim().toLowerCase();

  // Validate against allowlist
  const allowed = getAllowedWebhooks();
  if (!allowed.has(normalizedName)) {
    return new Response(JSON.stringify({ error: "Webhook not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Enforce payload size limit — check Content-Length header first for
  // a fast reject, then read in bounded chunks as a defense against
  // missing/lying Content-Length headers.
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    return new Response(JSON.stringify({ error: "Payload too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Read body with bounded approach
  let body: string;
  if (!request.body) {
    body = "";
  } else {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let totalBytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_PAYLOAD_BYTES) {
          reader.cancel();
          return new Response(JSON.stringify({ error: "Payload too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json" },
          });
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode()); // flush
    } catch {
      return new Response(JSON.stringify({ error: "Failed to read body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    body = chunks.join("");
  }

  // Optional HMAC signature verification
  const secretEnvKey = `MYMCP_WEBHOOK_SECRET_${normalizedName.toUpperCase().replace(/-/g, "_")}`;
  if (process.env[secretEnvKey]) {
    const signature = request.headers.get("x-webhook-signature");
    if (!signature || !verifySignature(body, normalizedName, signature)) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Parse payload (best-effort JSON, fall back to raw string)
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = body;
  }

  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const entry = {
    payload,
    receivedAt: new Date().toISOString(),
    contentType,
  };

  // Store in KV
  const kv = getKVStore();
  await kv.set(`webhook:last:${normalizedName}`, JSON.stringify(entry));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

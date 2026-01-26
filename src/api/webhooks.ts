import { Router, Request, Response } from "express";
import crypto from "crypto";
import { withQueueConnection } from "../db/redis";
import { webhookQueue } from "../queue/webhook.queue";

export const webhooksRouter = Router();

function getProviderSecret(provider: string): string | null {
  const key = `WEBHOOK_SECRET_${provider.toUpperCase()}`;
  return process.env[key] || null;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Generic signed webhook endpoint.
// Headers:
// - x-webhook-event-id: provider event id (required)
// - x-webhook-timestamp: unix ms or seconds (required)
// - x-webhook-signature: hex HMAC-SHA256 over "{timestamp}.{rawBody}" (required)
// Signature secret: WEBHOOK_SECRET_<PROVIDER>
webhooksRouter.post("/webhooks/:provider", async (req: Request, res: Response) => {
  const provider = String(req.params.provider || "").trim();
  if (!provider) return res.status(400).json({ error: "provider required" });

  const secret = getProviderSecret(provider);
  if (!secret) return res.status(500).json({ error: `Missing secret for provider: ${provider}` });

  const eventId = String(req.header("x-webhook-event-id") || "").trim();
  const timestampRaw = String(req.header("x-webhook-timestamp") || "").trim();
  const signature = String(req.header("x-webhook-signature") || "").trim();

  if (!eventId || !timestampRaw || !signature) {
    return res.status(400).json({ error: "Missing required webhook headers" });
  }

  const timestampNum = Number(timestampRaw);
  if (!Number.isFinite(timestampNum)) {
    return res.status(400).json({ error: "Invalid timestamp" });
  }

  // Allow seconds or ms.
  const timestampMs = timestampNum < 10_000_000_000 ? timestampNum * 1000 : timestampNum;
  if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return res.status(401).json({ error: "Timestamp outside allowed window" });
  }

  const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  const base = `${timestampRaw}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(base).digest("hex");

  if (!safeEqual(expected, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Idempotency (1 hour)
  const dedupeKey = `webhook:${provider}:${eventId}`;
  const setResult = await withQueueConnection((redis) =>
    (redis as unknown as { set: (...args: Array<string | number>) => Promise<string | null> }).set(
      dedupeKey,
      "1",
      "NX",
      "EX",
      3600,
    ),
  );
  if (setResult !== "OK") {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  // Fast ACK
  res.status(200).json({ ok: true });

  // Async processing (do not block webhook response)
  void webhookQueue.enqueueWebhook({
    provider,
    eventId,
    timestamp: timestampMs,
    headers: req.headers,
    body: req.body,
  });

  return;
});

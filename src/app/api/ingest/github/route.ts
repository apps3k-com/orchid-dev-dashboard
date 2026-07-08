import { getAppConfig } from "@/server/config";
import { enqueueIngestGithub } from "@/server/jobs/enqueue";
import { verifyGithubSignature } from "@/server/signals/github";

// HMAC verification needs node:crypto.
export const runtime = "nodejs";

/**
 * GitHub webhook receiver (event spine ingress). Verifies the `X-Hub-Signature-256` HMAC
 * against the stored App webhook secret, then answers 200 immediately and defers all work to
 * the `ingest:github` worker job — GitHub expects a fast response. Idempotency: the delivery
 * GUID keys both the job (`jobKey`) and the resulting Signal (`dedupeKey`), so redeliveries
 * no-op instead of duplicating.
 */
export async function POST(req: Request): Promise<Response> {
  const config = await getAppConfig();
  const secret = config?.webhookSecret;
  if (!secret) return new Response("Webhook secret is not configured.", { status: 503 });

  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature || !verifyGithubSignature(secret, body, signature)) {
    return new Response("Invalid signature.", { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  const deliveryId = req.headers.get("x-github-delivery");
  if (!event || !deliveryId) return new Response("Missing webhook headers.", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON payload.", { status: 400 });
  }

  // A 5xx makes GitHub retry the delivery instead of silently dropping a verified event
  // (the webhook secret can come purely from env, so the DB may be absent independently).
  const enqueued = await enqueueIngestGithub(deliveryId, event, payload);
  if (!enqueued) return new Response("Ingest queue is not configured.", { status: 503 });
  return Response.json({ ok: true });
}

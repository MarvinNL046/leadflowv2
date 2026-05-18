import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// ════════════════════════════════════════════════════════════════════
// META LEAD ADS WEBHOOK
// ════════════════════════════════════════════════════════════════════
//
// GET  /webhooks/meta — verify-challenge handshake (één-keer bij setup)
// POST /webhooks/meta — leadgen events; signature-verified via HMAC-SHA256
//
// Env-vars (zet via `npx convex env set NAAM=value`):
//   META_APP_SECRET             — voor X-Hub-Signature-256 HMAC verify
//   META_WEBHOOK_VERIFY_TOKEN   — random hex string, ook in Meta dashboard
//
// V2 MVP-scope: één org (Staycool), één page-token in env. Multi-page
// rotation + token-encryption komt later. Voor nu landt elke binnenkomende
// lead in Staycool's metaLeadRaw + wordt door de processor afgehandeld.

http.route({
  path: "/webhooks/meta",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!expected) {
      return new Response("Server misconfigured: missing verify token", {
        status: 500,
      });
    }

    if (mode === "subscribe" && token === expected && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }),
});

http.route({
  path: "/webhooks/meta",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    // Lees rawBody als string — exact zoals ontvangen voor HMAC-verify.
    // (request.text() consumeert de body; daarna parsen we 'm zelf.)
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("x-hub-signature-256");

    if (!signatureHeader || !(await isValidSignature(rawBody, signatureHeader, appSecret))) {
      console.warn("[meta-webhook] invalid signature");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    // Meta stuurt alleen object="page" voor lead-ads webhooks.
    if (payload.object !== "page") {
      return jsonResponse({ received: true, ignored: payload.object }, 200);
    }

    const orgId = await ctx.runQuery(
      internal.metaIngest.getStaycoolOrgIdInternal,
      {},
    );
    if (!orgId) {
      console.error("[meta-webhook] Staycool org niet gevonden in Convex");
      return jsonResponse({ error: "Org not provisioned" }, 500);
    }

    const now = Date.now();
    let processed = 0;
    let skipped = 0;

    for (const entry of payload.entry ?? []) {
      const pageId = entry.id;

      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;
        const v = change.value;
        if (!v?.leadgen_id) continue;

        const result = await ctx.runMutation(
          internal.metaIngest.insertMetaLeadRaw,
          {
            orgId,
            leadgenId: v.leadgen_id,
            pageId,
            formId: v.form_id,
            adId: v.ad_id,
            adgroupId: v.adgroup_id,
            campaignId: undefined,  // niet in leadgen change-value; processor fetcht 'm
            payload: {
              source: "webhook",
              rawEntry: entry,
              change: v,
              receivedAt: now,
            },
            fetchedAt: now,
          },
        );

        if (result.inserted) processed++;
        else skipped++;
      }
    }

    // ALTIJD 200 — Meta retried aggressive op non-200. Eigen retry-logic
    // zit in metaProcessor via metaLeadRaw.retryCount + status.
    return jsonResponse({ received: true, processed, skipped }, 200);
  }),
});

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id: string;
    time?: number;
    changes?: Array<{
      field: string;
      value: {
        leadgen_id?: string;
        page_id?: string;
        form_id?: string;
        ad_id?: string;
        adgroup_id?: string;
        created_time?: number;
      };
    }>;
  }>;
}

/**
 * HMAC-SHA256 signature verify via WebCrypto. Constant-time vergelijk om
 * timing-side-channels te dichten (Meta-best-practice).
 *
 * Header format: "sha256=<hex>". We comparen op de hex-string.
 */
async function isValidSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader.startsWith("sha256=")) return false;
  const received = signatureHeader.slice("sha256=".length);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody),
  );
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeStringEqual(expected, received);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default http;

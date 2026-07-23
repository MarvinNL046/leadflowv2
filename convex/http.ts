import { httpRouter } from "convex/server";
import Stripe from "stripe";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { verifyStateToken } from "./metaOauth";
import { getSiteUrl } from "./lib/env";
import { encryptSecret } from "./lib/crypto";
import { verifyUnsubToken } from "./unsubscribeToken";
import { hashApiKey } from "./marketplace/apiKeys";
import { isValidNlPhone, normalizePhone } from "./marketplace/phone";
import { ALL_NICHES } from "./marketplace/types";
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  deriveJobSize,
  generateCode,
  hashCode,
} from "./marketplace/wizard";

const http = httpRouter();

// ════════════════════════════════════════════════════════════════════
// META OAUTH CALLBACK
// ════════════════════════════════════════════════════════════════════
//
// Flow:
//   1. Frontend roept api.metaOauth.startOauth aan → krijgt redirectUrl.
//   2. Browser doet window.location = redirectUrl → Facebook login + consent.
//   3. Facebook redirect terug naar deze route met ?code=…&state=…
//   4. We verifieren state-HMAC, exchangen code voor long-lived user-token,
//      fetchen /me + /me/accounts, upsert metaConnections + metaPages.
//   5. Redirect naar SITE_URL/crm/settings/meta?meta=connected (of ?error).

const META_GRAPH_API = "https://graph.facebook.com/v21.0";

http.route({
  path: "/auth/meta/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const siteUrl = getSiteUrl(); // verplicht — geen localhost-fallback (faalt loud in prod)
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const stateSecret = process.env.META_OAUTH_STATE_SECRET;
    if (!appId || !appSecret || !stateSecret) {
      return redirectToFrontend(
        siteUrl,
        "missing_oauth_config",
      );
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const fbError = url.searchParams.get("error");
    const fbErrorDesc = url.searchParams.get("error_description");

    if (fbError) {
      console.error("[meta-oauth] FB error:", fbError, fbErrorDesc);
      return redirectToFrontend(siteUrl, `fb_${fbError}`);
    }
    if (!code || !state) {
      return redirectToFrontend(siteUrl, "missing_code_or_state");
    }

    const payload = await verifyStateToken(state, stateSecret);
    if (!payload) {
      return redirectToFrontend(siteUrl, "invalid_state");
    }

    const redirectUri = `${process.env.CONVEX_SITE_URL}/auth/meta/callback`;

    try {
      // 1) Exchange code → short-lived user token
      const shortLivedTokenRes = await fetch(
        `${META_GRAPH_API}/oauth/access_token?` +
          new URLSearchParams({
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: redirectUri,
            code,
          }).toString(),
      );
      const shortLivedJson = (await shortLivedTokenRes.json()) as {
        access_token?: string;
        error?: { message?: string };
      };
      if (shortLivedJson.error || !shortLivedJson.access_token) {
        console.error("[meta-oauth] code-exchange faalde:", shortLivedJson);
        return redirectToFrontend(siteUrl, "code_exchange_failed");
      }

      // 2) Exchange short-lived → long-lived user token (~60 dagen)
      const longLivedRes = await fetch(
        `${META_GRAPH_API}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortLivedJson.access_token,
          }).toString(),
      );
      const longLivedJson = (await longLivedRes.json()) as {
        access_token?: string;
        error?: { message?: string };
      };
      const longLivedToken = longLivedJson.access_token;
      if (!longLivedToken) {
        console.error("[meta-oauth] long-lived exchange faalde:", longLivedJson);
        return redirectToFrontend(siteUrl, "long_lived_failed");
      }

      // 3) Fetch user-info (id + name)
      const meRes = await fetch(
        `${META_GRAPH_API}/me?fields=id,name&access_token=${encodeURIComponent(longLivedToken)}`,
      );
      const meJson = (await meRes.json()) as {
        id?: string;
        name?: string;
        error?: { message?: string };
      };
      if (!meJson.id) {
        console.error("[meta-oauth] /me faalde:", meJson);
        return redirectToFrontend(siteUrl, "me_fetch_failed");
      }

      // 4) Fetch managed pages (long-lived page-tokens komen via /me/accounts)
      const pagesRes = await fetch(
        `${META_GRAPH_API}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(longLivedToken)}`,
      );
      const pagesJson = (await pagesRes.json()) as {
        data?: Array<{ id: string; name: string; access_token?: string }>;
        error?: { message?: string };
      };
      if (pagesJson.error) {
        console.error("[meta-oauth] /me/accounts faalde:", pagesJson);
        return redirectToFrontend(siteUrl, "pages_fetch_failed");
      }
      // 5) Encrypt tokens-at-rest vóór persist. Meta-tokens zijn long-lived
      //    en zeer gevoelig; encrypt mag hier omdat httpAction in de
      //    V8-runtime draait met crypto.subtle + getRandomValues.
      const pages = await Promise.all(
        (pagesJson.data ?? [])
          .filter((p): p is { id: string; name: string; access_token: string } =>
            Boolean(p.access_token),
          )
          .map(async (p) => ({
            pageId: p.id,
            pageName: p.name,
            accessToken: await encryptSecret(p.access_token),
          })),
      );

      // 6) Upsert via internal mutation (tokens al versleuteld)
      await ctx.runMutation(internal.integrations.upsertMetaConnectionInternal, {
        orgId: payload.orgId,
        metaUserId: meJson.id,
        accessToken: await encryptSecret(longLivedToken),
        pages,
      });

      return redirectToFrontend(siteUrl, null, pages.length);
    } catch (err) {
      console.error("[meta-oauth] callback exception:", err);
      return redirectToFrontend(siteUrl, "internal_error");
    }
  }),
});

function redirectToFrontend(
  siteUrl: string,
  error: string | null,
  pageCount?: number,
): Response {
  const target = new URL(`${siteUrl}/crm/settings/meta`);
  if (error) {
    target.searchParams.set("meta_error", error);
  } else {
    target.searchParams.set("meta", "connected");
    if (pageCount !== undefined) {
      target.searchParams.set("pages", String(pageCount));
    }
  }
  return new Response(null, {
    status: 302,
    headers: { Location: target.toString() },
  });
}

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

// ════════════════════════════════════════════════════════════════════
// RESEND WEBHOOK — delivery + bounce events
// ════════════════════════════════════════════════════════════════════
//
// Resend gebruikt Svix voor signing. Headers: svix-id, svix-timestamp,
// svix-signature (format: "v1,base64Hash v2,base64Hash" — meerdere
// versies, valid als ten minste 1 match).
//
// Voor MVP scope: status updates op messages-table. Geen campaign-
// aggregations (komen later als we email-campagnes porten).

http.route({
  path: "/webhooks/resend",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return jsonResponse({ error: "Server misconfigured" }, 500);

    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return jsonResponse({ error: "Missing svix headers" }, 401);
    }

    const rawBody = await request.text();
    if (!(await isValidSvixSignature(
      svixId, svixTimestamp, rawBody, svixSignature, secret,
    ))) {
      console.warn("[resend-webhook] invalid svix signature");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    let payload: ResendEvent;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const externalId = payload.data?.email_id;
    if (!externalId) {
      return jsonResponse({ received: true, ignored: payload.type }, 200);
    }

    // Map Resend event-type naar messages.status enum
    const statusMap: Record<
      string,
      "delivered" | "failed" | "bounced" | "read" | null
    > = {
      "email.delivered": "delivered",
      "email.bounced": "bounced",
      "email.complained": "bounced",
      "email.delivery_delayed": null,  // negeer
      "email.opened": "read",
      "email.clicked": null,
      "email.sent": null,
    };
    const newStatus = statusMap[payload.type];
    if (!newStatus) {
      return jsonResponse({ received: true, ignored: payload.type }, 200);
    }

    await ctx.runMutation(internal.messaging.updateStatusByExternalId, {
      externalMessageId: externalId,
      newStatus,
      deliveredAt: payload.created_at
        ? new Date(payload.created_at).getTime()
        : undefined,
      errorMessage:
        newStatus === "bounced" && payload.data?.bounce
          ? `${payload.data.bounce.type}: ${payload.data.bounce.message ?? ""}`
          : undefined,
    });

    // Broadcast-stats: bump delivered/bounced counters live via webhook.
    if (payload.type === "email.delivered") {
      await ctx.runMutation(internal.broadcasts.bumpStatFromExternalId, {
        externalMessageId: externalId,
        field: "delivered",
      });
    }
    // Marketing-consent: harde bounce of spam-klacht → contact permanent
    // uit alle verzendingen (cleaned). Alleen voor deze twee event-types.
    if (payload.type === "email.bounced" || payload.type === "email.complained") {
      const reason = payload.type === "email.complained" ? "complained" : "bounced";
      await ctx.runMutation(internal.consent.cleanContactByExternalId, {
        externalMessageId: externalId,
        reason,
      });
      await ctx.runMutation(internal.broadcasts.bumpStatFromExternalId, {
        externalMessageId: externalId,
        field: "bounced",
      });
    }

    return jsonResponse({ received: true, type: payload.type }, 200);
  }),
});

// ════════════════════════════════════════════════════════════════════
// PUBLIEKE UNSUBSCRIBE — GET (mens) + POST (Gmail one-click List-Unsubscribe)
// URL: {CONVEX_SITE_URL}/unsubscribe?token=<token>
// ════════════════════════════════════════════════════════════════════

async function handleUnsubscribe(
  ctx: ActionCtx,
  request: Request,
): Promise<boolean> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const contactId = await verifyUnsubToken(token);
  if (!contactId) return false;
  const res = await ctx.runMutation(internal.consent.unsubscribeContact, {
    contactId: contactId as Id<"contacts">,
    reason: "user",
  });
  return res.ok;
}

const UNSUB_PAGE = (ok: boolean) =>
  `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Afmelden</title>
<style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#18181b}
.card{border:1px solid #e4e4e7;border-radius:12px;padding:2rem;text-align:center}</style></head>
<body><div class="card">${
    ok
      ? "<h1>Je bent afgemeld</h1><p>Je ontvangt geen marketingmails meer van StayCool Airco. Offertes en serviceberichten blijven gewoon werken.</p>"
      : "<h1>Link verlopen of ongeldig</h1><p>Neem contact op via info@staycoolairco.nl als je je wilt afmelden.</p>"
  }</div></body></html>`;

http.route({
  path: "/unsubscribe",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const ok = await handleUnsubscribe(ctx, request);
    return new Response(UNSUB_PAGE(ok), {
      status: ok ? 200 : 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }),
});

http.route({
  path: "/unsubscribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const ok = await handleUnsubscribe(ctx, request);
    return new Response(null, { status: ok ? 200 : 400 });
  }),
});

// ════════════════════════════════════════════════════════════════════
// VOIDFIX SMS WEBHOOK — inbound replies + delivery-receipts
// ════════════════════════════════════════════════════════════════════
//
// V1: header X-SG-SIGNATURE = HMAC-SHA256(rawBody, VOIDFIX_SMS_API_SECRET).
// Voor v2 MVP: secret check via shared VOIDFIX_API_SECRET (uit vercel
// env). HMAC zoals Meta-webhook.

http.route({
  path: "/webhooks/voidfix-sms",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.VOIDFIX_API_SECRET;
    if (!secret) return jsonResponse({ error: "Server misconfigured" }, 500);

    const rawBody = await request.text();
    // Auth: óf een geldige HMAC-signature (x-sg-signature), óf het gedeelde
    // secret via ?secret= / x-webhook-secret. Voidfix biedt bij webhooks alleen
    // een URL-veld, dus de query-param is de praktische weg — consistent met de
    // WA-webhook hieronder.
    const signature = request.headers.get("x-sg-signature");
    const headerSecret =
      request.headers.get("x-webhook-secret") ||
      new URL(request.url).searchParams.get("secret");
    const hmacOk =
      !!signature && (await isValidHmacSignature(rawBody, signature, secret));
    const secretOk =
      !!headerSecret && timingSafeStringEqual(headerSecret, secret);
    if (!hmacOk && !secretOk) {
      console.warn("[voidfix-sms-webhook] invalid auth");
      return jsonResponse({ error: "Invalid auth" }, 401);
    }

    // Voidfix SMS POST't form-urlencoded met een `messages`-JSON-array.
    // Elk item: { ID, number (afzender), message (tekst), status:
    // "Received" | "Sent" | "Delivered" | "Failed", ... }. (Fallback: los JSON.)
    let messages: VoidfixSmsMessage[];
    try {
      const raw = new URLSearchParams(rawBody).get("messages");
      const parsed = JSON.parse(raw ?? rawBody);
      messages = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return jsonResponse({ error: "Invalid payload" }, 400);
    }

    const statusMap: Record<
      string,
      "delivered" | "failed" | "bounced" | "read" | null
    > = { Sent: null, Delivered: "delivered", Failed: "failed" };

    // Workspace eenmalig resolven (single-tenant inbound).
    const wsId = await ctx.runQuery(
      internal.messaging.getStaycoolWorkspaceIdInternal,
      {},
    );
    let inbound = 0;
    for (const m of messages) {
      const from = m.number ?? m.from;
      const body = m.message ?? m.body;
      const extId = m.ID != null ? String(m.ID) : (m.messageId ?? undefined);
      if (m.status === "Received" && from && body) {
        if (!wsId) {
          return jsonResponse({ error: "Workspace not provisioned" }, 500);
        }
        await ctx.runMutation(internal.messaging.recordInbound, {
          workspaceId: wsId,
          channel: "sms",
          from,
          body,
          externalMessageId: extId,
        });
        inbound++;
      } else {
        const ns = statusMap[m.status ?? ""];
        if (ns && extId) {
          await ctx.runMutation(internal.messaging.updateStatusByExternalId, {
            externalMessageId: extId,
            newStatus: ns,
          });
        }
      }
    }
    return jsonResponse(
      { received: true, inbound, total: messages.length },
      200,
    );
  }),
});

// ════════════════════════════════════════════════════════════════════
// VOIDFIX WA WEBHOOK — inbound replies + delivery
// ════════════════════════════════════════════════════════════════════
//
// V1: simpele header x-webhook-secret check (geen HMAC). Voor v2 MVP
// hetzelfde — gebruikt VOIDFIX_API_SECRET env.

http.route({
  path: "/webhooks/voidfix-wa",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.VOIDFIX_API_SECRET;
    if (!expectedSecret) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const headerSecret =
      request.headers.get("x-webhook-secret") ||
      new URL(request.url).searchParams.get("secret");
    if (
      !headerSecret ||
      !timingSafeStringEqual(headerSecret, expectedSecret)
    ) {
      console.warn("[voidfix-wa-webhook] invalid secret");
      return jsonResponse({ error: "Invalid secret" }, 401);
    }

    let payload: VoidfixWaEvent;
    try {
      payload = JSON.parse(await request.text());
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    // Outbound: bericht verstuurd vanaf de gekoppelde bedrijfstelefoon (of een
    // echo van een via-Leadflow verstuurd bericht). recordOutbound dedupt op
    // externalMessageId, dus API-verstuurde berichten worden niet dubbel opgeslagen.
    if (payload.event === "message.outbound") {
      const to = payload.to ?? payload.phoneNumber;
      if (!to) {
        return jsonResponse({ received: true, skipped: "no to" }, 200);
      }
      const wsId = await ctx.runQuery(
        internal.messaging.getStaycoolWorkspaceIdInternal,
        {},
      );
      if (!wsId) {
        return jsonResponse({ error: "Workspace not provisioned" }, 500);
      }
      await ctx.runMutation(internal.messaging.recordOutbound, {
        workspaceId: wsId,
        channel: "whatsapp",
        to,
        body: payload.message ?? payload.body ?? "",
        from: payload.from,
        externalMessageId: payload.messageId ?? payload.id ?? undefined,
        mediaUrl: payload.mediaUrl ?? undefined,
        mediaType: payload.mediaType ?? undefined,
      });
      return jsonResponse({ received: true, type: "outbound" }, 200);
    }

    // Filter op inbound events; outbound-echo + status-receipts later
    const isInbound =
      payload.event === "message.incoming" ||
      (payload.from && !payload.event);
    if (!isInbound) {
      // Probeer delivery-receipt match
      if (payload.messageId && payload.status) {
        const statusMap: Record<
          string,
          "delivered" | "failed" | "bounced" | "read" | null
        > = {
          sent: null,
          delivered: "delivered",
          read: "read",
          failed: "failed",
          // WhatsApp-ack-levels (Voidfix stuurt numeriek): 1=sent, 2=delivered, 3=read.
          "1": null,
          "2": "delivered",
          "3": "read",
        };
        // status kan een getal of string zijn → defensief naar string.
        const ns = statusMap[String(payload.status).toLowerCase()];
        if (ns) {
          await ctx.runMutation(
            internal.messaging.updateStatusByExternalId,
            { externalMessageId: String(payload.messageId), newStatus: ns },
          );
        }
      }
      return jsonResponse({ received: true, event: payload.event }, 200);
    }

    const from = payload.from ?? payload.phoneNumber;
    const body = payload.body ?? payload.message ?? "";
    if (!from) return jsonResponse({ received: true, skipped: "no from" }, 200);

    const wsId = await ctx.runQuery(
      internal.messaging.getStaycoolWorkspaceIdInternal,
      {},
    );
    if (!wsId) return jsonResponse({ error: "Workspace not provisioned" }, 500);

    await ctx.runMutation(internal.messaging.recordInbound, {
      workspaceId: wsId,
      channel: "whatsapp",
      from,
      body,
      externalMessageId: payload.messageId ?? payload.id ?? undefined,
      // Skip null → undefined (Voidfix stuurt expliciet null voor
      // text-only messages, onze validator verwacht string|undefined)
      mediaUrl: payload.mediaUrl ?? undefined,
      mediaType: payload.mediaType ?? undefined,
    });
    return jsonResponse({ received: true, type: "inbound" }, 200);
  }),
});

// ══════════════════════════════════════════════════════════════════════
// WEBSITE-FORM LEAD INGEST — staycoolairco.nl forms → v2 CRM
// Browser-form (cross-origin) → CORS nodig. Auth = WEBSITE_API_KEY via
// X-API-Key-header of ?secret=. NB de key is client-side (public) — dit is
// een lichte anti-misbruik-gate, geen sterk secret.
// ══════════════════════════════════════════════════════════════════════
const LEADS_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
};

http.route({
  path: "/webhooks/leads",
  method: "OPTIONS",
  handler: httpAction(
    async () => new Response(null, { status: 204, headers: LEADS_CORS }),
  ),
});

http.route({
  path: "/webhooks/leads",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const cors = (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...LEADS_CORS },
      });

    const expected = process.env.WEBSITE_API_KEY;
    if (!expected) return cors({ error: "Server misconfigured" }, 500);

    const key =
      request.headers.get("x-api-key") ||
      new URL(request.url).searchParams.get("secret");
    if (!key || !timingSafeStringEqual(key, expected)) {
      console.warn("[website-leads] invalid api key");
      return cors({ error: "Invalid API key" }, 401);
    }

    let payload: {
      firstName?: string;
      lastName?: string;
      name?: string;
      email?: string;
      phone?: string;
      message?: string;
      source?: string;
      city?: string;
      customFields?: { city?: string; woonplaats?: string };
    };
    try {
      payload = JSON.parse(await request.text());
    } catch {
      return cors({ error: "Invalid JSON" }, 400);
    }

    // Naam: firstName/lastName, of splits een los `name`-veld.
    let firstName = payload.firstName;
    let lastName = payload.lastName;
    if (!firstName && !lastName && payload.name) {
      const parts = payload.name.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(" ") || undefined;
    }
    const city =
      payload.city ??
      payload.customFields?.city ??
      payload.customFields?.woonplaats;

    if (!payload.email && !payload.phone) {
      return cors({ error: "email of phone vereist" }, 400);
    }

    const workspaceId = await ctx.runQuery(
      internal.messaging.getStaycoolWorkspaceIdInternal,
      {},
    );
    if (!workspaceId) return cors({ error: "Workspace not provisioned" }, 500);

    const { contactId } = await ctx.runMutation(
      internal.websiteLeads.ingestWebsiteLead,
      {
        workspaceId,
        firstName,
        lastName,
        email: payload.email,
        phone: payload.phone,
        city,
        message: payload.message,
        source: payload.source ?? "website",
      },
    );
    return cors({ received: true, contactId }, 200);
  }),
});

// ══════════════════════════════════════════════════════════════════════
// CROSS-APP CONTACT-CREATE — suite-apps (cashflow / frostwork) mogen een
// NIEUW contact aanmaken wanneer een klant telefonisch binnenkwam en dus
// nog niet in de CRM stond. Leadflow blijft de bron; dit is de enige
// write-poort. Auth = WEBSITE_API_KEY (zelfde write-key als /webhooks/leads,
// los van de READ_API_KEY). Server-to-server, geen CORS. Dedup + merge in
// contactsWrite.createContactFromApp.
// ══════════════════════════════════════════════════════════════════════
http.route({
  path: "/api/contacts/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.WEBSITE_API_KEY;
    if (!expected) return jsonResponse({ error: "Server misconfigured" }, 500);
    const key = request.headers.get("x-api-key");
    if (!key || !timingSafeStringEqual(key, expected)) {
      return jsonResponse({ error: "Invalid API key" }, 401);
    }

    let payload: {
      firstName?: string;
      lastName?: string;
      company?: string;
      email?: string;
      phone?: string;
      street?: string;
      houseNumber?: string;
      postalCode?: string;
      city?: string;
      country?: string;
      source?: string;
    };
    try {
      payload = JSON.parse(await request.text());
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const clean = (s?: string) => {
      const t = s?.trim();
      return t ? t : undefined;
    };
    const email = clean(payload.email);
    const phone = clean(payload.phone);
    const firstName = clean(payload.firstName);
    const lastName = clean(payload.lastName);
    const company = clean(payload.company);
    if (!email && !phone && !firstName && !lastName && !company) {
      return jsonResponse(
        { error: "minstens één van naam/e-mail/telefoon vereist" },
        400,
      );
    }

    const workspaceId = await ctx.runQuery(
      internal.messaging.getStaycoolWorkspaceIdInternal,
      {},
    );
    if (!workspaceId) {
      return jsonResponse({ error: "Workspace not provisioned" }, 500);
    }

    const result = await ctx.runMutation(
      internal.contactsWrite.createContactFromApp,
      {
        workspaceId,
        firstName,
        lastName,
        company,
        email,
        phone,
        street: clean(payload.street),
        houseNumber: clean(payload.houseNumber),
        postalCode: clean(payload.postalCode),
        city: clean(payload.city),
        country: clean(payload.country),
        source: clean(payload.source) ?? "cashflow",
      },
    );
    return jsonResponse(result, 200);
  }),
});

// ══════════════════════════════════════════════════════════════════════
// CONTACT TAG-API — een suite-app (cashflow) tagt BESTAANDE leadflow-
// contacten (bv. een marketing-segment). Auth = WEBSITE_API_KEY (write-key).
// Maakt nooit nieuwe contacten; idempotent. Daarna maakt de eigenaar in
// leadflow een segment op die tag en verstuurt een broadcast.
// ══════════════════════════════════════════════════════════════════════
http.route({
  path: "/api/contacts/tag",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.WEBSITE_API_KEY;
    if (!expected) return jsonResponse({ error: "Server misconfigured" }, 500);
    const key = request.headers.get("x-api-key");
    if (!key || !timingSafeStringEqual(key, expected)) {
      return jsonResponse({ error: "Invalid API key" }, 401);
    }

    let payload: { tag?: string; contactIds?: string[]; emails?: string[] };
    try {
      payload = JSON.parse(await request.text());
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const tag = payload.tag?.trim();
    if (!tag) return jsonResponse({ error: "tag vereist" }, 400);
    // Begrensd per call (de aanroeper batcht); voorkomt een te grote mutation.
    const contactIds = Array.isArray(payload.contactIds)
      ? payload.contactIds.slice(0, 500)
      : [];
    const emails = Array.isArray(payload.emails)
      ? payload.emails.slice(0, 500)
      : [];
    if (contactIds.length === 0 && emails.length === 0) {
      return jsonResponse({ error: "contactIds of emails vereist" }, 400);
    }

    const workspaceId = await ctx.runQuery(
      internal.messaging.getStaycoolWorkspaceIdInternal,
      {},
    );
    if (!workspaceId) {
      return jsonResponse({ error: "Workspace not provisioned" }, 500);
    }

    const result = await ctx.runMutation(
      internal.contactsWrite.tagContactsFromApp,
      { workspaceId, tag, contactIds, emails },
    );
    return jsonResponse(result, 200);
  }),
});

// ══════════════════════════════════════════════════════════════════════
// CONTACT READ-API — leadflow-contacten lezen vanuit de andere wetry-apps
// (cashflow / frostwork). Leadflow blijft de bron; dit is READ-ONLY.
// Auth = READ_API_KEY via X-API-Key (apart van de write-key WEBSITE_API_KEY,
// zodat read/write los te roteren zijn). Server-to-server, geen CORS.
// ══════════════════════════════════════════════════════════════════════
function readApiKeyError(request: Request): Response | null {
  const expected = process.env.READ_API_KEY;
  if (!expected) return jsonResponse({ error: "Server misconfigured" }, 500);
  const key = request.headers.get("x-api-key");
  if (!key || !timingSafeStringEqual(key, expected)) {
    return jsonResponse({ error: "Invalid API key" }, 401);
  }
  return null;
}

http.route({
  path: "/api/contacts/search",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const denied = readApiKeyError(request);
    if (denied) return denied;

    const url = new URL(request.url);
    const search = url.searchParams.get("q") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit =
      limitRaw && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;

    const workspaceId = await ctx.runQuery(
      internal.messaging.getStaycoolWorkspaceIdInternal,
      {},
    );
    if (!workspaceId) {
      return jsonResponse({ error: "Workspace not provisioned" }, 500);
    }

    const result = await ctx.runQuery(internal.contactsRead.searchForStaycool, {
      workspaceId,
      search,
      limit,
    });
    return jsonResponse(result, 200);
  }),
});

http.route({
  path: "/api/contacts/get",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const denied = readApiKeyError(request);
    if (denied) return denied;

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return jsonResponse({ error: "id vereist" }, 400);

    const workspaceId = await ctx.runQuery(
      internal.messaging.getStaycoolWorkspaceIdInternal,
      {},
    );
    if (!workspaceId) {
      return jsonResponse({ error: "Workspace not provisioned" }, 500);
    }

    const result = await ctx.runQuery(
      internal.contactsRead.getDetailForStaycool,
      { workspaceId, contactId: id },
    );
    if (!result) return jsonResponse({ error: "Not found" }, 404);
    return jsonResponse(result, 200);
  }),
});

// ──────────────────────────────────────────────────────────────────────
// Shared HMAC helper voor SMS/WA (Meta gebruikt eigen wrapper)
// ──────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════
// MARKETPLACE INTAKE — server-to-server (SEO landing pages) lead ingest.
// Auth = Bearer <rawKey> → sha256 → findActiveByHash. CORS "*" because
// landing pages may POST from the browser. Calls internal.marketplace.*.
// ══════════════════════════════════════════════════════════════════════
const MP_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const MP_VALID_JOB_SIZES = ["s", "m", "l", "xl"];
const MP_VALID_BUYER_INTENTIONS = ["yes", "unknown", "no"];

http.route({
  path: "/marketplace/intake",
  method: "OPTIONS",
  handler: httpAction(
    async () => new Response(null, { status: 204, headers: MP_CORS }),
  ),
});

http.route({
  path: "/marketplace/intake",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const cors = (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...MP_CORS },
      });

    // 1. Bearer auth.
    const authHeader = request.headers.get("authorization");
    const match = authHeader?.match(/^Bearer\s+(.+)$/i);
    const rawKey = match?.[1]?.trim();
    if (!rawKey) {
      return cors({ error: "missing_api_key" }, 401);
    }

    // 2. Hash + lookup active key.
    const keyHash = await hashApiKey(rawKey);
    const apiKey = await ctx.runQuery(
      internal.marketplace.apiKeys.findActiveByHash,
      { keyHash },
    );
    if (!apiKey) {
      return cors({ error: "invalid_api_key" }, 401);
    }

    // 3. Parse + wire-validate body.
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(await request.text());
      if (typeof parsed !== "object" || parsed === null) {
        return cors({ error: "invalid_body" }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return cors({ error: "invalid_json" }, 400);
    }

    const str = (val: unknown): string | undefined =>
      typeof val === "string" ? val : undefined;

    const firstName = str(body.firstName);
    const lastName = str(body.lastName);
    const phone = str(body.phone);
    const postalCode = str(body.postalCode);
    if (!firstName?.trim()) return cors({ error: "missing_firstName" }, 400);
    if (!lastName?.trim()) return cors({ error: "missing_lastName" }, 400);
    if (!phone?.trim()) return cors({ error: "missing_phone" }, 400);
    if (!postalCode?.trim()) return cors({ error: "missing_postalCode" }, 400);

    const projectType = str(body.projectType);
    if (projectType !== undefined && projectType.length > 255) {
      return cors({ error: "projectType_too_long" }, 400);
    }
    const projectDescription = str(body.projectDescription);
    if (projectDescription !== undefined && projectDescription.length > 4000) {
      return cors({ error: "projectDescription_too_long" }, 400);
    }

    const jobSize = str(body.jobSize);
    if (jobSize !== undefined && !MP_VALID_JOB_SIZES.includes(jobSize)) {
      return cors({ error: "invalid_jobSize" }, 400);
    }
    const buyerIntention = str(body.buyerIntention);
    if (
      buyerIntention !== undefined &&
      !MP_VALID_BUYER_INTENTIONS.includes(buyerIntention)
    ) {
      return cors({ error: "invalid_buyerIntention" }, 400);
    }

    let photos: string[] | undefined;
    if (body.photos !== undefined) {
      if (
        !Array.isArray(body.photos) ||
        body.photos.length > 10 ||
        !body.photos.every((u) => typeof u === "string")
      ) {
        return cors({ error: "invalid_photos" }, 400);
      }
      photos = body.photos as string[];
    }

    // 4. Insert via the single-source internal mutation. Business-rule
    //    rejects (invalid niche / phone / not allowed) throw → 400.
    let result: {
      ok: true;
      leadId: string;
      duplicate: boolean;
      status: string;
    };
    try {
      result = await ctx.runMutation(internal.marketplace.intake.insertLead, {
        apiKeyId: apiKey._id,
        niche: str(body.niche),
        serviceType: str(body.serviceType),
        segment: str(body.segment),
        firstName,
        lastName,
        phone,
        postalCode,
        email: str(body.email),
        projectType,
        projectDescription,
        jobSize,
        buyerIntention,
        nicheData:
          body.nicheData && typeof body.nicheData === "object"
            ? body.nicheData
            : undefined,
        photos,
        urgency: str(body.urgency),
        message: str(body.message),
        city: str(body.city),
        metadata:
          body.metadata && typeof body.metadata === "object"
            ? body.metadata
            : undefined,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "intake_failed";
      console.warn("[marketplace-intake] rejected:", code);
      return cors({ error: code }, 400);
    }

    // 5. Success.
    return cors(
      {
        ok: true,
        leadId: result.leadId,
        duplicate: result.duplicate,
        status: result.status,
      },
      200,
    );
  }),
});

// ══════════════════════════════════════════════════════════════════════
// WIZARD-INTAKE (v1-compat) — de SEO-sites (LEADFLOW_BASE_URL) praten
// tegen exact deze paden met Bearer <lmk_…>. Drie stappen:
//   POST /api/intake/wizard/start      → verificatierij + token
//   GET  /api/intake/wizard/send-code  → OTP via SMS (VoidFix) + e-mail
//   POST /api/intake/wizard/verify     → code checken → intake.insertLead
// Response-shapes zijn 1:1 v1 zodat de site-frontends niets merken.
// ══════════════════════════════════════════════════════════════════════

const wizardJson = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function wizardAuth(ctx: ActionCtx, request: Request) {
  const m = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  const rawKey = m?.[1]?.trim();
  if (!rawKey) return null;
  const keyHash = await hashApiKey(rawKey);
  return ctx.runQuery(internal.marketplace.apiKeys.findActiveByHash, {
    keyHash,
  });
}

/** SMS via de VoidFix-gateway (zelfde wire-format als messaging.ts). */
async function wizardSendSms(to: string, message: string): Promise<boolean> {
  const key = process.env.VOIDFIX_SMS_API_SECRET;
  const devices = process.env.VOIDFIX_SMS_DEVICE_ID;
  if (!key || !devices) return false;
  const form = new URLSearchParams();
  form.set("key", key);
  form.set("number", to);
  form.set("message", message);
  form.set("devices", devices);
  form.set("type", "sms");
  form.set("prioritize", "1");
  try {
    const res = await fetch("https://sms.voidfix.com/services/send.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return !!json.success;
  } catch {
    return false;
  }
}

/**
 * OTP-mail via Resend. Ontwerp = v1's IntakeOtpEmail (kaart op slate-
 * achtergrond, mono codeblok), opgebouwd met tabellen + inline styles
 * zodat het in alle mailclients (Outlook incl.) heel blijft. Nieuw t.o.v.
 * v1: de site waar de aanvraag vandaan komt staat in de mail, zodat de
 * consument de afzender herkent.
 */
function wizardOtpEmailHtml(code: string, siteName?: string): string {
  const via = siteName
    ? `U vroeg net een offerte aan via <strong>${siteName}</strong>. `
    : "";
  const preheader = `Uw verificatiecode is ${code} — geldig voor ${OTP_TTL_MINUTES} minuten.`;
  return `<!DOCTYPE html>
<html lang="nl">
<body style="margin:0;padding:0;background-color:#f8fafc;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:24px 0;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <h1 style="font-size:20px;font-weight:600;color:#0f172a;margin:0 0 12px 0;">Bevestig uw aanvraag</h1>
              <p style="font-size:14px;color:#334155;margin:0 0 20px 0;line-height:1.6;">
                ${via}Vul onderstaande code in om uw aanvraag te bevestigen. Daarna nemen vakmensen uit uw regio contact met u op.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="background-color:#f1f5f9;border-radius:8px;padding:20px;">
                    <span style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;">${code}</span>
                  </td>
                </tr>
              </table>
              <p style="font-size:12px;color:#64748b;margin:24px 0 0 0;line-height:1.6;">
                De code is ${OTP_TTL_MINUTES} minuten geldig. Vroeg u deze code niet zelf aan? Dan kunt u deze e-mail veilig negeren — er gebeurt dan niets.
              </p>
            </td>
          </tr>
        </table>
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#94a3b8;margin:16px 0 0 0;">
          Dit is een automatisch bericht${siteName ? ` naar aanleiding van uw aanvraag op ${siteName}` : ""}.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function wizardSendEmail(
  to: string,
  code: string,
  siteName?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.EMAIL_FROM ?? "LeadFlow <noreply@wetryleadflow.com>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `Uw verificatiecode: ${code}`,
        html: wizardOtpEmailHtml(code, siteName),
        text: `Uw verificatiecode is: ${code}\n\nVul deze code in om uw aanvraag te bevestigen. De code is ${OTP_TTL_MINUTES} minuten geldig.\n\nVroeg u deze code niet zelf aan? Dan kunt u deze e-mail negeren.`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

http.route({
  path: "/api/intake/wizard/start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = await wizardAuth(ctx, request);
    if (!apiKey) return wizardJson({ error: "invalid_api_key" }, 401);

    let body: {
      niche?: string;
      payload?: Record<string, unknown>;
      honeypot?: string;
      metadata?: Record<string, unknown>;
    };
    try {
      body = await request.json();
    } catch {
      return wizardJson({ error: "invalid_json" }, 400);
    }

    if (typeof body.honeypot === "string" && body.honeypot.trim() !== "") {
      return wizardJson({ error: "honeypot_filled" }, 400);
    }

    // Niche-validatie (fail fast, zoals v1's /start).
    const niche = body.niche ?? "";
    if (!(ALL_NICHES as string[]).includes(niche)) {
      return wizardJson({ error: "invalid_niche", niche }, 400);
    }
    const allowed =
      apiKey.allowedNiches.length > 0
        ? apiKey.allowedNiches
        : [apiKey.defaultNiche];
    if (!allowed.includes(niche)) {
      return wizardJson({ error: "niche_not_allowed", allowed }, 403);
    }

    if (!body.payload || typeof body.payload !== "object") {
      return wizardJson({ error: "missing_payload" }, 400);
    }
    const phoneNormalized = normalizePhone(String(body.payload.phone ?? ""));
    if (!phoneNormalized || !isValidNlPhone(phoneNormalized)) {
      return wizardJson({ error: "invalid_phone", field: "phone" }, 400);
    }
    const rawEmail =
      typeof body.payload.email === "string" ? body.payload.email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return wizardJson({ error: "invalid_email", field: "email" }, 400);
    }
    const emailNormalized = rawEmail.toLowerCase();

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

    const result = await ctx.runMutation(internal.marketplace.wizard.start, {
      apiKeyId: apiKey._id,
      niche,
      phone: phoneNormalized,
      email: emailNormalized,
      payload: {
        ...body.payload,
        phone: phoneNormalized,
        email: emailNormalized,
      },
      metadata: body.metadata,
      ip: clientIp || undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    if (result.rateLimited) {
      return wizardJson(
        { error: "rate_limit_ip", retryAfterSeconds: 3600 },
        429,
      );
    }

    return wizardJson(
      {
        token: result.token,
        verifyUrl: `/aanvragen/${niche}/verify?v=${result.token}`,
        expiresAt: new Date(result.expiresAt).toISOString(),
      },
      200,
    );
  }),
});

http.route({
  path: "/api/intake/wizard/send-code",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const apiKey = await wizardAuth(ctx, request);
    if (!apiKey) return wizardJson({ error: "invalid_api_key" }, 401);

    const token = new URL(request.url).searchParams.get("v");
    if (!token) return wizardJson({ error: "missing_token" }, 400);

    const verification = await ctx.runQuery(
      internal.marketplace.wizard.getByToken,
      { token },
    );
    if (!verification || verification.apiKeyId !== apiKey._id) {
      return wizardJson({ error: "verification_not_found" }, 404);
    }
    if (verification.expiresAt <= Date.now()) {
      return wizardJson({ error: "verification_expired" }, 410);
    }
    if (verification.verifiedAt) {
      return wizardJson({ error: "already_verified" }, 410);
    }

    // Cooldown (60s over beide kanalen heen, v1-parity).
    const now = Date.now();
    const lastSent = verification.lastSentAt ?? 0;
    const cooldownEnds = lastSent + OTP_RESEND_COOLDOWN_SECONDS * 1000;
    if (lastSent > 0 && now < cooldownEnds) {
      return wizardJson(
        {
          sent: false,
          cooldownActive: true,
          expiresAt: new Date(verification.expiresAt).toISOString(),
          attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - verification.attempts),
          resendsLeft: Math.max(0, OTP_MAX_RESENDS - verification.resends),
          nextResendAt: new Date(cooldownEnds).toISOString(),
        },
        200,
      );
    }
    if (verification.resends >= OTP_MAX_RESENDS) {
      return wizardJson({ error: "too_many_resends", resendsLeft: 0 }, 429);
    }

    // Per-kanaal verse codes.
    const phoneCode = generateCode();
    const emailCode = generateCode();
    const siteName =
      typeof (verification.metadata as Record<string, unknown> | undefined)
        ?.source === "string"
        ? ((verification.metadata as Record<string, unknown>).source as string)
        : undefined;
    const smsOk = await wizardSendSms(
      verification.phone,
      `Je verificatiecode: ${phoneCode} (geldig ${OTP_TTL_MINUTES} min)`,
    );
    const emailOk = verification.email
      ? await wizardSendEmail(verification.email, emailCode, siteName)
      : false;

    if (!smsOk && !emailOk) {
      return wizardJson({ error: "dispatch_failed" }, 502);
    }

    await ctx.runMutation(internal.marketplace.wizard.recordDispatch, {
      verificationId: verification._id,
      phoneCodeHash: await hashCode(phoneCode),
      emailCodeHash: await hashCode(emailCode),
      smsOk,
      emailOk,
    });

    const sentAt = Date.now();
    return wizardJson(
      {
        sent: true,
        cooldownActive: false,
        smsSent: smsOk,
        emailSent: emailOk,
        expiresAt: new Date(verification.expiresAt).toISOString(),
        attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - verification.attempts),
        resendsLeft: Math.max(
          0,
          OTP_MAX_RESENDS - (verification.resends + 1),
        ),
        nextResendAt: new Date(
          sentAt + OTP_RESEND_COOLDOWN_SECONDS * 1000,
        ).toISOString(),
        // Alleen met WIZARD_DEBUG=1 (dev): klare codes voor flow-tests.
        ...(process.env.WIZARD_DEBUG === "1"
          ? { _debugPhoneCode: phoneCode, _debugEmailCode: emailCode }
          : {}),
      },
      200,
    );
  }),
});

http.route({
  path: "/api/intake/wizard/verify",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = await wizardAuth(ctx, request);
    if (!apiKey) return wizardJson({ error: "invalid_api_key" }, 401);

    let body: { token?: string; code?: string };
    try {
      body = await request.json();
    } catch {
      return wizardJson({ error: "invalid_json" }, 400);
    }
    if (!body.token || !body.code) {
      return wizardJson(
        { error: "missing_field", fields: ["token", "code"] },
        400,
      );
    }

    const attempt = await ctx.runMutation(
      internal.marketplace.wizard.attemptVerify,
      {
        token: body.token,
        apiKeyId: apiKey._id,
        codeHash: await hashCode(body.code.trim()),
      },
    );

    switch (attempt.outcome) {
      case "not_found":
        return wizardJson({ error: "verification_not_found" }, 404);
      case "already_verified":
        return wizardJson({ error: "already_verified" }, 410);
      case "expired":
        return wizardJson({ error: "verification_expired" }, 410);
      case "too_many_attempts":
        return wizardJson({ error: "too_many_attempts", attemptsLeft: 0 }, 429);
      case "invalid_code":
        return wizardJson(
          { error: "invalid_code", attemptsLeft: attempt.attemptsLeft },
          400,
        );
      case "second_channel":
        return wizardJson(
          {
            success: true,
            leadId: attempt.leadId,
            thanksUrl: `/aanvragen/${attempt.niche}/thanks`,
            duplicate: false,
            matchedChannel: attempt.matchedChannel,
            addedSecondChannel: true,
          },
          200,
        );
    }

    // outcome === "match" → promoveren via de single-source intake-mutatie.
    const payload = attempt.payload;
    const str = (x: unknown) => (typeof x === "string" ? x : undefined);

    // Wizard-verrijking: jobSize afleiden uit nicheData.amount_rooms.
    let jobSize = str(payload.jobSize);
    if (!jobSize) {
      const nd = payload.nicheData as Record<string, unknown> | undefined;
      jobSize = deriveJobSize(nd?.amount_rooms) ?? undefined;
    }

    let result: { ok: true; leadId: string; duplicate: boolean };
    try {
      result = await ctx.runMutation(internal.marketplace.intake.insertLead, {
        apiKeyId: apiKey._id,
        niche: attempt.niche,
        serviceType: str(payload.serviceType),
        segment: str(payload.segment),
        firstName: str(payload.firstName) ?? "",
        lastName: str(payload.lastName) ?? "",
        phone: str(payload.phone) ?? "",
        postalCode: str(payload.postalCode) ?? "",
        email: str(payload.email),
        projectType: str(payload.projectType),
        projectDescription: str(payload.projectDescription),
        jobSize,
        buyerIntention: str(payload.buyerIntention),
        nicheData:
          payload.nicheData && typeof payload.nicheData === "object"
            ? payload.nicheData
            : undefined,
        photos: Array.isArray(payload.photos)
          ? (payload.photos as string[])
          : undefined,
        urgency: str(payload.urgency),
        message: str(payload.message),
        city: str(payload.city),
        metadata: {
          ...((payload.metadata as Record<string, unknown>) ?? {}),
          ...(attempt.metadata ?? {}),
          via: "wizard",
        },
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "promotion_failed";
      console.warn("[wizard-verify] promotie mislukt:", code);
      return wizardJson({ error: "promotion_failed", detail: code }, 500);
    }

    await ctx.runMutation(internal.marketplace.wizard.markPromoted, {
      verificationId: attempt.verificationId,
      leadId: result.leadId as Id<"marketplaceLeads">,
      matchedChannel: attempt.matchedChannel,
    });

    return wizardJson(
      {
        success: true,
        leadId: result.leadId,
        thanksUrl: `/aanvragen/${attempt.niche}/thanks`,
        duplicate: result.duplicate,
        matchedChannel: attempt.matchedChannel,
      },
      200,
    );
  }),
});

// ══════════════════════════════════════════════════════════════════════
// MARKETPLACE STRIPE WEBHOOK — credits a buyer wallet on topup completion.
// URL: ${CONVEX_SITE_URL}/webhooks/marketplace-stripe (its OWN Stripe
// endpoint, distinct from any CRM webhook). Raw-body, signature-verified
// with `constructEventAsync` (WebCrypto — stays in the V8 runtime, no
// "use node"). Idempotent: creditTopupIdempotent guards on by_ref so
// Stripe's at-least-once retry can't double-credit.
//
// Env (set via `npx convex env set`):
//   STRIPE_SECRET_KEY                  — same key as createTopup
//   STRIPE_MARKETPLACE_WEBHOOK_SECRET  — this endpoint's signing secret
// Absent keys → 500 {error:"not_configured"} (safe to ship without them).
// ══════════════════════════════════════════════════════════════════════
http.route({
  path: "/webhooks/marketplace-stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.STRIPE_MARKETPLACE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!secret || !key) {
      return jsonResponse({ error: "not_configured" }, 500);
    }

    const sig = request.headers.get("stripe-signature");
    if (!sig) return jsonResponse({ error: "no_signature" }, 400);

    // Raw body — exactly as received, for signature verification.
    const body = await request.text();
    let event: Stripe.Event;
    try {
      // constructEventAsync uses WebCrypto (works in the default V8
      // runtime); the sync constructEvent needs node crypto.
      event = await new Stripe(key).webhooks.constructEventAsync(
        body,
        sig,
        secret,
      );
    } catch (err) {
      console.warn("[marketplace-stripe] signature verify failed:", err);
      return jsonResponse({ error: "invalid_signature" }, 400);
    }

    // Only completed Checkout Sessions of OUR topup kind are processed.
    if (event.type !== "checkout.session.completed") {
      return jsonResponse({ received: true }, 200);
    }
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind !== "marketplace_topup") {
      return jsonResponse({ received: true }, 200);
    }

    const orgId = session.metadata.marketplaceOrgId;
    const userId = session.metadata.marketplaceUserId;
    const amountCents = session.amount_total ?? 0;
    if (!orgId || !amountCents) {
      console.error("[marketplace-stripe] bad metadata", session.metadata);
      return jsonResponse({ error: "bad_metadata" }, 400);
    }

    // Idempotency + credit happen in ONE mutation (by_ref guard).
    await ctx.runMutation(internal.marketplace.wallet.creditTopupIdempotent, {
      orgId: orgId as Id<"orgs">,
      userId: userId ? (userId as Id<"users">) : undefined,
      amountCents,
      sessionId: session.id,
    });

    return jsonResponse({ received: true }, 200);
  }),
});

async function isValidHmacSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  // Strip optional "sha256=" prefix
  const received = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

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

/**
 * Svix-signature verify voor Resend. Svix format:
 *   sigPayload = svix-id + "." + svix-timestamp + "." + rawBody
 *   signature = "v1,base64(HMAC-SHA256(sigPayload, secret))"
 * Header `svix-signature` kan meerdere space-gescheiden sigs hebben;
 * één match is genoeg. Secret in env-var heeft prefix "whsec_" die
 * we eerst moeten strippen + base64-decoden voor de key.
 */
async function isValidSvixSignature(
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const sigPayload = `${svixId}.${svixTimestamp}.${rawBody}`;

  // Decode secret: strip whsec_ prefix, base64-decode
  const secretStr = secret.startsWith("whsec_")
    ? secret.slice("whsec_".length)
    : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(secretStr), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keyBytes as any,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(sigPayload),
  );
  const expected = btoa(
    String.fromCharCode(...new Uint8Array(sigBuf)),
  );

  // Header: "v1,sig1 v1,sig2 v2,sig3" — alleen v1-prefix counts
  const sigs = signatureHeader.split(" ");
  for (const s of sigs) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[0] === "v1") {
      if (timingSafeStringEqual(parts[1], expected)) return true;
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────
// Payload typings (loose; alleen wat we lezen)
// ──────────────────────────────────────────────────────────────────────

interface ResendEvent {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    bounce?: { type?: string; message?: string };
  };
}

interface VoidfixSmsMessage {
  ID?: number;
  number?: string; // afzender (inbound) / ontvanger
  message?: string; // tekst
  status?: string; // "Received" | "Sent" | "Delivered" | "Failed"
  // legacy/fallback veldnamen
  messageId?: string;
  from?: string;
  body?: string;
}

interface VoidfixWaEvent {
  event?: string;
  from?: string;
  to?: string;
  phoneNumber?: string;
  body?: string;
  message?: string;
  messageId?: string;
  id?: string;
  status?: string | number;
  mediaUrl?: string;
  mediaType?: string;
}

/**
 * Suite-API: taak aanmaken (cashflow heractiveren-flow -> "offerte
 * nabellen"). Zelfde WRITE-key als /api/contacts/create. Idempotent op
 * `source` (tasks.createFromApi). contactId is optioneel maar moet, indien
 * meegegeven, in de Staycool-workspace bestaan.
 */
http.route({
  path: "/api/tasks/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.WEBSITE_API_KEY;
    if (!expected) return jsonResponse({ error: "Server misconfigured" }, 500);
    const key = request.headers.get("x-api-key");
    if (!key || !timingSafeStringEqual(key, expected)) {
      return jsonResponse({ error: "Invalid API key" }, 401);
    }

    let payload: {
      contactId?: string;
      title?: string;
      description?: string;
      dueDate?: number;
      source?: string;
    };
    try {
      payload = JSON.parse(await request.text());
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const title = payload.title?.trim();
    if (!title) return jsonResponse({ error: "title is required" }, 400);

    const workspaceId = await ctx.runQuery(
      internal.messaging.getStaycoolWorkspaceIdInternal,
      {},
    );
    if (!workspaceId) {
      return jsonResponse({ error: "Workspace not provisioned" }, 500);
    }

    let contactId: Id<"contacts"> | undefined;
    if (payload.contactId) {
      const detail = await ctx.runQuery(
        internal.contactsRead.getDetailForStaycool,
        { workspaceId, contactId: payload.contactId },
      );
      if (!detail) return jsonResponse({ error: "Contact not found" }, 404);
      contactId = detail.contact.id as Id<"contacts">;
    }

    const result = await ctx.runMutation(internal.tasks.createFromApi, {
      workspaceId,
      contactId,
      title,
      description: payload.description,
      dueDate: payload.dueDate,
      source: payload.source,
    });
    return jsonResponse(result, result.created ? 201 : 200);
  }),
});

/**
 * Suite-API: taak afronden op source — cashflow vinkt de nabel-taak
 * automatisch af na heraanbieden/afschrijven. Zelfde write-key.
 */
http.route({
  path: "/api/tasks/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.WEBSITE_API_KEY;
    if (!expected) return jsonResponse({ error: "Server misconfigured" }, 500);
    const key = request.headers.get("x-api-key");
    if (!key || !timingSafeStringEqual(key, expected)) {
      return jsonResponse({ error: "Invalid API key" }, 401);
    }
    let payload: { source?: string };
    try {
      payload = JSON.parse(await request.text());
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    if (!payload.source) {
      return jsonResponse({ error: "source is required" }, 400);
    }
    const workspaceId = await ctx.runQuery(
      internal.messaging.getStaycoolWorkspaceIdInternal,
      {},
    );
    if (!workspaceId) {
      return jsonResponse({ error: "Workspace not provisioned" }, 500);
    }
    const result = await ctx.runMutation(internal.tasks.completeBySource, {
      workspaceId,
      source: payload.source,
    });
    return jsonResponse(result, 200);
  }),
});

export default http;

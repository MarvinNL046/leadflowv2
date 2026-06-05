import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { verifyStateToken } from "./metaOauth";
import { getSiteUrl } from "./lib/env";
import { encryptSecret } from "./lib/crypto";

const http = httpRouter();

auth.addHttpRoutes(http);

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

    return jsonResponse({ received: true, type: payload.type }, 200);
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

// ──────────────────────────────────────────────────────────────────────
// Shared HMAC helper voor SMS/WA (Meta gebruikt eigen wrapper)
// ──────────────────────────────────────────────────────────────────────

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
  phoneNumber?: string;
  body?: string;
  message?: string;
  messageId?: string;
  id?: string;
  status?: string;
  mediaUrl?: string;
  mediaType?: string;
}

export default http;

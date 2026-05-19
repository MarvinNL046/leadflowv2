import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Meta OAuth flow — server-side initiation.
 *
 * Architectuur:
 *  - `startOauth` (action, vanaf de browser) → genereert HMAC-signed state
 *    + Facebook authorize-URL. Frontend doet `window.location = url`.
 *  - `/auth/meta/callback` (HTTP route in http.ts) → verifieert state,
 *    wisselt code in voor long-lived user-token, fetcht pages, upsert.
 *
 * State-token (i.p.v. cookie omdat Convex HTTP actions geen first-party
 * cookies hebben):
 *   payload = base64url(JSON.stringify({orgId, userId, exp, nonce}))
 *   token = `${payload}.${base64url(HMAC-SHA256(payload, secret))}`
 * Exp = 10 minuten. Replay-protectie: code-exchange faalt sowieso na
 * eerste gebruik (Meta-codes zijn single-use), dus state-replay levert
 * geen werkbare tokens op.
 *
 * Env-vars (set via `npx convex env set`):
 *   META_APP_ID                — Facebook App ID
 *   META_APP_SECRET            — voor token-exchange (al gezet voor webhook)
 *   META_OAUTH_STATE_SECRET    — random hex string voor HMAC-state
 *
 * Registreer in Facebook App "Valid OAuth Redirect URIs":
 *   <CONVEX_SITE_URL>/auth/meta/callback
 *
 * Required permissions (zelfde set als v1):
 *   pages_show_list, pages_read_engagement, pages_read_user_content,
 *   leads_retrieval, pages_manage_ads, business_management, ads_read
 */

const META_OAUTH_VERSION = "v21.0";

const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "leads_retrieval",
  "pages_manage_ads",
  "business_management",
  "ads_read",
].join(",");

export const startOauth = action({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args): Promise<{
    redirectUrl: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Niet ingelogd");

    const appId = process.env.META_APP_ID;
    if (!appId) {
      throw new Error("META_APP_ID niet geconfigureerd in Convex env");
    }
    const stateSecret = process.env.META_OAUTH_STATE_SECRET;
    if (!stateSecret) {
      throw new Error("META_OAUTH_STATE_SECRET niet geconfigureerd");
    }
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) {
      throw new Error("CONVEX_SITE_URL niet beschikbaar (Convex bug?)");
    }

    // Auth-check: user moet membership hebben op deze org
    const hasAccess: boolean = await ctx.runQuery(
      internal.metaOauth.userHasOrgAccess,
      { userId, orgId: args.orgId },
    );
    if (!hasAccess) {
      throw new Error("Geen toegang tot deze organisatie");
    }

    const redirectUri = `${siteUrl}/auth/meta/callback`;
    const state = await createStateToken(
      { orgId: args.orgId, userId, exp: Date.now() + 10 * 60_000, nonce: randomNonce() },
      stateSecret,
    );

    const url = new URL(`https://www.facebook.com/${META_OAUTH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", META_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("auth_type", "rerequest");

    return { redirectUrl: url.toString() };
  },
});

// ──────────────────────────────────────────────────────────────────────
// Internal helper (gebruikt door startOauth)
// ──────────────────────────────────────────────────────────────────────

import { internalQuery } from "./_generated/server";

export const userHasOrgAccess = internalQuery({
  args: { userId: v.id("users"), orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const m = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", args.userId).eq("orgId", args.orgId),
      )
      .first();
    return Boolean(m);
  },
});

// ──────────────────────────────────────────────────────────────────────
// State-token helpers (export voor http.ts)
// ──────────────────────────────────────────────────────────────────────

export interface StatePayload {
  orgId: Id<"orgs">;
  userId: Id<"users">;
  /** Expiry in epoch-ms */
  exp: number;
  nonce: string;
}

/** Hex random voor de nonce. WebCrypto i.p.v. node crypto omdat dit ook
 *  in V8-runtime moet draaien. */
function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(payload: string, secret: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return new Uint8Array(sig);
}

export async function createStateToken(
  payload: StatePayload,
  secret: string,
): Promise<string> {
  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);
  const sig = await hmacSha256(encodedPayload, secret);
  return `${encodedPayload}.${base64UrlEncode(sig)}`;
}

/**
 * Verifieer + decode state-token. Returns null bij invalid signature,
 * expired, of malformed input — caller mag dat ALTIJD afhandelen.
 */
export async function verifyStateToken(
  token: string,
  secret: string,
): Promise<StatePayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSig] = parts;

  // Constant-time compare op de hex-string van de sig
  const expected = await hmacSha256(encodedPayload, secret);
  const provided = base64UrlDecode(encodedSig);
  if (expected.length !== provided.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ provided[i];
  if (diff !== 0) return null;

  // Decode payload
  let payload: StatePayload;
  try {
    const json = new TextDecoder().decode(base64UrlDecode(encodedPayload));
    payload = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
    return null;
  }
  return payload;
}

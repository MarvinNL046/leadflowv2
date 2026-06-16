# E-mail Marketing Module (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een `Campagnes`-module in LeadFlow v2 waarmee StayCool veilig marketing-broadcasts naar gesegmenteerde contacten stuurt, met werkende afmeld-/consent-laag.

**Architecture:** Drie lagen bovenop bestaande infra. (1) **Consent** — afmeld-status op `contacts`, ondertekend (HMAC) afmeldtoken, publieke unsubscribe HTTP-routes, auto-cleanen via de bestaande Resend-webhook. (2) **Segmenten** — opslaanbare filter-regels + pure resolver die altijd niet-mailbare contacten weglaat. (3) **Broadcasts** — getemporiseerde, hervatbare send-pipeline via de Convex-scheduler die `messaging.sendViaResend`-patroon hergebruikt en elke send logt in `messages`. Testbare logica wordt in pure `*Logic.ts`-modules getrokken (bestaand projectpatroon), Convex-functies bedraden ze.

**Tech Stack:** Convex (^1.40), TanStack Router, shadcn/ui, Resend (via `fetch`), Web Crypto (`crypto.subtle`), Vitest (pure-logic tests).

**Spec:** `docs/superpowers/specs/2026-06-16-email-marketing-module-design.md`

**Bewuste afwijking van de spec (niet stil weggelaten):** "Inplannen" (broadcast op een
*toekomstig* tijdstip versturen) zit wél in het schema (`scheduledAt`, status `scheduled`) maar
krijgt in fase 1 géén UI/mutation — fase 1 levert alleen **"Nu versturen"**. Reden: de
getemporiseerde batch-pipeline + alle consent-plumbing is de kern-waarde; een geplande start is
een kleine toevoeging (één extra mutation + `scheduler.runAt`) die we bewust naar een vervolg-PR
schuiven om fase 1 klein en testbaar te houden. Het schema laat het zonder migratie toe.

---

## File Structure

**Nieuw — Convex:**
- `convex/unsubscribeToken.ts` — pure HMAC sign/verify van afmeldtokens
- `convex/unsubscribeToken.test.ts` — roundtrip + tamper-rejectie
- `convex/segmentsLogic.ts` — pure regel-matcher + `isMailable` + `dedupeByEmail`
- `convex/segmentsLogic.test.ts`
- `convex/segments.ts` — Convex CRUD + `preview` + internal `resolveRecipients`
- `convex/broadcastsLogic.ts` — pure `nextBatch` + footer/header-helpers
- `convex/broadcastsLogic.test.ts`
- `convex/broadcasts.ts` — Convex create/sendTest/schedule/sendNow/cancel + internal batch-runner
- `convex/consent.ts` — internal mutations: contact afmelden / cleanen

**Wijzigen — Convex:**
- `convex/schema.ts` — 3 velden + index op `contacts`; tabellen `segments`, `broadcasts`
- `convex/http.ts` — `GET`/`POST /unsubscribe`; webhook uitbreiden met contact-cleanen + broadcast-stats

**Nieuw — Frontend:**
- `src/routes/crm.campaigns.tsx` — pagina met 3 tabs (Segmenten/Broadcasts/Templates)
- `src/routes/crm.campaigns_.$id.tsx` — broadcast-detail met live stats
- `src/components/crm/campaigns/segment-list.tsx`
- `src/components/crm/campaigns/segment-builder.tsx`
- `src/components/crm/campaigns/broadcast-list.tsx`
- `src/components/crm/campaigns/broadcast-composer.tsx`

**Wijzigen — Frontend:**
- `src/components/crm/sidebar.tsx` — nav-item `Campagnes`

---

# MILESTONE A — Consent-fundament

## Task A1: Schema — consent-velden + index op `contacts`

**Files:**
- Modify: `convex/schema.ts` (contacts-tabel, ~regel 108-160)

- [ ] **Step 1: Voeg 3 velden toe binnen `contacts: defineTable({ ... })`**

Voeg deze toe direct ná `unreachable: v.optional(v.boolean()),`:

```ts
    // ── Marketing-consent (e-mail module). Afwezig = subscribed (impliciete
    // opt-in: contact zocht zelf contact). cleaned = harde bounce/spam-klacht.
    emailMarketingStatus: v.optional(
      v.union(
        v.literal("subscribed"),
        v.literal("unsubscribed"),
        v.literal("cleaned"),
      ),
    ),
    marketingUnsubscribedAt: v.optional(v.number()),
    marketingUnsubReason: v.optional(
      v.union(
        v.literal("user"),
        v.literal("bounced"),
        v.literal("complained"),
        v.literal("manual"),
      ),
    ),
```

- [ ] **Step 2: Voeg index toe** onderaan de contacts-index-keten (ná `by_workspace_nextFollowUp`):

```ts
    .index("by_workspace_marketingStatus", ["workspaceId", "emailMarketingStatus"])
```

- [ ] **Step 3: Verifieer dat het schema compileert**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex codegen`
Expected: geen type-errors; `convex/_generated` ververst.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(schema): marketing-consent velden + index op contacts"
```

---

## Task A2: Afmeldtoken — pure HMAC sign/verify (TDD)

**Files:**
- Create: `convex/unsubscribeToken.ts`
- Test: `convex/unsubscribeToken.test.ts`

- [ ] **Step 1: Schrijf de falende test**

```ts
// convex/unsubscribeToken.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUnsubToken, verifyUnsubToken } from "./unsubscribeToken";

beforeAll(() => {
  // 32 bytes hex — zelfde formaat als ENCRYPTION_KEY in productie
  process.env.ENCRYPTION_KEY = "a".repeat(64);
});

describe("unsubscribe token", () => {
  it("roundtrip: verify geeft originele contactId terug", async () => {
    const token = await signUnsubToken("contact_123");
    expect(await verifyUnsubToken(token)).toBe("contact_123");
  });

  it("afgewezen bij geknoeide handtekening", async () => {
    const token = await signUnsubToken("contact_123");
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(await verifyUnsubToken(tampered)).toBeNull();
  });

  it("afgewezen bij rommel-input", async () => {
    expect(await verifyUnsubToken("niet-een-token")).toBeNull();
    expect(await verifyUnsubToken("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verwacht FAIL**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/unsubscribeToken.test.ts`
Expected: FAIL — module `./unsubscribeToken` bestaat niet.

- [ ] **Step 3: Implementeer `convex/unsubscribeToken.ts`**

```ts
/**
 * Stateless afmeldtoken: base64url(contactId) + "." + base64url(HMAC-SHA256).
 * HMAC-sleutel = ENCRYPTION_KEY (zelfde 32-byte hex als crypto.ts). Geen
 * opslag/sessie nodig — werkt ook maanden na verzending. Web Crypto, dus
 * draait in Convex' V8-runtime én in vitest (Node 20 global crypto).
 */

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("ENCRYPTION_KEY ontbreekt of is geen 64-hex (32 bytes).");
  }
  return crypto.subtle.importKey(
    "raw",
    hexToBytes(hex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signUnsubToken(contactId: string): Promise<string> {
  const key = await hmacKey();
  const idBytes = new TextEncoder().encode(contactId);
  const sigBuf = await crypto.subtle.sign("HMAC", key, idBytes);
  return `${b64urlEncode(idBytes)}.${b64urlEncode(new Uint8Array(sigBuf))}`;
}

/** Geeft contactId terug bij geldige handtekening, anders null. */
export async function verifyUnsubToken(token: string): Promise<string | null> {
  try {
    const [idPart, sigPart] = token.split(".");
    if (!idPart || !sigPart) return null;
    const idBytes = b64urlDecode(idPart);
    const sigBytes = b64urlDecode(sigPart);
    const key = await hmacKey();
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, idBytes);
    if (!ok) return null;
    return new TextDecoder().decode(idBytes);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test — verwacht PASS**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/unsubscribeToken.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/unsubscribeToken.ts convex/unsubscribeToken.test.ts
git commit -m "feat(consent): stateless HMAC afmeldtoken + tests"
```

---

## Task A3: Consent-mutations (contact afmelden / cleanen)

**Files:**
- Create: `convex/consent.ts`

- [ ] **Step 1: Implementeer `convex/consent.ts`**

```ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/** Zet contact op unsubscribed (gebruiker klikte afmelden). Idempotent. */
export const unsubscribeContact = internalMutation({
  args: {
    contactId: v.id("contacts"),
    reason: v.union(v.literal("user"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return { ok: false as const };
    if (contact.emailMarketingStatus === "cleaned") return { ok: true as const };
    await ctx.db.patch(args.contactId, {
      emailMarketingStatus: "unsubscribed",
      marketingUnsubscribedAt: Date.now(),
      marketingUnsubReason: args.reason,
    });
    return { ok: true as const };
  },
});

/** Markeer het contact achter een externalMessageId als cleaned (hard bounce
 *  of spam-klacht). Wordt aangeroepen vanuit de Resend-webhook. */
export const cleanContactByExternalId = internalMutation({
  args: {
    externalMessageId: v.string(),
    reason: v.union(v.literal("bounced"), v.literal("complained")),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_external_id", (q) =>
        q.eq("externalMessageId", args.externalMessageId),
      )
      .first();
    if (!message?.contactId) return { ok: false as const };
    await ctx.db.patch(message.contactId, {
      emailMarketingStatus: "cleaned",
      marketingUnsubscribedAt: Date.now(),
      marketingUnsubReason: args.reason,
    });
    return { ok: true as const, broadcastId: message.relatedEntityId };
  },
});
```

- [ ] **Step 2: Verifieer codegen**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex codegen`
Expected: geen errors; `internal.consent.*` beschikbaar.

- [ ] **Step 3: Commit**

```bash
git add convex/consent.ts convex/_generated
git commit -m "feat(consent): internal mutations unsubscribe + clean contact"
```

---

## Task A4: Publieke unsubscribe HTTP-routes

**Files:**
- Modify: `convex/http.ts` (voeg routes toe bij de andere `http.route(...)`-aanroepen)

- [ ] **Step 1: Zorg dat imports kloppen bovenaan `http.ts`**

Controleer dat `internal` geïmporteerd is (uit `./_generated/api`) — dat is al zo (webhook gebruikt het). Voeg toe:

```ts
import { verifyUnsubToken } from "./unsubscribeToken";
```

- [ ] **Step 2: Voeg een gedeelde handler + twee routes toe** (onder de bestaande resend-webhook-route):

```ts
// ════════════════════════════════════════════════════════════════════
// PUBLIEKE UNSUBSCRIBE — GET (mens) + POST (Gmail one-click List-Unsubscribe)
// URL: {CONVEX_SITE_URL}/unsubscribe?token=<token>
// ════════════════════════════════════════════════════════════════════

async function handleUnsubscribe(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  request: Request,
): Promise<boolean> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const contactId = await verifyUnsubToken(token);
  if (!contactId) return false;
  const res = await ctx.runMutation(internal.consent.unsubscribeContact, {
    contactId: contactId as never,
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
```

- [ ] **Step 3: Codegen + deploy naar dev**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: deploy slaagt; geen type-errors.

- [ ] **Step 4: Handmatige rooktest (optioneel maar aangeraden)**

Genereer in een Convex-dashboard-functie of test een token voor een bestaand contact, open `{CONVEX_SITE_URL}/unsubscribe?token=<token>` in de browser → zie "Je bent afgemeld"; check in het dashboard dat het contact `emailMarketingStatus: "unsubscribed"` heeft.

- [ ] **Step 5: Commit**

```bash
git add convex/http.ts
git commit -m "feat(consent): publieke unsubscribe routes (GET pagina + POST one-click)"
```

---

## Task A5: Webhook uitbreiden — bounce/complaint cleant contact

**Files:**
- Modify: `convex/http.ts` (resend-webhook-handler, ~regel 422-451)

- [ ] **Step 1: Voeg ná de bestaande `updateStatusByExternalId`-aanroep contact-cleanen toe**

Direct ná de `await ctx.runMutation(internal.messaging.updateStatusByExternalId, {...})`-aanroep, vóór de `return jsonResponse(...)`:

```ts
    // Marketing-consent: harde bounce of spam-klacht → contact permanent
    // uit alle verzendingen (cleaned). Alleen voor deze twee event-types.
    if (payload.type === "email.bounced" || payload.type === "email.complained") {
      await ctx.runMutation(internal.consent.cleanContactByExternalId, {
        externalMessageId: externalId,
        reason: payload.type === "email.complained" ? "complained" : "bounced",
      });
    }
```

- [ ] **Step 2: Codegen + deploy dev**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: deploy slaagt.

- [ ] **Step 3: Commit**

```bash
git add convex/http.ts
git commit -m "feat(consent): Resend bounce/complaint cleant contact automatisch"
```

---

# MILESTONE B — Segmenten

## Task B1: Schema — `segments`-tabel

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Voeg de tabel toe** (bv. onder de CRM CORE-sectie, ná `crmSettings`):

```ts
  segments: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
    rules: v.object({
      match: v.union(v.literal("all"), v.literal("any")),
      conditions: v.array(
        v.object({
          field: v.string(),
          op: v.string(),
          value: v.any(),
        }),
      ),
    }),
    cachedCount: v.optional(v.number()),
    cachedAt: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"]),
```

- [ ] **Step 2: Codegen**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex codegen`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(schema): segments-tabel"
```

---

## Task B2: Pure regel-matcher + isMailable + dedupe (TDD)

**Files:**
- Create: `convex/segmentsLogic.ts`
- Test: `convex/segmentsLogic.test.ts`

- [ ] **Step 1: Schrijf de falende test**

```ts
// convex/segmentsLogic.test.ts
import { describe, it, expect } from "vitest";
import {
  contactMatchesRules,
  isMailable,
  dedupeByEmail,
  type MatchableContact,
} from "./segmentsLogic";

const base: MatchableContact = {
  emailMarketingStatus: undefined,
  email: "a@x.nl",
  tags: ["klant"],
  city: "Maastricht",
  province: "Limburg",
  callCount: 0,
  createdAt: 1_000,
  stageId: "stage_won",
  source: "meta",
  custom: {},
};

describe("isMailable", () => {
  it("subscribed (afwezig) + email = mailbaar", () => {
    expect(isMailable({ emailMarketingStatus: undefined, email: "a@x.nl" })).toBe(true);
  });
  it("unsubscribed = niet mailbaar", () => {
    expect(isMailable({ emailMarketingStatus: "unsubscribed", email: "a@x.nl" })).toBe(false);
  });
  it("cleaned = niet mailbaar", () => {
    expect(isMailable({ emailMarketingStatus: "cleaned", email: "a@x.nl" })).toBe(false);
  });
  it("geen email = niet mailbaar", () => {
    expect(isMailable({ emailMarketingStatus: undefined, email: undefined })).toBe(false);
  });
});

describe("contactMatchesRules", () => {
  it("match all: alle condities waar", () => {
    const rules = {
      match: "all" as const,
      conditions: [
        { field: "tags", op: "contains", value: "klant" },
        { field: "city", op: "eq", value: "Maastricht" },
      ],
    };
    expect(contactMatchesRules(base, rules)).toBe(true);
  });
  it("match all: één conditie onwaar → false", () => {
    const rules = {
      match: "all" as const,
      conditions: [
        { field: "tags", op: "contains", value: "klant" },
        { field: "city", op: "eq", value: "Heerlen" },
      ],
    };
    expect(contactMatchesRules(base, rules)).toBe(false);
  });
  it("match any: minstens één waar → true", () => {
    const rules = {
      match: "any" as const,
      conditions: [
        { field: "city", op: "eq", value: "Heerlen" },
        { field: "source", op: "eq", value: "meta" },
      ],
    };
    expect(contactMatchesRules(base, rules)).toBe(true);
  });
  it("callCount gt", () => {
    const rules = { match: "all" as const, conditions: [{ field: "callCount", op: "gt", value: 0 }] };
    expect(contactMatchesRules(base, rules)).toBe(false);
    expect(contactMatchesRules({ ...base, callCount: 3 }, rules)).toBe(true);
  });
  it("createdAt before", () => {
    const rules = { match: "all" as const, conditions: [{ field: "createdAt", op: "before", value: 2000 }] };
    expect(contactMatchesRules(base, rules)).toBe(true);
  });
  it("custom veld", () => {
    const rules = { match: "all" as const, conditions: [{ field: "custom:huistype", op: "eq", value: "vrijstaand" }] };
    expect(contactMatchesRules({ ...base, custom: { huistype: "vrijstaand" } }, rules)).toBe(true);
  });
  it("lege condities → iedereen matcht", () => {
    expect(contactMatchesRules(base, { match: "all", conditions: [] })).toBe(true);
  });
});

describe("dedupeByEmail", () => {
  it("houdt eerste per (lowercased) email, dropt rest + lege emails", () => {
    const rows = [
      { id: "1", email: "A@x.nl" },
      { id: "2", email: "a@x.nl" },
      { id: "3", email: undefined },
      { id: "4", email: "b@x.nl" },
    ];
    expect(dedupeByEmail(rows).map((r) => r.id)).toEqual(["1", "4"]);
  });
});
```

- [ ] **Step 2: Run test — verwacht FAIL**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/segmentsLogic.test.ts`
Expected: FAIL — module bestaat niet.

- [ ] **Step 3: Implementeer `convex/segmentsLogic.ts`**

```ts
export type SegmentMatch = "all" | "any";
export type Condition = { field: string; op: string; value: unknown };
export type SegmentRules = { match: SegmentMatch; conditions: Condition[] };

/** Contact afgevlakt tot precies de velden waarop een segment filtert. De
 *  Convex-resolver bouwt dit object (joins op opportunities/attribution/custom). */
export type MatchableContact = {
  emailMarketingStatus?: "subscribed" | "unsubscribed" | "cleaned";
  email?: string;
  tags: string[];
  city?: string;
  province?: string;
  callCount: number;
  createdAt: number;
  stageId?: string;
  source?: string;
  custom: Record<string, unknown>;
};

export function isMailable(c: {
  emailMarketingStatus?: string;
  email?: string;
}): boolean {
  if (!c.email) return false;
  return c.emailMarketingStatus !== "unsubscribed" && c.emailMarketingStatus !== "cleaned";
}

function fieldValue(c: MatchableContact, field: string): unknown {
  if (field.startsWith("custom:")) return c.custom[field.slice("custom:".length)];
  switch (field) {
    case "tags": return c.tags;
    case "city": return c.city;
    case "province": return c.province;
    case "callCount": return c.callCount;
    case "createdAt": return c.createdAt;
    case "stage": return c.stageId;
    case "source": return c.source;
    default: return undefined;
  }
}

function evalCondition(c: MatchableContact, cond: Condition): boolean {
  const actual = fieldValue(c, cond.field);
  const expected = cond.value;
  switch (cond.op) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "contains":
      return Array.isArray(actual)
        ? actual.includes(expected as never)
        : typeof actual === "string" && actual.includes(String(expected));
    case "in":
      return Array.isArray(expected) && expected.includes(actual as never);
    case "gt": return typeof actual === "number" && actual > Number(expected);
    case "lt": return typeof actual === "number" && actual < Number(expected);
    case "before": return typeof actual === "number" && actual < Number(expected);
    case "after": return typeof actual === "number" && actual > Number(expected);
    default: return false;
  }
}

export function contactMatchesRules(c: MatchableContact, rules: SegmentRules): boolean {
  if (rules.conditions.length === 0) return true;
  const results = rules.conditions.map((cond) => evalCondition(c, cond));
  return rules.match === "all" ? results.every(Boolean) : results.some(Boolean);
}

/** Dedupliceer op lowercased email; behoud volgorde; drop rijen zonder email. */
export function dedupeByEmail<T extends { email?: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r.email) continue;
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
```

- [ ] **Step 4: Run test — verwacht PASS**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/segmentsLogic.test.ts`
Expected: PASS (alle tests).

- [ ] **Step 5: Commit**

```bash
git add convex/segmentsLogic.ts convex/segmentsLogic.test.ts
git commit -m "feat(segments): pure regel-matcher + isMailable + dedupe + tests"
```

---

## Task B3: Segmenten Convex CRUD + resolver

**Files:**
- Create: `convex/segments.ts`

- [ ] **Step 1: Implementeer `convex/segments.ts`**

```ts
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  contactMatchesRules,
  isMailable,
  dedupeByEmail,
  type MatchableContact,
  type SegmentRules,
} from "./segmentsLogic";

const rulesValidator = v.object({
  match: v.union(v.literal("all"), v.literal("any")),
  conditions: v.array(v.object({ field: v.string(), op: v.string(), value: v.any() })),
});

async function requireWorkspace(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", workspace.orgId))
    .first();
  if (!membership) throw new Error("Not a member of this workspace");
}

/** Bouw het MatchableContact-object: vlak de joins af die een segment nodig
 *  heeft (laatste opportunity-stage + attributie-bron + custom fields). */
async function toMatchable(
  ctx: QueryCtx,
  contact: { _id: Id<"contacts">; _creationTime: number } & Record<string, unknown>,
): Promise<MatchableContact> {
  const lastOpp = await ctx.db
    .query("opportunities")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .order("desc")
    .first();
  const attribution = await ctx.db
    .query("leadAttribution")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .first();
  const customRows = await ctx.db
    .query("customFieldValues")
    .withIndex("by_entity", (q) =>
      q.eq("entityType", "contact").eq("entityId", contact._id as unknown as string),
    )
    .collect();
  const custom: Record<string, unknown> = {};
  for (const row of customRows) {
    const def = await ctx.db.get(row.definitionId);
    if (def) custom[def.key] = row.value;
  }
  return {
    emailMarketingStatus: contact.emailMarketingStatus as MatchableContact["emailMarketingStatus"],
    email: contact.email as string | undefined,
    tags: (contact.tags as string[] | undefined) ?? [],
    city: contact.city as string | undefined,
    province: contact.province as string | undefined,
    callCount: (contact.callCount as number | undefined) ?? 0,
    createdAt: contact._creationTime,
    stageId: lastOpp?.stageId,
    source: attribution?.source,
    custom,
  };
}

/** Gedeelde resolver: alle contacten in workspace → filter rules + mailbaar +
 *  dedupe. Geeft lichtgewicht recipient-rijen terug. */
async function resolve(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  rules: SegmentRules,
): Promise<Array<{ contactId: Id<"contacts">; email: string; firstName?: string; lastName?: string }>> {
  const contacts = await ctx.db
    .query("contacts")
    .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  const out: Array<{ contactId: Id<"contacts">; email: string; firstName?: string; lastName?: string }> = [];
  for (const c of contacts) {
    if (c.deletedAt) continue;
    if (!isMailable({ emailMarketingStatus: c.emailMarketingStatus, email: c.email })) continue;
    const matchable = await toMatchable(ctx, c);
    if (!contactMatchesRules(matchable, rules)) continue;
    out.push({ contactId: c._id, email: c.email as string, firstName: c.firstName, lastName: c.lastName });
  }
  return dedupeByEmail(out);
}

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db
      .query("segments")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
    rules: rulesValidator,
  },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db.insert("segments", {
      workspaceId: args.workspaceId,
      name: args.name,
      description: args.description,
      rules: args.rules,
    });
  },
});

export const update = mutation({
  args: {
    segmentId: v.id("segments"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    rules: v.optional(rulesValidator),
  },
  handler: async (ctx, args) => {
    const seg = await ctx.db.get(args.segmentId);
    if (!seg) throw new Error("Segment not found");
    await requireWorkspace(ctx, seg.workspaceId);
    await ctx.db.patch(args.segmentId, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.rules !== undefined ? { rules: args.rules } : {}),
    });
  },
});

export const remove = mutation({
  args: { segmentId: v.id("segments") },
  handler: async (ctx, args) => {
    const seg = await ctx.db.get(args.segmentId);
    if (!seg) return;
    await requireWorkspace(ctx, seg.workspaceId);
    await ctx.db.delete(args.segmentId);
  },
});

/** Live preview voor de builder: aantal + steekproef (max 10 namen/emails).
 *  Draait de regels zónder ze op te slaan. */
export const preview = query({
  args: { workspaceId: v.id("workspaces"), rules: rulesValidator },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    const rows = await resolve(ctx, args.workspaceId, args.rules);
    return {
      count: rows.length,
      sample: rows.slice(0, 10).map((r) => ({
        email: r.email,
        name: [r.firstName, r.lastName].filter(Boolean).join(" "),
      })),
    };
  },
});

/** Internal: ontvangers voor een opgeslagen segment (broadcast-pipeline). */
export const resolveRecipients = internalQuery({
  args: { segmentId: v.id("segments") },
  handler: async (ctx, args) => {
    const seg = await ctx.db.get(args.segmentId);
    if (!seg) return [];
    return await resolve(ctx, seg.workspaceId, seg.rules);
  },
});
```

- [ ] **Step 2: Codegen**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex codegen`
Expected: geen errors; `api.segments.*` + `internal.segments.resolveRecipients` beschikbaar.

- [ ] **Step 3: Commit**

```bash
git add convex/segments.ts convex/_generated
git commit -m "feat(segments): Convex CRUD + preview + resolveRecipients"
```

---

## Task B4: Sidebar-item + Campagnes-route shell met tabs

**Files:**
- Modify: `src/components/crm/sidebar.tsx`
- Create: `src/routes/crm.campaigns.tsx`

- [ ] **Step 1: Sidebar — voeg `Send`-icon + nav-item toe**

In `src/components/crm/sidebar.tsx`, voeg `Send` toe aan de lucide-import (regel 2-12) en voeg het nav-item toe aan `NAV` ná de Workflows-regel:

```ts
  { to: '/crm/campaigns', label: 'Campagnes', icon: Send },
```

- [ ] **Step 2: Maak de route-shell `src/routes/crm.campaigns.tsx`**

```tsx
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { cn } from '#/lib/utils.ts'
import { SegmentList } from '#/components/crm/campaigns/segment-list.tsx'
import { BroadcastList } from '#/components/crm/campaigns/broadcast-list.tsx'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/campaigns')({ component: CampaignsPage })

const TABS = [
  { key: 'broadcasts', label: 'Broadcasts' },
  { key: 'segments', label: 'Segmenten' },
] as const

function CampaignsPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const workspaceId = tenants?.find((t) => t.workspace !== null)?.workspace?.id as
    | Id<'workspaces'>
    | undefined
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('broadcasts')

  if (tenants === undefined) return <Skeleton className="h-64 w-full" />
  if (!workspaceId)
    return (
      <Card><CardContent className="p-6">
        <p className="text-sm text-amber-700">Geen workspace gekoppeld.</p>
      </CardContent></Card>
    )

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">Campagnes</h1>
      <div className="flex gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.key
                ? 'border-violet-600 text-violet-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'broadcasts' && <BroadcastList workspaceId={workspaceId} />}
      {tab === 'segments' && <SegmentList workspaceId={workspaceId} />}
    </div>
  )
}
```

> **Templates-tab:** bewust géén derde tab in fase 1 — templates hebben al een
> volwaardige pagina onder `/crm/settings/templates`. De composer (Task C4) biedt
> "start vanaf template" via `api.emailTemplates.list`. Voeg later een tab toe als je
> templates ook hier wilt beheren.

- [ ] **Step 3: Codegen routes (TanStack genereert routeTree)**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx tsc --noEmit -p tsconfig.json` (of start `npm run dev` kort) — verwacht alleen errors over nog-niet-bestaande `segment-list`/`broadcast-list` (komen in B5/C4).

- [ ] **Step 4: Commit**

```bash
git add src/components/crm/sidebar.tsx src/routes/crm.campaigns.tsx
git commit -m "feat(campaigns): sidebar-item + route-shell met tabs"
```

---

## Task B5: Segment-list + builder UI

**Files:**
- Create: `src/components/crm/campaigns/segment-list.tsx`
- Create: `src/components/crm/campaigns/segment-builder.tsx`

- [ ] **Step 1: `segment-builder.tsx` — filter-bouwer met live preview**

```tsx
import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

type Condition = { field: string; op: string; value: string }
const FIELDS = [
  { key: 'tags', label: 'Tag', ops: ['contains'] },
  { key: 'city', label: 'Plaats', ops: ['eq', 'neq'] },
  { key: 'province', label: 'Provincie', ops: ['eq', 'neq'] },
  { key: 'source', label: 'Bron', ops: ['eq', 'neq'] },
  { key: 'stage', label: 'Pipeline-stage', ops: ['eq', 'neq'] },
  { key: 'callCount', label: 'Belpogingen', ops: ['eq', 'gt', 'lt'] },
]

export function SegmentBuilder({
  workspaceId,
  onDone,
}: {
  workspaceId: Id<'workspaces'>
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [match, setMatch] = useState<'all' | 'any'>('all')
  const [conditions, setConditions] = useState<Condition[]>([
    { field: 'tags', op: 'contains', value: '' },
  ])
  const create = useMutation(api.segments.create)

  // Coerce numerieke velden naar number voor de preview/rules.
  const rules = {
    match,
    conditions: conditions
      .filter((c) => c.value !== '')
      .map((c) => ({
        field: c.field,
        op: c.op,
        value: c.field === 'callCount' ? Number(c.value) : c.value,
      })),
  }
  const preview = useQuery(api.segments.preview, { workspaceId, rules })

  const setCond = (i: number, patch: Partial<Condition>) =>
    setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const save = async () => {
    if (!name.trim()) return toast.error('Geef het segment een naam')
    try {
      await create({ workspaceId, name: name.trim(), rules })
      toast.success('Segment opgeslagen')
      onDone()
    } catch (e) {
      toast.error(humanizeConvexError(e))
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
      <div>
        <Label>Naam</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Klanten Limburg" />
      </div>

      <div className="flex items-center gap-2 text-sm">
        Match
        <select
          className="rounded border px-2 py-1"
          value={match}
          onChange={(e) => setMatch(e.target.value as 'all' | 'any')}
        >
          <option value="all">alle</option>
          <option value="any">één van</option>
        </select>
        van de volgende:
      </div>

      {conditions.map((c, i) => {
        const field = FIELDS.find((f) => f.key === c.field) ?? FIELDS[0]
        return (
          <div key={i} className="flex items-center gap-2">
            <select className="rounded border px-2 py-1 text-sm" value={c.field}
              onChange={(e) => setCond(i, { field: e.target.value, op: FIELDS.find((f) => f.key === e.target.value)!.ops[0] })}>
              {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select className="rounded border px-2 py-1 text-sm" value={c.op}
              onChange={(e) => setCond(i, { op: e.target.value })}>
              {field.ops.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
            <Input className="flex-1" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} />
            <Button variant="ghost" size="icon" onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <Button variant="outline" size="sm"
        onClick={() => setConditions((cs) => [...cs, { field: 'tags', op: 'contains', value: '' }])}>
        <Plus className="mr-1 h-4 w-4" /> Conditie
      </Button>

      <div className="rounded bg-zinc-50 p-3 text-sm">
        {preview === undefined ? 'Berekenen…' : (
          <>
            <strong>{preview.count}</strong> contacten matchen.
            {preview.sample.length > 0 && (
              <span className="text-zinc-500"> Bv. {preview.sample.slice(0, 3).map((s) => s.name || s.email).join(', ')}…</span>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={save}>Segment opslaan</Button>
        <Button variant="ghost" onClick={onDone}>Annuleren</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `segment-list.tsx` — lijst + "nieuw segment"**

```tsx
import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { SegmentBuilder } from './segment-builder.tsx'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

export function SegmentList({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const segments = useQuery(api.segments.list, { workspaceId })
  const remove = useMutation(api.segments.remove)
  const [creating, setCreating] = useState(false)

  if (segments === undefined) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nieuw segment
        </Button>
      )}
      {creating && <SegmentBuilder workspaceId={workspaceId} onDone={() => setCreating(false)} />}

      {segments.length === 0 && !creating && (
        <Card><CardContent className="p-6 text-sm text-zinc-500">Nog geen segmenten.</CardContent></Card>
      )}

      {segments.map((s) => (
        <Card key={s._id}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-zinc-500">
                Match {s.rules.match === 'all' ? 'alle' : 'één van'} · {s.rules.conditions.length} condities
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove({ segmentId: s._id })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verifieer dat het bouwt**

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: build slaagt (geen TS-errors over campaigns-bestanden).

- [ ] **Step 4: Handmatige rooktest**

`npm run dev` → open `/crm/campaigns` → tab Segmenten → "Nieuw segment" → maak `tags contains klant`, zie live teller, sla op, zie het in de lijst.

- [ ] **Step 5: Commit**

```bash
git add src/components/crm/campaigns/segment-list.tsx src/components/crm/campaigns/segment-builder.tsx
git commit -m "feat(segments): segment-list + builder UI met live preview"
```

---

# MILESTONE C — Broadcasts + send-pipeline

## Task C1: Schema — `broadcasts`-tabel

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Voeg de tabel toe** (ná `segments`):

```ts
  broadcasts: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    subject: v.string(),
    body: v.optional(v.string()),            // HTML; leeg als templateId gezet
    templateId: v.optional(v.id("emailTemplates")),
    segmentId: v.id("segments"),
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    scheduledAt: v.optional(v.number()),
    stats: v.object({
      total: v.number(),
      sent: v.number(),
      delivered: v.number(),
      bounced: v.number(),
      unsubscribed: v.number(),
      failed: v.number(),
    }),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  }).index("by_workspace_status", ["workspaceId", "status"]),
```

- [ ] **Step 2: Codegen**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex codegen`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(schema): broadcasts-tabel"
```

---

## Task C2: Pure pipeline-helpers — nextBatch + footer + headers (TDD)

**Files:**
- Create: `convex/broadcastsLogic.ts`
- Test: `convex/broadcastsLogic.test.ts`

- [ ] **Step 1: Schrijf de falende test**

```ts
// convex/broadcastsLogic.test.ts
import { describe, it, expect } from "vitest";
import { nextBatch, injectUnsubFooter, buildListUnsubHeaders } from "./broadcastsLogic";

describe("nextBatch", () => {
  it("geeft tot batchSize ids die nog niet verzonden zijn, in volgorde", () => {
    const all = ["a", "b", "c", "d", "e"];
    const sent = new Set(["a", "c"]);
    expect(nextBatch(all, sent, 2)).toEqual(["b", "d"]);
  });
  it("lege batch als alles verzonden is", () => {
    expect(nextBatch(["a", "b"], new Set(["a", "b"]), 10)).toEqual([]);
  });
});

describe("injectUnsubFooter", () => {
  it("voegt afmeldlink toe vóór </body>", () => {
    const out = injectUnsubFooter("<html><body><p>hoi</p></body></html>", "https://x/u?token=t");
    expect(out).toContain("https://x/u?token=t");
    expect(out.indexOf("token=t")).toBeLessThan(out.indexOf("</body>"));
  });
  it("plakt footer achteraan als er geen </body> is", () => {
    const out = injectUnsubFooter("<p>hoi</p>", "https://x/u?token=t");
    expect(out).toContain("https://x/u?token=t");
    expect(out.startsWith("<p>hoi</p>")).toBe(true);
  });
});

describe("buildListUnsubHeaders", () => {
  it("zet List-Unsubscribe + One-Click POST header", () => {
    const h = buildListUnsubHeaders("https://x/unsubscribe?token=t");
    expect(h["List-Unsubscribe"]).toBe("<https://x/unsubscribe?token=t>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
```

- [ ] **Step 2: Run test — verwacht FAIL**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/broadcastsLogic.test.ts`
Expected: FAIL — module bestaat niet.

- [ ] **Step 3: Implementeer `convex/broadcastsLogic.ts`**

```ts
/** Volgende batch contact-ids die nog geen verzonden message hebben. */
export function nextBatch(
  allIds: string[],
  sentIds: Set<string>,
  batchSize: number,
): string[] {
  const out: string[] = [];
  for (const id of allIds) {
    if (sentIds.has(id)) continue;
    out.push(id);
    if (out.length >= batchSize) break;
  }
  return out;
}

/** Injecteer de afmeld-footer net vóór </body> (of plak achteraan). */
export function injectUnsubFooter(html: string, unsubUrl: string): string {
  const footer =
    `<hr style="margin-top:32px;border:none;border-top:1px solid #e4e4e7">` +
    `<p style="font-size:12px;color:#71717a;text-align:center;margin-top:12px">` +
    `Je ontvangt deze mail omdat je klant of aanvrager bent bij StayCool Airco. ` +
    `<a href="${unsubUrl}" style="color:#71717a">Afmelden</a></p>`;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return html + footer;
  return html.slice(0, idx) + footer + html.slice(idx);
}

/** RFC 8058 one-click unsubscribe headers (Gmail/Yahoo bulk-sender vereiste). */
export function buildListUnsubHeaders(unsubUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
```

- [ ] **Step 4: Run test — verwacht PASS**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/broadcastsLogic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/broadcastsLogic.ts convex/broadcastsLogic.test.ts
git commit -m "feat(broadcasts): pure pipeline-helpers (nextBatch/footer/headers) + tests"
```

---

## Task C3: Broadcasts Convex — CRUD, testmail, scheduler, batch-runner

**Files:**
- Create: `convex/broadcasts.ts`

Context: de send hergebruikt hetzelfde Resend-`fetch`-patroon als `messaging.sendViaResend`, maar met per-recipient `headers` (List-Unsubscribe) en logt elke send in `messages` met `relatedEntityType:"broadcast"`. Batch via Resend's `/emails/batch` (max 100). Tempo via `ctx.scheduler.runAfter`.

- [ ] **Step 1: Implementeer `convex/broadcasts.ts`**

```ts
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { renderTemplate, htmlToPlainText, leadTemplateVars } from "./templateRender";
import { signUnsubToken } from "./unsubscribeToken";
import { nextBatch, injectUnsubFooter, buildListUnsubHeaders } from "./broadcastsLogic";

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 10_000;

async function requireWorkspace(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", workspace.orgId))
    .first();
  if (!membership) throw new Error("Not a member of this workspace");
}

const ZERO_STATS = { total: 0, sent: 0, delivered: 0, bounced: 0, unsubscribed: 0, failed: 0 };

// ── Queries ──────────────────────────────────────────────────────────
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db
      .query("broadcasts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return null;
    await requireWorkspace(ctx, b.workspaceId);
    return b;
  },
});

// ── Mutations ────────────────────────────────────────────────────────
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    segmentId: v.id("segments"),
  },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db.insert("broadcasts", {
      workspaceId: args.workspaceId,
      name: args.name,
      subject: args.subject,
      body: args.body,
      segmentId: args.segmentId,
      status: "draft",
      stats: ZERO_STATS,
    });
  },
});

export const cancel = mutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return;
    await requireWorkspace(ctx, b.workspaceId);
    if (b.status === "scheduled" || b.status === "sending") {
      await ctx.db.patch(args.broadcastId, { status: "cancelled" });
    }
  },
});

// ── Actions: testmail + verzenden ────────────────────────────────────
export const sendTest = action({
  args: { broadcastId: v.id("broadcasts"), toEmail: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: args.broadcastId });
    if (!b) throw new Error("Broadcast niet gevonden");
    const vars = leadTemplateVars({ firstName: "Test", lastName: "" }, b.companyName);
    const html = injectUnsubFooter(renderTemplate(b.body, vars), "https://example.com/unsubscribe?token=TEST");
    await postBatch([
      {
        from: b.from,
        to: args.toEmail,
        subject: `[TEST] ${renderTemplate(b.subject, vars)}`,
        html,
        text: htmlToPlainText(html),
      },
    ]);
    return { ok: true };
  },
});

export const sendNow = action({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args): Promise<{ total: number }> => {
    const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: args.broadcastId });
    if (!b) throw new Error("Broadcast niet gevonden");
    const recipients = await ctx.runQuery(internal.segments.resolveRecipients, { segmentId: b.segmentId });
    await ctx.runMutation(internal.broadcasts.startSending, {
      broadcastId: args.broadcastId,
      total: recipients.length,
    });
    await ctx.scheduler.runAfter(0, internal.broadcasts.runBatch, { broadcastId: args.broadcastId });
    return { total: recipients.length };
  },
});

// ── Internal: orchestratie ───────────────────────────────────────────
export const loadForSend = internalQuery({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return null;
    const settings = await ctx.db
      .query("crmSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", b.workspaceId))
      .first();
    const org = await (async () => {
      const ws = await ctx.db.get(b.workspaceId);
      return ws ? await ctx.db.get(ws.orgId) : null;
    })();
    return {
      ...b,
      companyName: settings?.companyName ?? org?.name ?? "StayCool Airco",
      from: process.env.EMAIL_FROM ?? "noreply@example.com",
    };
  },
});

export const startSending = internalMutation({
  args: { broadcastId: v.id("broadcasts"), total: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.broadcastId, {
      status: "sending",
      startedAt: Date.now(),
      stats: { ...ZERO_STATS, total: args.total },
    });
  },
});

/** Welke contacten in dit segment hebben al een sent/pending message voor deze
 *  broadcast? (idempotentie/hervatbaarheid). */
export const alreadySentContactIds = internalQuery({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) => q) // we filteren in code op relatedEntityId
      .collect();
    return rows
      .filter((m) => m.relatedEntityType === "broadcast" && m.relatedEntityId === args.broadcastId)
      .map((m) => m.contactId)
      .filter((id): id is Id<"contacts"> => id !== undefined);
  },
});

export const recordSends = internalMutation({
  args: {
    broadcastId: v.id("broadcasts"),
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    sends: v.array(
      v.object({
        contactId: v.id("contacts"),
        to: v.string(),
        externalMessageId: v.optional(v.string()),
        failed: v.boolean(),
        errorMessage: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let sent = 0;
    let failed = 0;
    for (const s of args.sends) {
      await ctx.db.insert("messages", {
        workspaceId: args.workspaceId,
        contactId: s.contactId,
        channel: "email",
        direction: "outbound",
        status: s.failed ? "failed" : "sent",
        externalMessageId: s.externalMessageId,
        to: s.to,
        subject: args.subject,
        body: "",
        relatedEntityType: "broadcast",
        relatedEntityId: args.broadcastId,
        sentAt: s.failed ? undefined : Date.now(),
        errorMessage: s.errorMessage,
      });
      if (s.failed) failed++;
      else sent++;
    }
    const b = await ctx.db.get(args.broadcastId);
    if (b) {
      await ctx.db.patch(args.broadcastId, {
        stats: { ...b.stats, sent: b.stats.sent + sent, failed: b.stats.failed + failed },
      });
    }
  },
});

export const finishSending = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (b && b.status === "sending") {
      await ctx.db.patch(args.broadcastId, { status: "sent", completedAt: Date.now() });
    }
  },
});

export const runBatch = internalAction({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args): Promise<void> => {
    const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: args.broadcastId });
    if (!b || b.status === "cancelled") return;

    const recipients = await ctx.runQuery(internal.segments.resolveRecipients, { segmentId: b.segmentId });
    const sentIds = new Set(
      (await ctx.runQuery(internal.broadcasts.alreadySentContactIds, { broadcastId: args.broadcastId })).map(String),
    );
    const batchIds = nextBatch(recipients.map((r) => String(r.contactId)), sentIds, BATCH_SIZE);

    if (batchIds.length === 0) {
      await ctx.runMutation(internal.broadcasts.finishSending, { broadcastId: args.broadcastId });
      return;
    }

    const batch = recipients.filter((r) => batchIds.includes(String(r.contactId)));
    const siteUrl = process.env.CONVEX_SITE_URL ?? "";

    const emails = await Promise.all(
      batch.map(async (r) => {
        const token = await signUnsubToken(String(r.contactId));
        const unsubUrl = `${siteUrl}/unsubscribe?token=${token}`;
        const vars = leadTemplateVars(
          { firstName: r.firstName ?? "", lastName: r.lastName ?? "" },
          b.companyName,
        );
        const html = injectUnsubFooter(renderTemplate(b.body ?? "", vars), unsubUrl);
        return {
          from: b.from,
          to: r.email,
          subject: renderTemplate(b.subject, vars),
          html,
          text: htmlToPlainText(html),
          headers: buildListUnsubHeaders(unsubUrl),
          _contactId: r.contactId,
        };
      }),
    );

    let results: Array<{ id?: string }> = [];
    let batchFailed = false;
    try {
      results = await postBatch(emails.map(({ _contactId, ...e }) => e));
    } catch {
      batchFailed = true;
    }

    await ctx.runMutation(internal.broadcasts.recordSends, {
      broadcastId: args.broadcastId,
      workspaceId: b.workspaceId,
      subject: b.subject,
      sends: emails.map((e, i) => ({
        contactId: e._contactId,
        to: e.to,
        externalMessageId: batchFailed ? undefined : results[i]?.id,
        failed: batchFailed,
        errorMessage: batchFailed ? "Resend batch-call mislukt" : undefined,
      })),
    });

    // Volgende batch inplannen (getemporiseerd) zolang er nog ontvangers zijn.
    await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.broadcasts.runBatch, {
      broadcastId: args.broadcastId,
    });
  },
});

// ── Resend batch-helper ──────────────────────────────────────────────
async function postBatch(
  emails: Array<{
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
  }>,
): Promise<Array<{ id?: string }>> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY niet geconfigureerd");
  const res = await fetch(RESEND_BATCH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend batch ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  return data.data ?? [];
}
```

> **Schaal-noot:** `alreadySentContactIds` scant nu alle `messages` en filtert in
> code op `relatedEntityId`. Prima voor StayCool's volume (fase 1). Bij groei: voeg
> een index `by_relatedEntity` toe op `messages` `["relatedEntityType","relatedEntityId"]`
> en gebruik `withIndex`. Genoteerd als fase-2 optimalisatie.

- [ ] **Step 2: Codegen**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex codegen`
Expected: geen errors; `api.broadcasts.*` beschikbaar.

- [ ] **Step 3: Commit**

```bash
git add convex/broadcasts.ts convex/_generated
git commit -m "feat(broadcasts): CRUD + testmail + getemporiseerde hervatbare send-pipeline"
```

---

## Task C4: Broadcast-composer + list + detail UI

**Files:**
- Create: `src/components/crm/campaigns/broadcast-composer.tsx`
- Create: `src/components/crm/campaigns/broadcast-list.tsx`
- Create: `src/routes/crm.campaigns_.$id.tsx`

- [ ] **Step 1: `broadcast-composer.tsx` — opstellen + testmail + verzenden**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useAction } from 'convex/react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

export function BroadcastComposer({
  workspaceId,
  onDone,
}: {
  workspaceId: Id<'workspaces'>
  onDone: () => void
}) {
  const segments = useQuery(api.segments.list, { workspaceId })
  const templates = useQuery(api.emailTemplates.list, { workspaceId })
  const create = useMutation(api.broadcasts.create)
  const sendTest = useAction(api.broadcasts.sendTest)
  const sendNow = useAction(api.broadcasts.sendNow)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [segmentId, setSegmentId] = useState<string>('')
  const [draftId, setDraftId] = useState<Id<'broadcasts'> | null>(null)
  const [busy, setBusy] = useState(false)

  const preview = useQuery(
    api.segments.preview,
    segmentId
      ? { workspaceId, rules: segments?.find((s) => s._id === segmentId)?.rules ?? { match: 'all', conditions: [] } }
      : 'skip',
  )

  const saveDraft = async (): Promise<Id<'broadcasts'>> => {
    if (!name || !subject || !body || !segmentId) throw new Error('Vul naam, onderwerp, body en segment in')
    if (draftId) return draftId
    const id = await create({
      workspaceId,
      name,
      subject,
      body,
      segmentId: segmentId as Id<'segments'>,
    })
    setDraftId(id)
    return id
  }

  const onTest = async () => {
    setBusy(true)
    try {
      const id = await saveDraft()
      const to = window.prompt('Stuur testmail naar welk e-mailadres?', 'info@staycoolairco.nl')
      if (!to) return
      await sendTest({ broadcastId: id, toEmail: to })
      toast.success('Testmail verzonden')
    } catch (e) {
      toast.error(humanizeConvexError(e))
    } finally {
      setBusy(false)
    }
  }

  const onSend = async () => {
    setBusy(true)
    try {
      const id = await saveDraft()
      const n = preview?.count ?? 0
      if (!window.confirm(`Je staat op het punt ${n} mensen te mailen. Doorgaan?`)) return
      const res = await sendNow({ broadcastId: id })
      toast.success(`Verzending gestart naar ${res.total} contacten`)
      onDone()
    } catch (e) {
      toast.error(humanizeConvexError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
      <div><Label>Interne naam</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div>
        <Label>Segment</Label>
        <select className="w-full rounded border px-2 py-2 text-sm" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
          <option value="">— kies segment —</option>
          {segments?.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        {segmentId && <p className="mt-1 text-xs text-zinc-500">{preview === undefined ? 'Berekenen…' : `${preview.count} ontvangers`}</p>}
      </div>
      <div>
        <Label>Onderwerp</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="bv. Onderhoudstip voor de zomer" />
      </div>
      <div>
        <Label>Body (HTML) — start eventueel vanaf een template</Label>
        {templates && templates.length > 0 && (
          <select className="mb-2 w-full rounded border px-2 py-1 text-sm"
            onChange={(e) => {
              const t = templates.find((x) => x._id === e.target.value)
              if (t) { setBody(t.body); if (!subject) setSubject(t.subject) }
            }}>
            <option value="">— template invoegen —</option>
            {templates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        )}
        <textarea className="h-48 w-full rounded border p-2 font-mono text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="mt-1 text-xs text-zinc-500">Vars: {'{{contact.firstName}}'}, {'{{company}}'}. Afmeldlink wordt automatisch toegevoegd.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onTest} disabled={busy}>Testmail naar mezelf</Button>
        <Button onClick={onSend} disabled={busy}>Verstuur</Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>Annuleren</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `broadcast-list.tsx`**

```tsx
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { BroadcastComposer } from './broadcast-composer.tsx'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

export function BroadcastList({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const broadcasts = useQuery(api.broadcasts.list, { workspaceId })
  const [creating, setCreating] = useState(false)

  if (broadcasts === undefined) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> Nieuwe broadcast</Button>
      )}
      {creating && <BroadcastComposer workspaceId={workspaceId} onDone={() => setCreating(false)} />}

      {broadcasts.length === 0 && !creating && (
        <Card><CardContent className="p-6 text-sm text-zinc-500">Nog geen broadcasts.</CardContent></Card>
      )}

      {broadcasts.map((b) => (
        <Link key={b._id} to="/crm/campaigns/$id" params={{ id: b._id }}>
          <Card className="transition-colors hover:bg-zinc-50">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="text-xs text-zinc-500">{b.subject}</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span>{b.stats.sent}/{b.stats.total} verzonden</span>
                <Badge>{b.status}</Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: `src/routes/crm.campaigns_.$id.tsx` — detail met live stats**

```tsx
import { createFileRoute, useParams, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/campaigns_/$id')({ component: BroadcastDetail })

function BroadcastDetail() {
  const { id } = useParams({ from: '/crm/campaigns_/$id' })
  const b = useQuery(api.broadcasts.get, { broadcastId: id as Id<'broadcasts'> })
  const cancel = useMutation(api.broadcasts.cancel)

  if (b === undefined) return <Skeleton className="m-4 h-64" />
  if (b === null) return <p className="p-4 text-sm text-zinc-500">Broadcast niet gevonden.</p>

  const stat = (label: string, value: number) => (
    <div className="rounded-lg border border-zinc-200 p-4 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  )

  return (
    <div className="space-y-6 p-4">
      <Link to="/crm/campaigns" className="inline-flex items-center gap-1 text-sm text-zinc-500">
        <ArrowLeft className="h-4 w-4" /> Campagnes
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{b.name}</h1>
          <p className="text-sm text-zinc-500">{b.subject}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge>{b.status}</Badge>
          {(b.status === 'sending' || b.status === 'scheduled') && (
            <Button variant="outline" onClick={() => cancel({ broadcastId: b._id })}>Annuleren</Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Statistieken (live)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {stat('Totaal', b.stats.total)}
          {stat('Verzonden', b.stats.sent)}
          {stat('Afgeleverd', b.stats.delivered)}
          {stat('Gebounced', b.stats.bounced)}
          {stat('Afgemeld', b.stats.unsubscribed)}
          {stat('Mislukt', b.stats.failed)}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Build**

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: build slaagt.

- [ ] **Step 5: Commit**

```bash
git add src/components/crm/campaigns/broadcast-composer.tsx src/components/crm/campaigns/broadcast-list.tsx src/routes/crm.campaigns_.\$id.tsx
git commit -m "feat(broadcasts): composer + list + detail UI met live stats"
```

---

## Task C5: Webhook — delivered/bounced/unsubscribed → broadcast-stats

**Files:**
- Create: `convex/broadcasts.ts` (voeg internal mutation toe) — of in stap 1 hieronder
- Modify: `convex/http.ts` (resend-webhook)

- [ ] **Step 1: Voeg internal mutation `bumpStatFromExternalId` toe aan `convex/broadcasts.ts`**

```ts
export const bumpStatFromExternalId = internalMutation({
  args: {
    externalMessageId: v.string(),
    field: v.union(v.literal("delivered"), v.literal("bounced"), v.literal("unsubscribed")),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_external_id", (q) => q.eq("externalMessageId", args.externalMessageId))
      .first();
    if (!message || message.relatedEntityType !== "broadcast" || !message.relatedEntityId) return;
    const b = await ctx.db.get(message.relatedEntityId as Id<"broadcasts">);
    if (!b) return;
    await ctx.db.patch(b._id, { stats: { ...b.stats, [args.field]: b.stats[args.field] + 1 } });
  },
});
```

- [ ] **Step 2: In `convex/http.ts` webhook — bump de broadcast-stat ná de status-update**

Voeg toe binnen het `if (payload.type === "email.bounced" || ...)`-blok (Task A5) een `delivered`-tak en stats-bumps. Vervang dat blok door:

```ts
    if (payload.type === "email.delivered") {
      await ctx.runMutation(internal.broadcasts.bumpStatFromExternalId, {
        externalMessageId: externalId,
        field: "delivered",
      });
    }
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
```

> De `unsubscribed`-stat-bump koppelen we niet aan een Resend-event maar verhogen
> we direct in `consent.unsubscribeContact` als het contact via een broadcast-message
> kwam. **YAGNI fase 1:** laat `unsubscribed`-teller op 0 of tel 'm later; afmeldingen
> zijn al zichtbaar via de contact-status. Niet blokkerend.

- [ ] **Step 3: Codegen + deploy dev**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: deploy slaagt.

- [ ] **Step 4: Commit**

```bash
git add convex/broadcasts.ts convex/http.ts convex/_generated
git commit -m "feat(broadcasts): webhook bumpt delivered/bounced stats live"
```

---

## Task C6: End-to-end rooktest op mini-segment

**Files:** geen — handmatige verificatie

- [ ] **Step 1: Controleer Resend-config**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex env list | grep -E "RESEND|EMAIL_FROM|ENCRYPTION_KEY|RESEND_WEBHOOK_SECRET"`
Expected: `RESEND_API_KEY`, `EMAIL_FROM` (geverifieerd domein), `ENCRYPTION_KEY`, `RESEND_WEBHOOK_SECRET` aanwezig. Ontbreekt er één → eerst zetten via `npx convex env set`.

- [ ] **Step 2: Maak een mini-segment** in de UI dat alleen jouw eigen testcontacten matcht (bv. `tags contains test`). Tag 1-2 testcontacten met een echt e-mailadres dat je beheert.

- [ ] **Step 3: Maak een broadcast**, stuur eerst een **testmail naar jezelf**, controleer dat de afmeldlink in de footer staat en werkt (klik → "Je bent afgemeld" → contact-status `unsubscribed` in dashboard).

- [ ] **Step 4: Hertag/heraanmeld** een vers testcontact, **Verstuur** de broadcast naar het mini-segment, bevestig de dry-run-prompt. Controleer: mail komt binnen, `messages` heeft rijen met `relatedEntityType:"broadcast"`, broadcast-detail toont `sent` oplopen en (na Resend-webhook) `delivered`.

- [ ] **Step 5: Verifieer idempotentie** — trigger `runBatch` niet handmatig opnieuw nodig; bevestig dat geen dubbele mails binnenkwamen (één per ontvanger).

- [ ] **Step 6: Commit (alleen als er fixes nodig waren)** — anders niets te committen; noteer de uitkomst in de PR-omschrijving.

---

## Eind-verificatie (hele module)

- [ ] `cd /home/marvin/Projecten/leadflowv2 && npm run test` → alle vitest-suites groen (incl. `unsubscribeToken`, `segmentsLogic`, `broadcastsLogic`).
- [ ] `npm run build` → slaagt.
- [ ] `npm run check` (biome) → geen nieuwe lint-fouten in toegevoegde bestanden.
- [ ] Sidebar toont `Campagnes`; `/crm/campaigns` rendert beide tabs; detailpagina werkt.

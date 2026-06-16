# E-mail Marketing Module — Fase 1 (Broadcasts + Consent + Segmenten)

**Datum:** 2026-06-16
**Repo:** leadflowv2 (Convex + TanStack/Vite + shadcn/ui)
**Scope:** Eén workspace (StayCool), eigen Resend-account. Multi-tenant-uitrol is later.
**Status:** Ontwerp goedgekeurd, klaar voor implementatieplan.

---

## 1. Doel & context

StayCool heeft ~5.000 contacten (eigen leads/klanten — formulier, Meta-ads, offerte-aanvraag,
installatie; grondslag = bewust contact gezocht, soft opt-in). Doel is een **marketing-e-mail
module ín het CRM** — geen hardcoded flows, maar een tool die Marvin zelf via de UI beheert,
vergelijkbaar met Mailchimp.

Deze fase 1 levert het **fundament + broadcasts**. Drip-flows komen in fase 2 (de workflow-engine
ligt daar al voor klaar — zie §9).

**Niet-doelen (fase 1):** drip-flows, A/B-tests, analytics-dashboards, multi-tenant per-domein
sending, apart afzend-subdomein.

### Beslissingen uit de brainstorm (vastgelegd)
- **Scope:** alleen StayCool-workspace eerst (later generaliseren).
- **Prioriteit-aanpak:** fundament + broadcasts eerst; flows = fase 2.
- **Consent:** ondertekende afmeldlink (HMAC), géén opgeslagen token-kolom.
- **Send-logging:** hergebruik bestaande `messages`-tabel, géén aparte recipients-tabel.
- **Afzenddomein:** zelfde domein als transactioneel (geen apart subdomein). Risico geaccepteerd;
  gemitigeerd door lage klachtkans (schone lijst + makkelijke afmeldknop).
- **Send-pipeline:** getemporiseerde batches via Convex-scheduler; hervatbaar via `messages`-log.

---

## 2. Modulevorm

Eén nieuwe sidebar-link **`Campagnes`** → route `/crm/campaigns`, met drie tabs:

1. **Segmenten** — opslaanbare filters over contacten *(nieuw)*
2. **Broadcasts** — losse mail componeren → segment kiezen → nu sturen of inplannen *(nieuw)*
3. **Templates** — herbruikbare mail-blokken *(hergebruikt bestaande `emailTemplates`)*

Twee gedeelde lagen eronder:
- **Consent-laag** — afmeld-status per contact + publieke afmeld-pagina + auto-geïnjecteerde
  afmeldlink/header in elke marketingmail. Filtert afgemelde/gebouncede contacten uit élke verzending.
- **Send-pipeline** — hergebruikt `messaging.sendInternal` (Resend) + Convex-scheduler voor
  inplannen en getemporiseerd batchen.

**Isolatieprincipe:** Segmenten weten niks van Broadcasts (leveren alleen "geef me de matchende
contacten"); Broadcasts weten niks van hoe een Segment intern is opgebouwd. Elk stuk apart te
begrijpen en te testen.

---

## 3. Datamodel

### 3.1 Velden bij op `contacts` (3 nieuwe, allemaal optioneel — geen migratie nodig)

```ts
emailMarketingStatus: v.optional(
  v.union(v.literal("subscribed"), v.literal("unsubscribed"), v.literal("cleaned"))
),                                   // afwezig = subscribed (impliciete opt-in, grondslag A)
marketingUnsubscribedAt: v.optional(v.number()),
marketingUnsubscribedReason: v.optional(
  v.union(v.literal("user"), v.literal("bounced"), v.literal("complained"), v.literal("manual"))
),
```

- **afwezig = `subscribed`** → de 5k bestaande contacten doen automatisch mee, geen backfill.
- **`cleaned`** = harde bounce of spam-klacht → permanent uit elke verzending. Automatisch gezet
  door de Resend-webhook (§5.3).
- Index toevoegen voor efficiënt filteren in de resolver:
  `by_workspace_marketingStatus` op `["workspaceId", "emailMarketingStatus"]`.

### 3.2 Nieuwe tabel `segments`

```ts
segments: defineTable({
  workspaceId: v.id("workspaces"),
  name: v.string(),
  description: v.optional(v.string()),
  rules: v.object({
    match: v.union(v.literal("all"), v.literal("any")),
    conditions: v.array(v.object({
      field: v.string(),     // "tags" | "stage" | "source" | "city" | "province"
                             //  | "callCount" | "createdAt" | "custom:<key>"
      op: v.string(),        // "eq" | "neq" | "contains" | "gt" | "lt" | "before" | "after" | "in"
      value: v.any(),
    })),
  }),
  // optionele cache voor UX (live teller); mag leeg bij MVP
  cachedCount: v.optional(v.number()),
  cachedAt: v.optional(v.number()),
}).index("by_workspace", ["workspaceId"]),
```

Een aparte **resolver-query** vertaalt `rules` → contacten en filtert **altijd** `unsubscribed` +
`cleaned` eruit en dedupliceert op e-mail. Filter-velden bestaan al op `contacts`/gerelateerde
tabellen: `tags[]`, stage (via `opportunities`→`pipelineStages`), `leadAttribution.source`,
`city`/`province`, `callCount`, `_creationTime`, custom fields (`customFieldValues`).

### 3.3 Nieuwe tabel `broadcasts`

```ts
broadcasts: defineTable({
  workspaceId: v.id("workspaces"),
  name: v.string(),
  subject: v.string(),
  // body óf via template:
  body: v.optional(v.string()),            // HTML
  templateId: v.optional(v.id("emailTemplates")),
  segmentId: v.id("segments"),
  status: v.union(
    v.literal("draft"), v.literal("scheduled"), v.literal("sending"),
    v.literal("sent"), v.literal("cancelled"), v.literal("failed")
  ),
  scheduledAt: v.optional(v.number()),
  stats: v.object({
    total: v.number(), sent: v.number(), delivered: v.number(),
    bounced: v.number(), unsubscribed: v.number(), failed: v.number(),
  }),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
}).index("by_workspace_status", ["workspaceId", "status"]),
```

### 3.4 Hergebruik (géén nieuwe tabellen)

- **`messages`** — elke send wordt hierin gelogd met `relatedEntityType:"broadcast"` +
  `relatedEntityId:<broadcastId>`, `channel:"email"`, `externalMessageId` (Resend), status.
  Geeft gratis: per-contact status (bestaande `updateStatusByExternalId`-webhook werkt al),
  **dedup/hervatbaarheid** (bestaat er al een `sent`-rij voor broadcast+contact?), en weergave
  in de bestaande inbox per contact.
- **`emailTemplates`** — Templates-tab.
- **`webhookEvents`** + bestaande Resend-webhook — status-updates en auto-cleanen.

---

## 4. Consent & afmelden

### 4.1 Ondertekende afmeldlink (geen opslag)

- Link in elke marketingmail: `https://app.wetryleadflow.com/u/<token>`.
- `token` = base64url van `contactId` + HMAC-SHA256 over `contactId` met bestaande
  `ENCRYPTION_KEY` (zie `convex/lib/crypto.ts`). Stateless: geen token-kolom, geen sessie;
  werkt ook maanden later.
- Publieke route verifieert de handtekening → zet `emailMarketingStatus:"unsubscribed"`,
  `marketingUnsubscribedAt`, `marketingUnsubscribedReason:"user"`. Toont bevestigingspagina
  ("Je bent afgemeld") + optie "toch weer aanmelden".

### 4.2 `List-Unsubscribe`-headers (verplicht)

Elke broadcast krijgt `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
headers (via Resend custom headers). Vereist door Gmail/Yahoo bulk-sender regels (feb 2024) voor
afzenders ~5k+/dag. Geeft de "Afmelden"-knop bovenin Gmail/Apple Mail; de one-click POST landt op
dezelfde afmeld-route.

### 4.3 Marketing ≠ transactioneel (de gouden scheiding)

De consent-gate zit **uitsluitend** in de broadcast/segment-route. `messaging.send`
(offertes, lead-respons) blijft naar iedereen gaan — ook naar afgemelde contacten. Afmelden raakt
nooit transactionele mail.

---

## 5. Send-pipeline

Wanneer de gebruiker op **Verstuur** of **Plan in** klikt:

1. **Resolve** — segment → contactId's mét consent-gate (sluit `unsubscribed` + `cleaned` uit;
   afwezige status telt als `subscribed`) en dedup op e-mail.
   `broadcasts.stats.total` wordt vastgelegd; status → `scheduled`/`sending`.
2. **Getemporiseerde batches** — Resend batch-endpoint (`/emails/batch`, max 100 per call) +
   Convex-scheduler: batch N+1 wordt enkele seconden ná batch N ingepland. Richttempo ~100 per
   ~10s (~9 min voor 5k); instelbaar. Blijft binnen Resend rate limits en is reputatie-vriendelijk.
3. **Per mail** — merge-velden invullen (`{{firstName}}` e.d.), afmeld-footer + `List-Unsubscribe`
   injecteren, versturen, loggen in `messages` (`pending` + `externalMessageId`).
4. **Idempotent/hervatbaar** — vóór verzenden: bestaat er al een `messages`-rij voor
   (broadcastId + contactId) met status `sent`? Zo ja, skip. Crash/deploy halverwege → herstart
   hervat zonder dubbele mails.
5. **Live stats** — `sending → sent`; daarna druppelen `delivered`/`bounced`/`unsubscribed` binnen
   via de webhook. Broadcast-kaart werkt real-time bij (Convex reactive).
6. **Annuleren** — status `cancelled`; geplande batches stoppen, reeds verzonden mail blijft staan.

### 5.3 Webhook → auto-cleanen

Bestaande `/webhooks/resend` (svix-geverifieerd) breidt uit:
- `email.bounced` (hard) → contact `cleaned`, reason `bounced`.
- `email.complained` (spam) → contact `cleaned`, reason `complained`.
- `email.delivered` → broadcast-stat `delivered++`.
Loopt via `externalMessageId` → `messages` → `contactId` → contact-status.

**Bewust weggelaten (YAGNI fase 1):** verzendvenster/quiet-hours, A/B, per-mail retry-met-backoff
(webhook + `cleaned` vangt bounces al af).

---

## 6. UI

Hergebruikt bestaande shadcn/ui-componenten en het bestaande CRM-layoutpatroon.

**Tab Segmenten:** lijst met opgeslagen segmenten + live aantal. "Nieuw segment" → filter-bouwer
(`match alle/één van` + rijen `{veld, operator, waarde}`). **Live preview-teller +
voorbeeldcontacten** tijdens het bouwen.

**Tab Broadcasts:** lijst met status + stats. "Nieuwe broadcast" → naam, segment kiezen (toont
aantal), onderwerp, body (leeg of vanaf template), **testmail naar mezelf**, dan *Nu sturen* /
*Inplannen*. Detailpagina na verzenden: live-stats + ontvangerslijst (uit `messages`).

**Tab Templates:** CRUD op bestaande `emailTemplates` (naam, subject, HTML-body, merge-var-helper).

**Sidebar:** één item toevoegen aan het nav-array in `src/components/crm/sidebar.tsx`
(`{ to: '/crm/campaigns', label: 'Campagnes', icon: Send }`).

---

## 7. Testen & vangrails

- **Convex-functietests** (vitest, al geconfigureerd):
  - segment-resolver: consent-gate (`unsubscribed`/`cleaned` eruit) + dedup op e-mail werkt;
  - afmeld-token: sign/verify-roundtrip, afgewezen bij geknoeide handtekening;
  - send-pipeline: idempotentie (geen dubbele mail bij herstart);
  - webhook: `bounced`/`complained` → `cleaned`-overgang.
- **Verplichte testmail** vóór elke verzending ("stuur test naar mezelf").
- **Dry-run bevestiging** bij "Nu sturen": toont exact aantal ("Je staat op het punt 4.812 mensen
  te mailen") vóór verzending. Geen per-ongeluk-blast.
- **Eerste echte broadcast** op mini-segment (jij + testadressen) vóór de 5k.

---

## 8. Bestaande bouwstenen (bevestigd in code)

- `convex/messaging.ts` — `send` / `sendInternal` posten al naar Resend
  (`RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_URL`). Broadcasts hergebruiken dit.
- `convex/http.ts` — `/webhooks/resend` met svix-signatuurverificatie bestaat al.
- `convex/messaging.ts` — `updateStatusByExternalId` mapt webhook-status → `messages`.
- `emailTemplates`-tabel bestaat (Templates-tab).
- `src/components/crm/sidebar.tsx` — simpel nav-array, één item erbij.
- `convex/lib/crypto.ts` — AES/HMAC met `ENCRYPTION_KEY` (afmeld-token).

---

## 9. Fase 2 (buiten scope, hier alleen als context)

De drip-engine ligt al klaar in het schema: `workflows`, `workflowNodes`, `workflowEdges`,
`workflowExecutions` (met `pausedUntil` + `scheduledFunctionId`), `workflowExecutionLogs` —
trigger/action/condition/**delay**-nodes op een canvas. Fase 2 = email-actie-node + marketing-
triggers (bv. "X maanden na installatie → onderhoudsmail") aansluiten op het fundament uit fase 1
(consent, segmenten, templates, send-pipeline). Let op: een trigger als "installatiedatum"
vereist mogelijk eerst dat veld op het contact/opportunity-model.

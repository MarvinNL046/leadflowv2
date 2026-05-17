# Meta Lead Ads — V1 extract voor V2 rebuild

**Volume in v1 (workspace 12, mei 2026):** 352 leads via 8+ formulieren = 80% van alle inbound. Verreweg de belangrijkste integratie om correct over te zetten.

## Wat doet het

Klant ziet een Meta-ad (Facebook/Instagram) → klikt "Meer info" → Meta toont in-app formulier → vult in en submit → Meta stuurt webhook event naar LeadFlow → wij halen lead-details op via Graph API → maken contact + opportunity + attribution-row aan in DB → triggert workflow (auto-SMS naar nieuwe lead).

## Files in v1 (alleen wat moet meeverhuizen)

| File | Rol | V2-actie |
|---|---|---|
| `src/app/api/webhooks/meta/route.ts` | Inbound webhook endpoint (GET=verify, POST=leadgen events) | Herbouw als Convex HTTP action |
| `src/lib/integrations/meta/client.ts` | Graph API client + signature verification | Port naar Convex action, dezelfde HMAC SHA-256 logica |
| `src/lib/integrations/meta/processor.ts` | Async processor (raw lead → contact + opportunity) | Port naar Convex mutations + actions |
| `src/lib/integrations/meta/index.ts` | Public exports | Trivieel |
| `src/app/api/jobs/process-meta-leads/route.ts` | QStash job dat processor batch-aanroept | Convex scheduler vervangt QStash |
| `src/app/api/meta/data-deletion/route.ts` | GDPR data-deletion callback (verplicht door Meta) | Port als Convex action met dezelfde verify-token logica |

## Webhook setup (Meta-side configuratie)

In Meta App Dashboard → Webhooks:
- **Callback URL:** `https://wetryleadflow.com/api/webhooks/meta` (in v2: `https://wetryleadflow.com/_convex/http/meta-webhook` of equivalent)
- **Verify Token:** matched aan `META_WEBHOOK_VERIFY_TOKEN` env-var
- **Fields subscribed:** `leadgen` (en optioneel `messaging` voor lead-via-messenger)
- **App Secret** (voor signature verify): in `META_APP_SECRET` env-var

## Webhook flow (POST `/api/webhooks/meta`)

```
Meta sends event ──▶ POST /api/webhooks/meta
                       │
                       ├─ 1. Read raw body (verbatim — needed for signature verify)
                       ├─ 2. Verify X-Hub-Signature-256 via HMAC-SHA256(rawBody, META_APP_SECRET)
                       │    timingSafeEqual om timing attacks te voorkomen
                       │    → 401 als invalid
                       ├─ 3. Parse JSON, filter on object === "page"
                       ├─ 4. Voor elke entry.changes met field === "leadgen":
                       │       - lookup metaPages WHERE pageId = entry.id AND isActive
                       │       - idempotency: skip als leadgenId al in metaLeadRaw
                       │       - INSERT metaLeadRaw {status: "pending", payload: {...}}
                       │       - INSERT webhookEvents {provider: "meta", status: "received"} voor audit
                       ├─ 5. Ook entry.messaging[].leadgen support (lead via Messenger)
                       ├─ 6. Als events > 0 en QStash configured:
                       │       publishJSON to /api/jobs/process-meta-leads
                       │       met dedup-id "meta-leads-<sha1>" zodat duplicate batches niet draaien
                       └─ 7. ALWAYS respond 200 (Meta retried agressively op non-200; eigen retry via outbox)
```

**Belangrijk: snel responden < 20s.** Meta retried bij timeout. Daarom is alleen "store raw + enqueue async" hier — echte verwerking gebeurt in de processor job. In v2: Convex HTTP actions hebben default 2-min timeout, ook ruim.

## Processor flow (`/api/jobs/process-meta-leads`)

QStash callt deze endpoint met `{rawLeadIds: number[]}`. Per raw lead:

```
1. Lookup metaLeadRaw row (status="pending")
2. Find metaPages → get access_token (encrypted via decryptToken)
3. fetchLeadDetails(leadgenId, accessToken) → Meta Graph API call
4. parseLeadFields(fieldData) → normaliseert NL/EN aliases (zie DEFAULT_FIELD_MAPPINGS hieronder)
5. fetchFormDetails(formId, accessToken) → form-schema cachen in metaForms
6. Find lead_ingest_route voor deze formId → bepaalt org/workspace routing
7. UPSERT contacts (dedup op email+phone)
8. INSERT opportunity in default pipeline stage
9. INSERT lead_attribution {source: "meta", metaFormId, metaLeadgenId, ...}
10. INSERT note met de raw form-antwoorden voor traceability
11. UPSERT custom_field_values voor non-mapped form fields
12. Publish outbox events (contact.created + opportunity.created)
    → die triggeren workflows (auto-SMS bij nieuwe lead)
13. UPDATE metaLeadRaw status="completed" + contactId/opportunityId backref
```

Bij errors: UPDATE metaLeadRaw status="failed" + errorMessage + retryCount++. Tot MAX_RETRY_ATTEMPTS (5). Daarna dead-letter.

**Stale processing detection:** lead met `processingStartedAt > 5 min geleden EN status="processing"` wordt opnieuw opgepakt door scheduled fallback job (`processPendingLeads()`).

## Field mappings (DEFAULT_FIELD_MAPPINGS uit processor.ts)

8+ verschillende form-templates met variërende veldnamen — mapping naar canonieke contact-velden:

| Mia / form key (snake_case) | → Contact field |
|---|---|
| `email`, `e-mailadres`, `e-mail`, `emailadres` | `email` |
| `phone_number`, `telefoonnummer`, `telefoon`, `mobiel`, `mobiel_nummer` | `phone` |
| `full_name`, `volledige_naam`, `naam` | `fullName` (split heuristic) |
| `first_name`, `voornaam` | `firstName` |
| `last_name`, `achternaam` | `lastName` |
| `company_name`, `bedrijfsnaam`, `bedrijf`, `organisatie` | `company` |
| `job_title`, `functie`, `functietitel` | `position` |
| `city`, `stad`, `plaats`, `woonplaats` | `city` |
| `street_address`, `straat`, `adres`, `straatnaam` | `street` |
| `postal_code`, `zip_code`, `postcode` | `postalCode` |
| `state`, `province`, `provincie` | `province` |
| `country`, `land` | `country` |

**Niet-gemapte velden** (b.v. `voor_welk_type_ruimte_wilt_u_een_airco?`) gaan naar `custom_field_values` als generic key/value. In v2: zelfde patroon aanhouden — flexibel zonder schema-explosie.

**Per-org override**: `lead_field_mappings` table (0 rows in v1) was bedoeld voor klant-specifieke mappings. Skip in v2 tot een klant het echt vraagt.

## Required env vars

```bash
META_APP_SECRET=<from Meta App Dashboard>     # voor webhook signature verify
META_WEBHOOK_VERIFY_TOKEN=<eigen random hex>  # voor /api/webhooks/meta GET challenge
META_SYSTEM_USER_TOKEN=<system user token>    # voor Graph API calls (fallback per-page tokens preferred)
NEXT_PUBLIC_APP_URL=https://wetryleadflow.com # voor QStash callback URL
QSTASH_TOKEN=<Upstash QStash token>           # voor async processing (in v2: Convex scheduler)
```

Per-page access tokens worden encrypted opgeslagen in `metaPages.accessToken` (encryption via `src/lib/crypto.ts`, sleutel `META_TOKEN_ENCRYPTION_KEY` of equivalent). **Tokens roteren** bij verlies — Meta laat ze 60d valid.

## DB tabellen die v2 nodig heeft

```typescript
// Convex schema (sketch):
defineSchema({
  metaConnections: defineTable({
    orgId: v.id("orgs"),
    metaUserId: v.string(),
    accessToken: v.string(),  // encrypted
    isActive: v.boolean(),
    syncedAt: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  metaPages: defineTable({
    orgId: v.id("orgs"),
    pageId: v.string(),       // Meta page-id (string)
    pageName: v.string(),
    accessToken: v.string(),  // encrypted, per-page token
    isActive: v.boolean(),
    workspaceId: v.optional(v.id("workspaces")),  // routing target
  }).index("by_pageId_active", ["pageId", "isActive"])
    .index("by_org", ["orgId"]),

  metaForms: defineTable({
    orgId: v.id("orgs"),
    pageId: v.id("metaPages"),
    formId: v.string(),       // Meta form-id
    formName: v.string(),
    formFields: v.optional(v.any()),  // [{key, label, type}, ...]
    isActive: v.boolean(),
    lastSyncAt: v.optional(v.number()),
  }).index("by_page_form", ["pageId", "formId"]),

  metaLeadRaw: defineTable({
    orgId: v.id("orgs"),
    leadgenId: v.string(),    // dedup key
    pageId: v.string(),
    formId: v.optional(v.string()),
    adId: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    payload: v.any(),
    fieldData: v.optional(v.any()),  // parsed key/value from Graph API
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed"), v.literal("skipped")),
    contactId: v.optional(v.id("contacts")),
    opportunityId: v.optional(v.id("opportunities")),
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),
    fetchedAt: v.number(),
    processingStartedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
  }).index("by_leadgenId", ["leadgenId"])
    .index("by_status_org", ["status", "orgId"]),

  leadAttribution: defineTable({
    contactId: v.id("contacts"),
    source: v.union(v.literal("meta"), v.literal("api"), v.literal("manual")),
    metaPageId: v.optional(v.string()),
    metaFormId: v.optional(v.string()),
    metaLeadgenId: v.optional(v.string()),
    metaAdId: v.optional(v.string()),
    metaCampaignId: v.optional(v.string()),
    metaAdsetId: v.optional(v.string()),
    rawPayload: v.optional(v.any()),
    costPerLead: v.optional(v.number()),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
  }).index("by_contact_created", ["contactId"])
    .index("by_leadgenId", ["metaLeadgenId"]),

  webhookEvents: defineTable({
    provider: v.string(),
    externalEventId: v.string(),
    eventType: v.string(),
    payload: v.any(),
    status: v.union(v.literal("received"), v.literal("processed"), v.literal("failed")),
    retryCount: v.number(),
  }).index("by_provider_external", ["provider", "externalEventId"]),
});
```

## V2 — concrete simplifications

1. **QStash vervalt** — Convex scheduler doet async + retry native. `/api/jobs/process-meta-leads` wordt een Convex internal mutation triggered by scheduler.
2. **Outbox pattern** voor workflows blijft, maar Convex's real-time queries kunnen sommige use-cases zonder outbox (UI ziet meteen nieuwe contacts).
3. **Idempotency via Convex `.unique()` index** op `leadgenId` ipv lookup-before-insert. Schoner.
4. **Encrypted tokens** in Convex: gebruik `@convex-dev/auth` of bewaar encrypted in `v.string()` met externe KMS-style key in `process.env`. Niet plain-text!
5. **Stale-processing detection** in v2: Convex scheduler met built-in retry maakt dit overbodig — geen handmatige stale-check loop nodig.
6. **Lead-ingest routes** (per-form routing naar workspace): 1 row in v1, skip in v2 of port als simpele lookup.

## Gotchas (v1 lessons learned)

- **Meta retried agressief.** Endpoint MOET <20s responden anders krijg je duplicates. Async processing is verplicht, niet optioneel.
- **Signature verify met `timingSafeEqual`** — niet `===` om timing attacks te voorkomen.
- **Field-name diversity is reëel** — 8+ form-varianten geobserveerd. NL/EN aliases zijn must.
- **Token expiry** — per-page tokens 60d, system-user token longer. Bouw rotation in vanaf dag 1.
- **GDPR data-deletion callback** is verplicht door Meta (Apps krijgen anders sanctions). `/api/meta/data-deletion` route MOET in v2 ook bestaan, zelfde verify-token mechanisme. Verplicht implementeren contact-delete OP `external_id` van Meta user.
- **Webhook events table** is dedup-trail, niet de bron van waarheid. Echte status op `metaLeadRaw.status`. In v2: zelfde split aanhouden.
- **Vanwege Meta's encrypted access tokens** in metaPages: bij v2-migratie vergelijken of decrypt-key consistent blijft. Anders moet je opnieuw OAuth-flow doen per page → klant moet inloggen.

## Test-data voor v2-validatie

Marvin's huidige Meta-flow gebruikt deze form-IDs (uit audit):
- `1414562123459035` — 184 leads (woonplaats, ruimte, plaatsdatum, budget) — TOP volume
- `956868316261651` — 90 leads (ruimte, vermogen, bereikbaarheid)
- `1200797428374191` — 67 leads (zelfde shape als 956868316261651)
- `1979305763009930` — 5 leads (NL field-namen: e-mailadres ipv email)
- `1197443315672305` — 5 leads (ZONNEPANELEN-form, niet airco — edge case)

Per v2-validation: trigger Meta test-lead via Lead Ads Testing Tool, verify met deze 5 form-id's dat de processor correct field-mapt + custom-fields populeert.

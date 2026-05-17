# Outbound channels — V1 extract voor V2 rebuild

Drie outbound message-gateways in v1: **Resend (email)**, **Voidfix SMS** (Android-based), **Voidfix WhatsApp** (Web-based + optioneel Meta Cloud API). Allemaal achter één unified router `sendMessage()` in `src/lib/messaging/index.ts`.

## Unified router pattern

```typescript
// src/lib/messaging/index.ts
sendMessage({
  to: "+31612345678",
  channel: "sms" | "whatsapp" | "messenger",
  body: "Hoi {{contact.firstName}}, ...",
  orgId, workspaceId, contactId,
  relatedEntity?: { type, id },
  // Channel-specific opties (templateName voor WA, mediaUrl voor MMS, etc.)
})
// → routes naar juiste gateway (Voidfix SMS / Voidfix WA / Meta WA / Messenger)
// → logged in message_log met status (pending/sent/delivered/failed)
// → returns { success, messageLogId, externalMessageId, error? }
```

Voor email apart: `sendEmail()` in `src/lib/email/index.ts` — niet onder dezelfde unified router omdat Resend's API stuk anders is (subject/template/HTML vs simple text-body).

V2 aanbeveling: **wel** alles onder één `sendMessage({channel: "email" | "sms" | "whatsapp" | "messenger"})` brengen — schoner voor frontend, simpeler routing in workflow-engine. Resend's HTML/subject pas je dan in channel-specific config-blok in.

---

## 1. Voidfix SMS Gateway

**Wat het is:** Android-app op een fysieke telefoon (één per klant of platform-default) die via een eigen kleine HTTP-API SMS verstuurt via de SIM-kaart van die telefoon. Goedkoop: €39/maand unlimited vs Twilio's per-SMS pricing. Setup vereist: physieke Android-telefoon + Voidfix Android-app + SIM met SMS-abonnement.

**Files in v1:**
- `src/lib/messaging/voidfix-sms-client.ts` — low-level API client
- `src/lib/messaging/voidfix-sms-gateway.ts` — workspace-aware wrapper
- `src/lib/messaging/sms-rate-limiter.ts` — per-org rate limiting
- `src/app/api/webhooks/voidfix-sms/route.ts` — inbound (delivery receipts + replies)

**API surface:**
- `POST https://sms.voidfix.com/api/external/send-message` met `{deviceId, to, message, sim}` + header `X-API-Key`
- `GET /api/external/message-status/{messageId}` voor delivery status
- `GET /api/external/devices` voor device list

**Per-org config (`voidfix_sms_config` table):**
```typescript
{
  orgId, deviceUnique: string, simSlot: number (1 or 2), isActive: bool
}
```
Routing: lookup org's `voidfix_sms_config` → als gevonden, gebruik dat device + simSlot. Anders fallback naar `VOIDFIX_SMS_DEVICE_ID` env-var (platform default).

**Env vars:**
```bash
VOIDFIX_SMS_API_SECRET=...    # auth
VOIDFIX_SMS_DEVICE_ID=...     # platform default device
```

**Webhook inbound** (`/api/webhooks/voidfix-sms`): receives delivery receipts + inbound SMS replies. Body shape:
```json
{
  "event": "sent" | "delivered" | "failed" | "received",
  "messageId": "string",
  "from": "+31...",  // for received
  "body": "..."
}
```
→ Update `message_log.status` of voor inbound: create message in chat_conversations.

---

## 2. Voidfix WhatsApp Web

**Wat het is:** Android-app (vaak dezelfde fysieke telefoon als SMS) verbonden via WhatsApp Web → bestuurd via Voidfix API. Geen Meta-approval nodig, geen template-restricties. Wel: vereist QR-code scan om initieel te koppelen.

**Alternatief**: Meta WhatsApp Business Cloud API via `src/lib/messaging/meta-whatsapp.ts` (vereist Meta-approval + business verification + template approval) — voor formele businesses die Meta-branded badge willen. Staycool gebruikt **Voidfix Web**, niet Meta Cloud.

**Files in v1:**
- `src/lib/messaging/voidfix-whatsapp-client.ts` — low-level Voidfix WA client
- `src/lib/messaging/meta-whatsapp.ts` — Meta Cloud API (alternatief, weinig gebruikt)
- `src/app/api/webhooks/whatsapp-web/route.ts` — inbound webhook (Voidfix)
- `src/app/api/webhooks/whatsapp-web/poll/route.ts` — fallback polling
- `src/app/api/webhooks/whatsapp-web/register/route.ts` — QR-code registration flow

**Voidfix WA API:**
- `POST https://wa.voidfix.com/api/external/send-message` met `{sessionId, to, message, mediaUrl?, mediaType?}` + header `X-API-Key`
- `GET /api/external/session-status/{sessionId}` voor connection status
- `POST /api/external/qr-code` voor nieuwe session-setup
- `GET /api/external/sessions` voor session list

**Per-workspace config (`whatsapp_web_config` table):**
```typescript
{
  workspaceId, sessionId: string, phoneNumber: string, isActive: bool, lastSeenAt: timestamp
}
```

**Env vars:**
```bash
VOIDFIX_API_KEY=...           # auth voor Voidfix WA (shared met SMS in v1; verschillende vars in code maar zelfde key)
```

**Inbound webhook + reconnect flow:**
- Webhook bij elke inkomende WA message → routes naar `chat_messages` table, koppelt aan `chat_conversation` via phone-number lookup.
- Bij disconnect (WA Web sessie expired): webhook met `event=disconnected` → frontend toont QR-code voor re-scan.

---

## 3. Resend Email

**Wat het is:** Resend.com voor transactional email. Veel betere DX dan SendGrid/Mailgun, eerste 100/dag gratis, daarna pay-per-use.

**Files in v1:**
- `src/lib/email/index.ts` — core `sendEmail()` wrapper + retry + email_log
- `src/lib/email/send.ts` — convenience helpers per email-type (invite, opportunity-assigned, etc.)
- `src/lib/email/templates/*.tsx` — React Email components
- `src/lib/email/rate-limiter.ts` — recipient + org + global limits
- `src/app/api/webhooks/resend/route.ts` — inbound webhook (delivery, bounce, complaint)
- `src/lib/email-inbox/gmail-sync.ts` + `outlook-sync.ts` — for INBOUND email reading (separate concern, not Resend)

**API surface (wrapper):**
```typescript
sendEmail({
  to: string | string[],
  subject: string,
  template?: React.ReactElement,  // React Email component
  html?: string,                  // OR raw HTML
  templateName: string,           // for email_log audit
  from?: string,                  // override EMAIL_FROM
  replyTo?: string,
  context?: { orgId, workspaceId },
  relatedEntity?: { type, id },
  metadata?: Record<string, unknown>,
})
// → checks rate limits, inserts email_log (status=pending),
//   sends via Resend SDK (with 3-retry on rate_limit/5xx),
//   updates email_log (status=sent/failed + resendId)
```

**Env vars:**
```bash
RESEND_API_KEY=...                # Resend account key
EMAIL_FROM="LeadFlow <noreply@wetryleadflow.com>"  # default sender
# Voor klant-branded mail: override via from-param OR per-workspace config (toekomst)
RESEND_WEBHOOK_SECRET=...         # verify inbound webhook signature
```

**Rate limits (default in code):**
- Per recipient: 5/uur per template
- Per org: 100/uur total
- Global: 500/uur total
Overrideable via env-vars; conservative defaults om accidentele spam te voorkomen.

**React Email templates:** alle templates in `src/lib/email/templates/*.tsx` als React Components (gebruiken `@react-email/components`). Voordeel: type-safe interpolation, preview via `react-email dev`. V2 behouden — werkt prima.

**Inbound webhook** (`/api/webhooks/resend`): delivery/bounce/complaint events. Update email_log + on bounce: mark contact as `bounced` (don't keep sending).

---

## Unified `message_log` table

Outbound trail voor ALLE channels (SMS, WhatsApp, Messenger — niet email, die heeft eigen email_log). Voor v2 aanbeveling: **één gecombineerde `messages` table** voor ALLE 4 channels (sms/wa/email/messenger) met:

```typescript
messages: defineTable({
  workspaceId: v.id("workspaces"),
  contactId: v.optional(v.id("contacts")),
  channel: v.union(v.literal("sms"), v.literal("whatsapp"), v.literal("email"), v.literal("messenger")),
  direction: v.union(v.literal("outbound"), v.literal("inbound")),
  status: v.union(v.literal("pending"), v.literal("sent"), v.literal("delivered"), v.literal("failed"), v.literal("bounced")),
  externalMessageId: v.optional(v.string()),   // Resend ID, Voidfix ID, Meta ID
  to: v.string(),                              // recipient address/phone
  from: v.optional(v.string()),
  subject: v.optional(v.string()),             // email only
  body: v.string(),
  htmlBody: v.optional(v.string()),            // email only
  mediaUrl: v.optional(v.string()),
  mediaType: v.optional(v.string()),
  templateName: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  sentById: v.optional(v.id("users")),
  relatedEntityType: v.optional(v.string()),
  relatedEntityId: v.optional(v.string()),
  metadata: v.optional(v.any()),
  sentAt: v.optional(v.number()),
  deliveredAt: v.optional(v.number()),
}).index("by_contact_sent", ["contactId", "sentAt"])
  .index("by_workspace_channel", ["workspaceId", "channel"])
  .index("by_external_id", ["externalMessageId"]),
```

Voordeel: één UI-component voor "berichten pagina" toont alle 4 channels uniform. v1 heeft 4 aparte tabellen (email_log + email_messages + email_threads + message_log) met overlap — versimpelen in v2 = grote UX-winst.

**Threading**: email vereist `inReplyTo` + `references` headers voor mailbox threading. In v2: optionele `threadId: v.optional(v.id("threads"))` veld als je email-threads als losse entity wil houden voor inbox-UI. Voor SMS/WA/Messenger gewoon contactId-grouping.

---

## V2 implementatie — concrete simplifications

| Aspect | V1 | V2 (Convex) |
|---|---|---|
| Channel routing | `messaging/index.ts` switch | Convex action `sendMessage` met channel discriminator |
| Per-org device/session lookup | DB query in wrapper | Convex query inline in action handler |
| Rate limiting | Custom in code | `@convex-dev/rate-limiter` component |
| Email retry | Custom 3-try backoff | Convex scheduler met built-in retry config |
| Inbound webhook auth | HMAC verify per-provider | Same per-provider, gewoon Convex HTTP actions |
| Audit log | 4 aparte tables | 1 `messages` table met channel enum |
| Templates | React Email components | Houden — werkt + ze worden gewoon HTML strings |

## Gotchas (v1 lessons)

- **Voidfix Android-disconnect risico**: wanneer de telefoon offline gaat (no internet, batterij leeg, app gekild door OS) zien klanten gefaalde sends pas bij delivery-receipt-timeout. Bouw alerting: `voidfix_sms_config.lastSeenAt > 1h geleden` → notification naar Marvin.
- **WhatsApp Web session expiry**: WA Web logt periodiek uit (na 14d inactivity). UI moet QR-code-reconnect flow tonen wanneer session expired is. v1 heeft dit; v2 moet behouden.
- **Phone formatting**: alle outbound nummers via `formatToE164()` in `src/lib/messaging/phone-validation.ts` — voorkomt fouten bij internationale klanten. Voidfix accepteert E164 zonder `+` prefix; conversie in client.
- **Resend domain verification per sender**: voor klant-branded mail (Staycool: `info@staycoolairco.nl`) moet domein verified zijn in Resend account. Niet alle senders werken automatisch.
- **Rate limit hits worden niet doorgegeven**: v1 retourneert `rateLimited: true` maar workflow-engine behandelt dat als success. V2 fix: explicit `rateLimited` status in messages table + retry-na-window.
- **email_log + email_messages overlap**: in v1 schrijft sendEmail naar email_log, terwijl IMAP-sync (Gmail/Outlook) schrijft naar email_messages. Twee bronnen, geen unified view. **V2: één `messages` table for ALL email regardless of direction or source.**

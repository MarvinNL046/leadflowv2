# WhatsApp outbound-capture (bug 3) — Design

**Status:** goedgekeurd (Marvin, 2026-06-08).

## Probleem

Berichten die de gebruiker vanaf de **gekoppelde bedrijfstelefoon** (WhatsApp) naar een lead
stuurt, verschijnen NIET in Leadflow — alleen de inkomende reacties wel. De gespreks-
geschiedenis is dus incompleet.

## Root-cause (live geverifieerd op prod via tijdelijke webhook-logging)

Voidfix stúúrt wél een webhook voor telefoon-verstuurde berichten:
```json
{"event":"message.outbound","from":"<bedrijf>","to":"<lead>","message":"...",
 "messageType":"text","messageId":"true_…@lid_…","mediaUrl":null}
```
Maar de handler (`convex/http.ts` `/webhooks/voidfix-wa`) verwerkt alleen
`event === "message.incoming"`; `message.outbound` valt door alle takken en wordt gedropt
(comment: "outbound-echo + status-receipts later"). Ook `message.ack` (numerieke `status`
2/3) wordt genegeerd want de statusMap verwacht strings.

De inbox-weergave (`listByContact`/`listConversations`) filtert NIET op richting → toont
outbound al correct zodra die is opgeslagen. Dus de enige gap = het OPSLAAN.

## Doel

Sla `message.outbound`-webhooks op als outbound-bericht (richting "outbound") gekoppeld aan
het contact van het `to`-nummer, zodat de volledige WhatsApp-conversatie (in- én uitgaand,
ook telefoon-verstuurd) in Leadflow staat.

## Architectuur

### 1. `recordOutbound` internalMutation (`convex/messaging.ts`)
Spiegel van `recordInbound`, met:
- **args:** `{ workspaceId, channel, to, body, externalMessageId?, from?, mediaUrl?,
  mediaType?, sentAt? }`.
- **Dedup:** als `externalMessageId` al bestaat (`by_external_id`) → skip (`{duplicate:true}`).
  Dit voorkomt dubbel opslaan van berichten die Leadflow zélf via de Voidfix-API stuurde
  (`sendViaVoidfixWa` retourneert dezelfde `messageId` die de echo-webhook bevat).
- **Contact-lookup:** op het **`to`-nummer** (recipient = de lead), via `normalizePhone` +
  `by_workspace_phone`. Geen match → kaal contact aanmaken (zoals `recordInbound`), zodat
  het gesprek zichtbaar wordt.
- **Insert:** `messages` met `direction:"outbound"`, `status:"sent"`, `to`, `from`, `body`,
  `externalMessageId`, `mediaUrl/mediaType`, `sentAt: sentAt ?? Date.now()`.

### 2. Handler (`convex/http.ts` `/webhooks/voidfix-wa`)
- Vóór de inbound-tak: `if (payload.event === "message.outbound")` → resolve workspace
  (`getStaycoolWorkspaceIdInternal`) → `recordOutbound({ workspaceId, channel:"whatsapp",
  to: payload.to, body: payload.message ?? payload.body ?? "", from: payload.from,
  externalMessageId: payload.messageId ?? payload.id, mediaUrl: payload.mediaUrl ??
  undefined })`. Geen `to` → skip. Return `{received:true, type:"outbound"}`.
- `VoidfixWaEvent`-type uitbreiden: `to?: string`; `status?: string | number`.

### 3. Bonus — ack-status (numeriek)
In de bestaande status-receipt-tak: behandel numerieke `status` (WhatsApp-ack-levels):
`2 → "delivered"`, `3 → "read"` (1/sent → geen wijziging). Mappt via
`updateStatusByExternalId`. Klein; laat de vinkjes kloppen.

## Niet-doelen
- Geen wijziging aan de inbox-UI (toont al beide richtingen).
- Geen opp/lead-trigger op outbound (het is óns bericht, geen nieuwe lead).
- Geen race-hardening voorbij `externalMessageId`-dedup (zie risico).

## Testing
- **Unit:** geen nieuwe pure helper (recordOutbound is db-gekoppeld; spiegelt de geteste
  recordInbound-patronen). Wel: build-gates + smokes.
- **Build-gates:** `convex dev --once` schoon · `npm run build` ✓ · tsc geen nieuwe fouten.
- **Reversibele CLI-smoke** (`convex/__debug.ts`, daarna weg): throwaway workspace + contact
  met phone X; roep `recordOutbound({to:X, externalMessageId:"e1", body:"hoi"})` →
  assert: 1 message, direction outbound, gekoppeld aan het contact; roep nogmaals met
  `externalMessageId:"e1"` → assert duplicate (geen 2e rij); `to` = onbekend nummer →
  assert kaal contact + message. Teardown.
- **Prod-smoke (Marvin + telefoon):** deploy → Marvin stuurt 1 bericht vanaf de
  bedrijfstelefoon → het verschijnt in het Leadflow-gesprek van dat contact (outbound-bubble).

## Risico's
- Laag/additief; raakt alleen de tot nu toe genegeerde `message.outbound`-webhook.
- **Bekende, smalle race:** als Leadflow zélf een WhatsApp stuurt en de echo-webhook arriveert
  vóór `markSent` de `externalMessageId` heeft gepatcht, kan de dedup missen → zeldzaam
  dubbel bericht voor ín-Leadflow-verstuurde berichten. Telefoon-verstuurde berichten (de
  bug) zijn altijd correct (geen bestaande rij). Geaccepteerd; eventueel later harden.

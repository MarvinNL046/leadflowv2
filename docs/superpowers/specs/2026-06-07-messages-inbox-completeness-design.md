# Messages — Inbox-completeness — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** de bestaande v2-inbox (`crm.messages.tsx` + `convex/messaging.ts`) production-proof maken voor dagelijks gebruik. Eerste slice van de Messages-parity (volgende slices — reply-templates, AI-conversatie, channel-settings — apart). GEEN merge/prod zonder Marvins go.

## Doel
Vier gaten dichten zodat de inbox compleet aanvoelt: (1) e-mail terug in het kanaalfilter, (2) ongelezen-per-kanaal-badges, (3) gesprekken archiveren (reversibel), (4) ongekoppelde inbound (onbekend nummer) niet meer verliezen.

## Huidige situatie (geverifieerd)
- `convex/messaging.ts` `listConversations` groepeert per `contactId`, **skipt `!m.contactId`** (regel: `if (!m.contactId) continue`) → unassigned inbound verdwijnt. Kanaalfilter werkt al via index `by_workspace_channel_sent` voor élk kanaal. `unread` = per-gesprek boolean (laatste bericht inbound + `readAt === undefined`).
- `recordInbound`: zoekt contact op phone→email; bij geen match blijft `contactId` undefined (bericht opgeslagen zonder contact) → onzichtbaar.
- `crm.messages.tsx` kanaalfilter-tabs: Alle / SMS / WhatsApp (geen E-mail). Per-gesprek unread-dot + totaal-unread in header.
- Schema: alleen `messageThreads.isArchived` (ongebruikt); géén contact/gesprek-niveau archief.

## Gewenste situatie

### 1. E-mail in het kanaalfilter (UI)
Voeg een **"E-mail"**-tab toe aan de kanaalfilter in `crm.messages.tsx` (Alle / SMS / WhatsApp / E-mail). Backend ondersteunt `channel: "email"` al — puur UI.

### 2. Ongelezen-per-kanaal (backend-query + UI-badges)
Nieuwe lichte query **`inboxUnreadCounts({ workspaceId })`** → `{ sms, whatsapp, email, total }` = aantal **gesprekken met een ongelezen inkomend laatste bericht** per kanaal. Berekend door dezelfde groepeer-logica als `listConversations` (recent venster, per contact het laatste bericht; tel als `direction === "inbound" && readAt === undefined`), zonder kanaalfilter. Membership-checked. UI: teller-badge per filter-tab (alleen tonen als > 0).

### 3. Gesprekken archiveren (reversibel)
- **Schema:** voeg `messagesArchivedAt: v.optional(v.number())` toe aan de `contacts`-tabel (gesprek = per contact, dus archief op contact-niveau, net als v1).
- **Backend:** `archiveConversation({ contactId })` (set `messagesArchivedAt = Date.now()`) + `unarchiveConversation({ contactId })` (clear). Beide membership-checked.
- **listConversations:** nieuwe arg `includeArchived: v.optional(v.boolean())` (default false). Per gesprek wordt de contact al geladen (`ctx.db.get(contactId)`) → filter eruit als `messagesArchivedAt != null` tenzij `includeArchived`.
- **UI:** archiveer-knop per gesprek (in de rij-hover én in de thread-header) + "Toon gearchiveerd"-toggle die `includeArchived: true` meegeeft; gearchiveerde gesprekken krijgen een subtiel label + un-archiveer-knop.

### 4. Ongekoppelde inbound → automatisch kaal contact (backend)
In `recordInbound`: als er **geen** contact-match is, **maak een kaal contact aan** met het juiste veld uit `from` (genormaliseerd phone voor sms/whatsapp; email voor email), `callCount: 0`, en zet `contactId`. Daardoor verschijnt élke binnenkomer als gesprek in de inbox.
- **GEEN** opportunity + **GEEN** `leadAttribution` + **GEEN** `triggerContactCreated`: een inkomend bericht van een onbekende is nog geen gekwalificeerde lead → het hoort in de inbox, niet automatisch op het leads-dashboard of in de speed-to-lead-workflow. De gebruiker kan het contact aanvullen / tot lead promoten via de bestaande contact-UI.
- Phone-normalisatie: hergebruik `lib/phone` (`normalizePhone`) zoals elders; email lowercased/trim.

## Data-flow (na de wijziging)
```
inbound (SMS/WA-webhook) → recordInbound
   • contact-match (phone→email)?  ja → koppel   |   nee → maak kaal contact (phone/email)
   • insert message (contactId nu altijd gezet)
        ↓ Convex reactief
   listConversations (filter: niet-gearchiveerd, evt. per kanaal)  → inbox toont gesprek live
   inboxUnreadCounts → per-kanaal badges updaten
```

## Schema-wijziging
- `contacts`: + `messagesArchivedAt: v.optional(v.number())`. Additief, geen migratie nodig (bestaande contacten = undefined = niet gearchiveerd).

## Edge cases
- **Inbound zonder phone én email** (onwaarschijnlijk; `from` leeg): geen contact aanmaken, message met contactId undefined (huidige gedrag) — blijft een randgeval, niet zichtbaar. Loggen.
- **Auto-created contact dat later een echte lead wordt:** dedup via bestaande `by_workspace_phone`/`by_workspace_email` — een volgende Meta/website-lead met hetzelfde nummer mergt erin (bestaande dedup-logica). Geen duplicaten.
- **Archiveren raakt opps/dashboard niet:** `messagesArchivedAt` filtert alleen de INBOX; de lead/opp blijft normaal op het dashboard/kanban. Puur een inbox-view-vlag.
- **Per-channel unread window:** zelfde recent-venster als `listConversations` (consistent; geen volledige tabel-scan).

## Out of scope (latere Messages-slices)
- Reply-templates / canned responses (aparte slice).
- AI-conversatie/takeover in de thread (aparte slice).
- Channel-settings per workspace (device-id/sessie/email-from).
- Media-upload (outbound), full-text search, rate-limiting, hard-delete van gesprekken, e-mail-threading (Gmail/Outlook sync blijft buiten v2).

## Verificatie
1. `npx convex dev --once` schoon + `npx vitest run` groen.
2. `npm run build` + geen nieuwe tsc-fouten.
3. Dev-smoke (browser, ingelogd): E-mail-tab zichtbaar + filtert; ongelezen-badges per kanaal kloppen; archiveer-knop → gesprek verdwijnt, "Toon gearchiveerd" → terug + un-archiveer; een test-inbound van een onbekend nummer (via de voidfix-tail/test) → verschijnt als nieuw gesprek met kaal contact.

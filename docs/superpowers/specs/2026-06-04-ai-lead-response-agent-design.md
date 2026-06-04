# AI Lead-Response Agent (v2) — Design

**Status:** approved 2026-06-04 · **Component:** Workflows + AI (subproject A) · **Stack:** Convex + TanStack Start

## Goal
Een nieuwe binnenkomende lead (Meta lead-ads / website-form) krijgt **binnen seconden**
een gepersonaliseerde eerste reactie die 'm naar een **afspraak** drijft
(boekingslink). Dit is de speed-to-lead-kernwaarde (+391% conversie bij <1 min reactie).

## Scope
**In scope (dit subproject):** de éénmalige, automatische **eerste touch** op een nieuwe
lead — genereren + (auto) versturen of (suggest) als concept klaarzetten, met per-workspace
configuratie + guardrails.

**Out of scope (later):** het afhandelen van het *antwoord* van de lead (conversatie /
AI-takeover) = Messages-subproject. De workflow-engine-uitbreiding (branching, 18 acties,
retry) = subproject B. De AI-agent als herbruikbare workflow-node = B (hergebruikt deze
kern-logica).

## Architectuur — standalone handler
Een eigen Convex-`internalAction` `aiLeadResponse.handleNewLead({contactId, workspaceId})`,
direct gescheduled vanuit de lead-intake-punten (metaProcessor + website-lead-API),
**onafhankelijk** van de workflow-engine. Reden: A-first moet op zichzelf werken + clean;
de kern-logica (`generateResponse`, `pickChannel`, guardrails) wordt later hergebruikt als
workflow-node in B.

Trigger **alléén vanuit echte lead-intake**, NIET vanuit `contacts.create` (handmatig
contact toevoegen mag geen AI-bericht triggeren).

## Data-model — nieuwe tabel `aiLeadResponseConfigs`
Per workspace (idempotent, één rij). Velden:
- `workspaceId: Id<"workspaces">` (index `by_workspace`)
- `enabled: boolean` (master-schakelaar, default false)
- `mode: "off" | "suggest" | "auto"` (default "suggest")
- `channelOrder: Array<"whatsapp" | "sms" | "email">` (default ["sms","email"])
- `bookingUrl: string` (default "https://afspraken.staycoolairco.nl/")
- `model: string` (default "claude-sonnet-4-6")
- `anthropicApiKeyEncrypted?: string` (via `lib/crypto.encryptSecret`; nooit plaintext)
- `businessContext?: string` (bedrijfsinfo voor de prompt, bv. "StayCool installeert airco's in Limburg")
- `tone?: string` (default "vriendelijk, professioneel, kort, NL")
- `whatsappTemplateName?: string` (goedgekeurde WA-template voor koude eerste WA)
- `quietHoursStart?: number` (uur 0-23, default 21) / `quietHoursEnd?: number` (default 8)
- `dailyCap?: number` (max auto-berichten/dag, default 200)
- `signature?: string` (afsluiting, bv. "Groet, StayCool")

Plus een tabel `aiSuggestedResponses` voor de suggest-modus:
- `workspaceId`, `contactId` (index `by_contact`), `channel`, `body: string`,
  `model`, `status: "pending" | "sent" | "dismissed"`, `createdAt`.

## Flow (`handleNewLead`)
1. Laad config voor de workspace. Als `!enabled || mode==="off"` → return (no-op).
2. **Dedup (anti-spam):** als er al een AI-auto-reactie OF een pending `aiSuggestedResponses`
   voor deze contact is binnen de **laatste 24 uur** → return. Een echte her-aanvraag later
   (>24u) krijgt wél een verse touch (sluit aan op "wel triggeren" per submission).
3. **Quiet-hours:** bereken "nu" in `crmSettings.timezone` (Europe/Amsterdam). Valt binnen
   quiet-hours → bij `auto` de send uitstellen via `scheduler.runAt(volgende toegestane
   tijd)`, bij `suggest` gewoon concept klaarzetten (mens verstuurt zelf).
4. **Dagcap (alleen auto):** tel auto-sends vandaag; >= `dailyCap` → skip + log.
5. **Genereer bericht:** Anthropic Messages API via `fetch` (`api.anthropic.com/v1/messages`),
   `x-api-key` = gedecrypte per-workspace key, `model` uit config. Prompt:
   - system: `businessContext` + `tone` + doel ("verwelkom de lead, bevestig hun
     airco-aanvraag, nodig uit om zelf een afspraak te plannen via {bookingUrl}, kort,
     geen prijzen, eindig met {signature}").
   - user: lead-data (voornaam, plaats, en de form-antwoorden uit de leadAttribution/note).
   - Output: kort bericht-tekst (plain text). Max ~120 woorden.
6. **Kanaal-keuze (`pickChannel`):** loop `channelOrder`, kies eerste beschikbare:
   - `whatsapp`: alleen als `whatsappTemplateName` gezet (koude WA vereist template). Anders skip.
   - `sms`: als contact een telefoonnummer heeft.
   - `email`: als contact een e-mail heeft.
   - Geen kanaal beschikbaar → log + return.
7. **Verstuur/concept:**
   - `auto` → `messaging.sendInternal({workspaceId, contactId, channel, body})`. Markeer
     dedup (outbound AI-bericht bestaat nu).
   - `suggest` → insert `aiSuggestedResponses` (status pending). Surfaced in de lead-dialog
     (pre-fill compose) + een "AI-concept"-badge op de lead-card met **Verstuur** / **Negeer**.
8. Alle stappen in `try/catch`: een AI-fout logt via `console.error` + zet status
   `failed`/`dismissed` op de suggested-response, maar breekt **nooit** de lead-intake.
   Geen aparte log-tabel (YAGNI).

## Settings-pagina `/crm/settings/ai-agent`
Formulier (mirror van v1's `ai-lead-response-form`): master-toggle, mode-select,
channel-order (drag/sortable of select), bookingUrl, model-select (Sonnet/Haiku),
**Anthropic-key-veld** (write-only; toont "••• gezet" indien aanwezig; encrypted opgeslagen),
businessContext, tone, signature, whatsappTemplateName, quiet-hours start/eind, dailyCap.
Plus een **"Test"-knop** → genereert een voorbeeldbericht met dummy-lead-data (dry-run, geen
verzending) zodat Marvin de toon kan checken.

## Hergebruik (bestaande v2-bouwstenen)
- `lib/crypto.encryptSecret/decryptSecret` (I1) voor de Anthropic-key.
- `messaging.sendInternal` voor het auto-versturen (sms/whatsapp/email-routing bestaat al).
- `crmSettings`-patroon (getEffectiveSettings + route) als blauwdruk voor de config-CRUD + UI.
- Contact + `leadAttribution` + de "niet-gemapt"-note voor de lead-context in de prompt.

## Error handling
- Ontbrekende/ongeldige Anthropic-key → suggested-response met status `dismissed` + duidelijke
  fout in de settings ("AI-key ontbreekt/ongeldig"); lead-intake blijft intact.
- Anthropic API-fout (rate/timeout) → 1× retry, daarna skip + log (geen blokkade van intake).
- Geen kanaal beschikbaar → log, geen send.

## Testen
Unit-tests (vitest) voor de pure helpers:
- `pickChannel` (WA-zonder-template → SMS-fallback; geen phone → email; niets → null).
- guardrail-logica (quiet-hours-berekening met timezone; dagcap-grens; dedup-check).
- prompt-bouw (bevat naam, bookingUrl, geen prijzen).
- dry-run van `generateResponse` met een gemockte fetch.

## Beslissingen (vastgelegd)
- Mode: off/suggest/auto, default **suggest** (start veilig, schakel naar auto).
- Kanaal: instelbare volgorde + fallback, default **["sms","email"]** (WA pas met template).
- Doel: **boeken** (bookingUrl).
- Model: default **claude-sonnet-4-6**, instelbaar.
- Trigger: alleen echte lead-intake (Meta + website), niet handmatige contacten.

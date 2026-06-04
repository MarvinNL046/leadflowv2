# v1 → v2 Parity + Settings Roadmap

> **Doel:** v2 (leadflowv2, Convex + TanStack) naar v1-pariteit **én beter** brengen,
> component voor component. Alle nu-hardcoded/achtergrond-logica wordt **instelbaar
> onder Instellingen**. Principes: **prod-ready, clean code, AI-enhanced, geen
> over-engineering** dat de app traag maakt.
>
> Bron: multi-agent gap-analyse v1↔v2 (juni 2026). Status v2: live op prod sinds 2026-06-04.

## Werkwijze (goal-tactiek)
Per component een eigen, op zichzelf werkende build: **(1) pariteit-gaps dichten →
(2) hardcoded knoppen als settings → (3) AI/UX-verbetering**. Elk component apart
gereviewd + gedeployed. Settings landen in de bestaande hub `/crm/settings`.

---

## Prioriteit & volgorde (voorstel)

| # | Component | Waarom | Omvang |
|---|---|---|---|
| 1 | **Workflows + AI lead-response agent** | Kern-product (speed-to-lead + AI). Grootste gat: AI-agent ontbreekt volledig in v2. | Groot |
| 2 | **Messages** | Template-flow + AI-takeover-UI + rate-limiting nodig om de AI-agent te benutten; e-mail terug in inbox. | Groot |
| 3 | **Contacts** | Zonder zoeken/filteren onbruikbaar bij groei. Foundation. | Middel |
| 4 | **Pipelines** | Stats/win-rate + per-stage follow-up-config. | Middel |
| 5 | **Dashboard** | Architectonisch al schoner; alleen settings + dynamische form-labels. | Klein |

*Rationale:* Workflows+AI is je differentiator en blokkeert de rest (Messages-AI-takeover hangt eraan). Contacts/Pipelines/Dashboard zijn meer afgebakend.

---

## 1. Workflows + AI lead-response agent  ⭐ kern
**Must-have pariteit:**
- **AI lead-response agent ontbreekt volledig** (v1: Anthropic-agent met off/suggest/auto, quiet-hours, dagcap, kanaal-fallback, kwalificatievragen, dedup, team-notify). → porten naar v2/Convex.
- **Condition / if-else branching node** (engine kent alleen trigger/action/delay).
- **Slechts 3 van 18 action-types** — mist o.a. `change_stage`, `assign_user` (round-robin), `create_task`, `add_tag`, `add_note`, `update_contact`, `internal_notification`, `webhook`, `ai_first_response`.
- **Retry-logica** (v1: 3× exponential backoff) — v2 faalt permanent bij 1e transiente fout.
- **Safety-guards** (v1: MAX_STEPS 200 + step-timeout 60s) — v2 heeft niets.
- **Delay alleen seconden** — v1: min/uur/dagen + `until_time` (bv. "maandag 9:00").
- **Template-interpolatie** alleen `{{contact.*}}` — mist `{{opportunity.*}}`, workspace-naam.
- **Reply-tracking condities** (stop opvolging als klant al reageerde).

**Hardcode → Settings (Instellingen → AI-agent / Workflows):**
- AI-model, mode (off/suggest/auto), kanalen, kwalificatievragen, quiet-hours, dagcap, business-context, **eigen Anthropic-key (encrypted via lib/crypto)**.
- Kanaal-fallback-volgorde (whatsapp>sms>email) instelbaar.
- Default delay-node-wachttijd (nu 180s) + delay-input in min/uur/dagen.
- Max herkansingen per actie (default 3). Timeout/max-steps als veilige hardcoded guard.
- Quiet-hours + max automatische berichten/contact/dag (engine checkt vóór send).
- 3-strike 7-dagen-fallback → koppelen aan bestaande `defaultFollowUpDays`.

**AI/UX-beter-dan-v1:** state-of-the-art Claude-model, betere prompts, reply-aware nurture, per-workspace key.

## 2. Messages (unified inbox)
**Must-have pariteit:**
- **Template-flow in compose** (select + variabelen + preview) — verplicht voor WA buiten 24u-venster.
- **Archiveren/verwijderen** van gesprekken (`isArchived`-veld bestaat, ongebruikt).
- **AI conversation-takeover/resume-UI** ("neem over"/"hervat AI", suggestedDraft) — de UI-haak voor de AI-agent.
- **Rate-limiting** SMS/WhatsApp (v2 erkent zelf "geen rate-limiting") — anti-throttle/ban + kostencontrole.
- **E-mail terug in inbox-filter** (tabs tonen nu alleen all/sms/whatsapp; e-mail verdwijnt).
- **Ongekoppelde inbound** (onbekend nummer) krijgt "koppel aan contact"-scherm i.p.v. verloren gaan.

**Hardcode → Settings (Instellingen → Kanalen/Voidfix):**
- SMS sim-slot, device-ID, WA session-ID per workspace (nu env/literal).
- `EMAIL_FROM` afzendernaam+adres per workspace.
- Standaard verstuurkanaal (sms/whatsapp/email).
- ⚠️ **Prod-note multi-tenant:** inbound-routing is hardgekoppeld aan org-slug `staycool` (single-tenant aanname). Voor jou nu OK; blokkeert wel meerdere tenants later → per device/session → workspace mappen.

## 3. Contacts
**Must-have pariteit:**
- **Zoekbalk** (naam/email/telefoon/bedrijf/plaats/externalId).
- **Filters** (city/company/source/datum/hasEmail/hasPhone).
- **Sorteer-opties** (naam/bedrijf/plaats/datum, asc+desc).
- **CSV bulk-import** (kolom-mapping, dedup op email, toewijzen aan pipeline/stage).
- **Custom-fields beheer** (nu read-only → CRUD-UI zoals v1's CustomFieldsManager).

**Hardcode → Settings (Instellingen → CRM-gedrag):**
- Paginatie-grootte (nu 25 vast → 10/25/50/100).
- Dedup-sleutel (email/phone/beide).
- Standaard pipeline + start-stage voor nieuwe leads (expliciet i.p.v. impliciet eerste-stage).
- Werkgebied (provincies/postcodes → auto `outsideArea`).
- Callback-follow-up-dagen (nu 7 hardcoded → setting).

## 4. Pipelines
**Must-have pariteit:**
- **Statistieken-balk** op kanban (totale/won-waarde, won/lost-count, **win-rate%**).
- **Per-stage follow-up-config** (followUpEnabled / targetStageId / autoMoveToLost per stage) i.p.v. alleen globale flat-cron-naar-eerste-stage.
- **"Pipeline aanmaken"-UI** + bewerkbare default-stage-template (nu DEFAULT_STAGES hardcoded in seed, geen UI).

**Hardcode → Settings (Instellingen → Pipeline):**
- Default-stage-template + branche-presets.
- Per-stage `followUpEnabled` + `targetStageId` (schema-uitbreiding pipelineStages).
- Expliciete `isFirstStage`/`isEntryStage`-flag i.p.v. fuzzy naam-substring `nieuw/new/lead`.
- Kanban take-limit (200) + follow-up batch (300) → gedeelde config-consts + "meer laden"-indicatie.
- DEFAULT_SETTINGS één keer definiëren (nu gedupliceerd UI+backend → drift-risico).

## 5. Dashboard
**Must-have pariteit:**
- **Dynamische Meta-form-labels** (nu 5 form-IDs hardcoded met TODO → lookup naar `metaForms`-tabel; hardcoded map als fallback).

**Hardcode → Settings (Instellingen → Lead-flow):**
- Instelbare callback-periodes (`{days,label,enabled}[]`) i.p.v. 2 gehardcodeerde sets.
- `customer_will_callback` safety-net (nu 7d) → setting.
- `sendEmailOnUnreachable` toggle (auto-afscheidsmail bij 3-strike).
- Lead-dashboard-window (90d recency) zodat stale oude leads buiten het speed-to-lead-bord blijven.
- Follow-up due-cutoff serverside met `crmSettings.timezone` (bestaat al, wordt niet gebruikt).

**Nice-to-have:** stats-grid + recent-activity + test-lead-knop (v1 had die; v2 bewust afgeslankt).

---

## Cross-cutting
- **Settings-hub uitbreiden:** nieuwe pagina's AI-agent + uitgebreide Lead-flow/Pipeline/Kanalen/CRM-gedrag. Bestaande hub `/crm/settings` + `crmSettings`-tabel als basis.
- **DEFAULTS centraliseren** (één bron in convex, importeren in UI).
- **Waar v2 al beter is (behouden):** role-based stage-flags (isWon/isLost) i.p.v. ilike-match, multi-tenant membership-guards, preview-vóór-versturen, reactive UI zonder cache-invalidatie.

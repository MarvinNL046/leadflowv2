# Follow-up-lifecycle fix (bug 1 + 2) — Design

**Status:** goedgekeurd-in-gedrag (Marvin, 2026-06-08); spec ter review.

## Probleem (door collega gemeld op live prod)

Gedeelde root-cause: `contacts.nextFollowUpAt` is tegelijk de **"toon-op-/crm"-klok** én de
**"zet-terug-naar-Nieuw"-klok** (cron), maar de status-acties beheren 'm niet consistent.

**Bug 2 — "1x gebeld" verdwijnt niet uit /crm.**
`recordCallNoAnswer` (poging 1-2) zet `nextFollowUpAt = +N dagen` (toekomst) en laat de opp
in "Nieuw". `listIncomingLeads` keep-logica heeft alleen: *(a) due follow-up → toon* en
*(b) opp in eerste stage → toon*. Er is **geen tak die een lead met een TOEKOMSTIGE
follow-up verbergt** — terwijl de code-comment (regel 329) dat wél beschrijft. Dus de lead
blijft staan via (b).

**Bug 1 — afgehandelde lead (afspraak/airco gehad) komt terug in Nieuw.**
`recordCallAnswered("appointment")` zet de opp naar "Afspraak Ingepland" maar zet
`nextFollowUpAt = afspraakdatum` en **wist 'm nooit**. Zodra die datum verstrijkt, ziet de
uur-cron een verlopen follow-up en sleept de opp terug naar Nieuw ("Afspraak Ingepland"
heeft `noResurface` niet aan op prod). `moveToStage` (handmatige kanban-sleep) wist
`nextFollowUpAt` evenmin.

## Gekozen gedrag (Marvin, 2026-06-08)

- **Bug 2:** lead verdwijnt direct uit /crm na "1x gebeld" en komt automatisch terug zodra
  de follow-up due is (na `defaultFollowUpDays` / de per-stage-interval).
- **Bug 1:** `nextFollowUpAt` wordt in **code** gewist zodra een lead wordt afgehandeld
  (afspraak / gewonnen / verloren / Vasthouden-stage) → de cron zet 'm nooit meer terug.

## Architectuur

### Fix A — Dashboard verbergt geplande (toekomstige) follow-ups  → bug 2
Pure helper `convex/dashboardLeadVisibility.ts`:
```ts
export function leadDashboardDecision(args: {
  nextFollowUpAt: number | null | undefined;
  dueBefore: number | null | undefined;
  hasFirstStageOpp: boolean;
}): { keep: boolean; dueFollowup: boolean }
```
Regels (in volgorde):
1. due follow-up (`dueBefore != null && nextFollowUpAt != null && nextFollowUpAt <= dueBefore`)
   → `{ keep: true, dueFollowup: true }`.
2. **toekomstige follow-up** (`dueBefore != null && nextFollowUpAt != null &&
   nextFollowUpAt > dueBefore`) → `{ keep: false, dueFollowup: false }` (verbergen tot due —
   de "1x gebeld → verdwijnt → komt terug"-flow).
3. anders → `{ keep: hasFirstStageOpp, dueFollowup: false }`.

`listIncomingLeads` keep-logica (`contacts.ts`) gebruikt deze helper i.p.v. de inline
if/return-ladder. (`opps.length === 0` blijft een aparte vroege `keep:false` daarvoor.)

### Fix B — Wis `nextFollowUpAt` bij afhandelen → bug 1
- `convex/contacts.ts recordCallAnswered`:
  - `appointment`: `patch.nextFollowUpAt = undefined` (afspraakdatum is GEEN resurface-
    trigger; de deal leeft in de kanban/"Afspraak Ingepland"). De afspraakdatum gaat al de
    note in.
  - `not_interested`: `patch.nextFollowUpAt = undefined` (lost → niet tonen/resurfacen).
  - `callback` / `customer_will_callback`: ONGEWIJZIGD (zetten bewust een toekomstige
    follow-up; Fix A verbergt ze tot due — correct).
- `convex/opportunities.ts moveToStage`: bij target-stage `isWonStage || isLostStage ||
  noResurface === true` → `updates.nextFollowUpAt = undefined` (clear de klok). Manuele
  sleep naar Gewonnen/Verloren/Vasthouden-stage stopt auto-resurface.

### Fix C — V1-kanban-call-progressie (gekozen door Marvin)
`recordCallNoAnswer` verplaatst bij een niet-final-strike de opp naar de "Nx Gebeld"-stage
(N = nieuwe callCount), zodat de kanban-kolommen "1x Gebeld"/"2x Gebeld"/"3x Gebeld" vullen
(zoals V1). Implementatie:
- Pure helper `convex/callAttemptStage.ts`:
  ```ts
  export function pickCallAttemptStage<T extends { name: string }>(
    stages: T[], attempt: number,
  ): T | undefined
  ```
  Genormaliseerde exact-match op `"{attempt}x gebeld"` (lowercase, whitespace-genormaliseerd).
  Geen match → `undefined` → opp blijft staan (Fix A verbergt 'm alsnog → graceful, werkt
  ook voor pipelines zonder "Nx Gebeld"-stages).
- In `recordCallNoAnswer` (niet-final-strike-tak): `findOrCreateOpportunity` → `pickCallAttemptStage(stages, newCount)` → `moveOppToStage` (indien gevonden).
- **Loop sluit met de bestaande cron:** de uur-cron (`followups.ts`) zet "Nx Gebeld"-opps
  bij een due follow-up terug naar Nieuw + cleart `nextFollowUpAt` (shouldResurfaceOpp:
  "Nx Gebeld" is niet-first/niet-closed/niet-noResurface → resurface). Dus de lead komt na
  N dagen terug in Nieuw — exact de V1-loop.
- `moveOppToStage`-reden: `"called_{N}x"`.

### Aanbevolen prod-config (Marvins actie, GEEN code)
Alleen **"Afspraak Ingepland"** op "Vasthouden" zetten via Instellingen → Pipeline als
extra vangnet. Met Fix B is dit niet strikt nodig voor de afspraak-via-dialog-flow, maar
dekt handmatige kanban-sleep naar Afspraak Ingepland.

⚠️ **NIET** "1x/2x/3x Gebeld" op Vasthouden zetten! `noResurface` sluit een stage uit van de
cron-resurface — die "Nx Gebeld"-stages MOETEN juist resurfacen (de V1-loop: na N dagen
terug naar Nieuw). Vasthouden op een "Nx Gebeld"-stage zou leads daar permanent vastzetten.

## V1-validatie (de bewezen referentie — `/home/marvin/Projecten/wetryleadflow`)

V1 (`src/lib/actions/crm.ts`) deed dit jaren correct. Vergelijking bevestigt deze fix:
- **Bug 1:** V1's `processLead` zet bij `schedule_now` (afspraak) en `not_interested`
  expliciet `nextFollowUpAt = NULL` → lead permanent uit de nieuwe-leads-lijst. = exact
  Fix B.
- **Bug 2:** V1's `getNewLeads` toont een lead alleen bij (geen opps) OF (verlopen
  follow-up) OF (opp in eerste stage). Een "1x gebeld"-lead is bij V1 verborgen omdat V1 de
  opp naar stage **"1x Gebeld"** verplaatst (dus niet in eerste stage) én een toekomstige
  `nextFollowUpAt` heeft. V1's cron (`processFollowUps`) zet de opp terug naar Nieuw én
  `nextFollowUpAt = NULL` zodra due.
- **v2-cron komt al overeen:** `convex/followups.ts:99` cleart `nextFollowUpAt` voor elke
  due-lead. Dus na Fix A (verberg toekomstige follow-up) wordt de lead op de due-dag door de
  cron gecleared + (al in Nieuw) → weer zichtbaar. Equivalent aan V1, generiek (werkt voor
  élke pipeline, ook zonder "Nx Gebeld"-stages).

**V1's call-progressie nemen we MEE** (Fix C, gekozen door Marvin): de opp wordt per
belpoging naar "Nx Gebeld" verplaatst. Met Fix A is dit dubbel-robuust (opp niet in eerste
stage ÉN toekomstige follow-up verbergen beide). Graceful fallback voor pipelines zonder
"Nx Gebeld"-stages (geen match → Fix A verbergt alsnog).

## Niet-doelen
- Bug 3 (WhatsApp outbound-echo) — aparte slice, eerst Voidfix-payload bevestigen.
- Geen verplaatsing van `nextFollowUpAt` naar opp-niveau (grotere refactor; deze fix lost
  de gemelde bugs op binnen het contact-niveau-model).
- `recordCallNoAnswer` blijft de opp in Nieuw laten staan (Fix A verbergt 'm via de
  toekomst-follow-up — generiek, werkt ongeacht of "Nx Gebeld"-stages bestaan).

## Bekende edge-case (geaccepteerd)
Een re-submission op een contact met een lopende toekomstige follow-up wordt door Fix A
verborgen tot die follow-up due is (de geplande terugbel dekt het). Zeldzaam; lead gaat
niet verloren (komt terug bij de follow-up).

## Testing
- **Unit:** `dashboardLeadVisibility.test.ts` voor `leadDashboardDecision`: due→show+flag,
  toekomst→hide, geen-follow-up+first-stage→show, geen-follow-up+geen-first-stage→hide,
  dueBefore=null→valt terug op hasFirstStageOpp.
- **Build-gates:** vitest · `convex dev --once` · build · tsc (geen nieuwe fouten).
- **Reversibele CLI-smoke** (`convex/__debug.ts`, daarna verwijderd): throwaway
  workspace+pipeline+contact+opp:
  - zet `nextFollowUpAt = nu + 2 dagen`, opp in Nieuw → dashboard-helper `keep=false`
    (verborgen); zet `nextFollowUpAt = nu - 1 uur` → `keep=true, dueFollowup=true`.
  - `recordCallAnswered`-replica voor appointment → assert `nextFollowUpAt` gewist + opp in
    qualified-stage; `moveToStage`-replica naar won → assert `nextFollowUpAt` gewist.
  - ruimt alles op.
- **Browser dev-smoke:** op een test-contact in /crm "Niet bereikt" → lead verdwijnt;
  (optioneel) `nextFollowUpAt` terugzetten via debug → lead komt terug. Geen mail/SMS.

## Risico's
- Hoog-impact (live dashboard + cron). Mitigatie: pure helper unit-getest, reversibele
  smokes, 3-agent-verificatie, expliciete dev-smoke vóór merge. Fix A verbergt alleen leads
  die een EXPLICIET geplande toekomstige follow-up hebben (1x gebeld / callback) — verse
  ongebelde leads (nextFollowUpAt null) blijven gewoon zichtbaar.

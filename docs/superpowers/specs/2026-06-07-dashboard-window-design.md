# Dashboard-window (instelbaar, default 90d) — Design

**Status:** goedgekeurd (Marvin, 2026-06-07)

## Probleem

Het speed-to-lead-dashboard (`listIncomingLeads` in `convex/contacts.ts`) heeft nu een
puur **count-based** venster: `.take(400)` nieuwste contacten + twee resurface-paden:

1. **Eerste-stage-resurface** — oudere contacten met een verse opp in de eerste stage
   (`firstStageContactIds`), zónder enige leeftijdsbound.
2. **Verlopen-follow-up** — leads met `nextFollowUpAt <= dueBefore`.

Het bord = *verse Nieuw-opp-leads + due-follow-up-leads*. Gevolg: een lead die maanden
geleden binnenkwam en nooit is opgevolgd, blijft via pad (1) **eeuwig** op het hot-bord
staan. Dat hoort thuis in de pipeline-triage, niet op het speed-to-lead-dashboard.

## Doel

Maak de recency instelbaar: nooit-opgevolgde "Nieuw"-leads ouder dan N dagen vallen van
het bord (blijven gewoon in de pipeline). Leads **mét** een verlopen/due follow-up blijven
áltijd zichtbaar — een due follow-up is een expliciet "bel deze persoon"-signaal en
leeftijd mag dat niet verbergen.

**Default: 90 dagen.** Instelbaar onder Instellingen → Lead-flow.

## Niet-doelen (YAGNI)

- Geen index-level tijd-range die `.take(400)` vervangt (Approach B) — de re-submission-
  resurface heeft geen leeftijdsbound en zou die range omzeilen, dus het venster moet
  hoe dan ook als post-filter. Bij StayCool's volume (90d ≪ 400 nieuwe leads) nul winst.
- Geen `Date.now()` in de query — niet-deterministisch → refetch-thrash. We hergebruiken
  de al-doorgegeven stabiele client-timestamp `dueBefore`.
- Geen nieuwe query-arg.
- Geen frontend-wijziging aan het dashboard zelf.

## Architectuur — Approach A (semantische post-filter)

De `.take(400)` perf-bound blijft ongemoeid. Het venster is één extra filter ná het
verrijken, op `leadCreatedAt` (= `attribution?._creationTime ?? c._creationTime`, exact de
waarde waarop al gesorteerd wordt).

### Setting-plumbing (standaard crmSettings-patroon)

- `convex/schema.ts` — `crmSettings.dashboardWindowDays: v.optional(v.number())`.
- `convex/crmSettings.ts`:
  - `DEFAULT_SETTINGS.dashboardWindowDays = 90`
  - `get`-return: `dashboardWindowDays: settings?.dashboardWindowDays ?? DEFAULT_SETTINGS.dashboardWindowDays`
  - `update`-args: `dashboardWindowDays: v.optional(v.number())` + patch-blok
  - `getEffectiveSettings` return-type `dashboardWindowDays: number` + value.

### Logica in `listIncomingLeads`

1. `const settings = await getEffectiveSettings(ctx, args.workspaceId)` — import bestaat al
   (`recordCallNoAnswer` gebruikt 'm).
2. Cutoff afgeleid van de bestaande stabiele timestamp:
   ```ts
   const windowCutoff =
     args.dueBefore != null
       ? args.dueBefore - settings.dashboardWindowDays * 86_400_000
       : null;
   ```
   `dueBefore` = einde-van-vandaag (client). `null` ⇒ geen venster (veilige fallback voor
   callers zonder `dueBefore`).
3. De `checked`-map krijgt een `dueFollowup`-vlag: `true` voor het verlopen-follow-up
   keep-pad (a), `false` voor het eerste-stage-pad (b). Die vlag reist mee door `keepers`
   → `enriched`.
4. Eindfilter vóór `sort`/`slice`:
   ```ts
   .filter(
     (e) => windowCutoff == null || e.dueFollowup || e.leadCreatedAt >= windowCutoff,
   )
   ```

### Return-shape

`dueFollowup: boolean` rijdt mee in elke dashboard-row. Non-breaking additie (Convex
auto-typed; frontend leest het niet). Bewust laten staan — kan later een "follow-up
vandaag"-badge voeden. Geen frontend-aanpassing nodig nu.

## Gedragseffect (de enige zichtbare verandering)

| Lead | `leadCreatedAt` | `dueFollowup` | Resultaat |
|---|---|---|---|
| Verse Meta/web-lead vandaag | nu | false | blijft ✅ |
| Re-submission vandaag op 2 jr oud contact | nu (attribution) | false | blijft ✅ |
| Nooit-aangeraakte "Nieuw" 100 dagen oud | 100d | false | **valt van bord** (90d-default) — staat nog in pipeline ✅ |
| Oude lead mét verlopen follow-up | oud | true | blijft ✅ |
| Toekomstige follow-up (al gebeld) | — | — | viel al weg (huidig gedrag, ongewijzigd) |

3-strike-onbereikbare leads zijn al uit `followable` gefilterd (`!c.unreachable`) en hebben
geen `nextFollowUpAt` → niet geraakt door deze wijziging.

## UI

Eén extra `Field` in `src/routes/crm.settings_.lead-flow.tsx`, card "Drempelwaarden":

- Label: "Dashboard-venster"
- suffix: "dagen", min 7, max 730
- Hint: "Nooit-opgevolgde leads ouder dan dit aantal dagen verdwijnen van het
  speed-to-lead-dashboard (ze blijven in de pipeline). Leads met een openstaande follow-up
  blijven altijd zichtbaar."
- DEFAULTS + state + `useEffect` + `resetToDefaults` + `handleSave.update({...})`.

## Verificatie

- **Unit:** de keep-beslissing wordt geëxtraheerd naar een pure helper
  `convex/dashboardWindow.ts → isWithinDashboardWindow(leadCreatedAt, dueFollowup, windowCutoff)`
  (geen Convex-imports → unit-testbaar), conform het project-patroon "pure helper + test
  per slice". `convex/dashboardWindow.test.ts` dekt: null-cutoff, due-follow-up-bypass,
  recente lead, oude lead, en de grens (`==` cutoff).
- `npx convex dev --once` schoon · `npm run build` `✓ built` · `npx tsc --noEmit` geen
  nieuwe fouten in `contacts.ts`/`crmSettings.ts`/`lead-flow.tsx`.
- `npx vitest run` groen (bestaande suite blijft groen — geen logica-helper toegevoegd).
- **Dev-smoke:** zet venster laag (bv. 1 dag) in `/crm/settings/lead-flow` → een oude
  Nieuw-lead verdwijnt van `/crm` (dashboard); een lead met een verlopen follow-up blijft.
  Zet terug op 90 → oude lead komt terug. (Dev = kopie van prod; geen e-mail/SMS hierbij.)

## Risico's

- **Behavior-changing op prod-dashboard:** bij 90d-default verbergt dit currently-zichtbare
  oude Nieuw-leads. Mitigatie: hoge default (90), altijd-zichtbaar bij follow-up, en de
  leads blijven volledig in de pipeline (alleen het hot-bord wordt geschoond). Instelbaar
  → Marvin kan 365 zetten als hij meer wil zien.
- Venster geldt alleen bij meegegeven `dueBefore` → geen verrassing voor non-dashboard
  callers.

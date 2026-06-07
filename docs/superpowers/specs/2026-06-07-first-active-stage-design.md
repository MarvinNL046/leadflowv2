# Robuuste first-stage-definitie (`pickFirstActiveStage`) — Design

**Status:** goedgekeurd (Marvin, 2026-06-07)

## Probleem

De code bepaalt "de eerste stage" op **drie verschillende manieren**:

1. **Dashboard keep-logic** (`convex/contacts.ts` `listIncomingLeads`): een opp telt als
   "in de eerste stage" via `s.order === 0 || isFirstStage(s.name)`, waarbij
   `isFirstStage` matcht op de naam (`bevat "nieuw"/"new"/"lead"`). Fragiel.
2. **Dashboard resurface-pad** (zelfde functie): `stages.find(s => !isWonStage &&
   !isLostStage)` = eerste actieve stage op volgorde. Correct.
3. **Follow-up-cron** (`convex/followups.ts` `processDueFollowups`):
   `[...stages].sort((a,b)=>a.order-b.order)[0]` = laagste order outright (kan een
   closed stage zijn).

`reorderStages` legt **geen rol-volgorde-constraint** op → een gebruiker kan een
"Verloren"-stage naar order 0 slepen. Self-service stage-beheer (#12) maakt zowel het
hernoemen van de intake-stage als het herordenen bereikbaar voor elke klant. Dan:
- de naam-match (1) faalt als de intake-stage niet "nieuw/new/lead" heet en niet op
  order 0 staat;
- `order === 0` (1) en `sort[0]` (3) wijzen naar een closed stage als die op order 0 staat
  → de cron zou overdue opps dan **in een won/lost-stage** zetten.

## Doel

Eén robuuste, single-sourced definitie — **de eerste niet-won/niet-lost stage op
volgorde** — als pure helper, overal gebruikt.

## Niet-doelen (YAGNI)

- Geen schema-wijziging (geen expliciete `isFirstStage`-vlag-kolom — de rol-velden
  + order zijn voldoende).
- Geen rol-volgorde-constraint toevoegen aan `reorderStages` (aparte zorg; de helper
  maakt de detectie sowieso robuust ongeacht volgorde).
- `followupLogic.ts` (`shouldResurfaceOpp`) blijft ongewijzigd (krijgt `firstStageId`
  als input).

## Architectuur

### 1. Pure helper — `convex/pipelinesLogic.ts` (bestaat al sinds #12)
```ts
export function pickFirstActiveStage<
  T extends { order: number; isWonStage: boolean; isLostStage: boolean },
>(stages: T[]): T | undefined {
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .find((s) => !s.isWonStage && !s.isLostStage);
}
```
Generiek (werkt met `Doc<"pipelineStages">`), sorteert intern (vertrouwt niet op
caller-volgorde), geen Convex-imports → unit-testbaar.

### 2. `convex/contacts.ts` → `listIncomingLeads`
- Import `pickFirstActiveStage` uit `./pipelinesLogic`.
- **Resurface-loop:** `const first = stages.find(s => !s.isWonStage && !s.isLostStage)`
  → `const first = pickFirstActiveStage(stages)`. Verzamel naast `firstStageContactIds`
  óók `firstStageIds: Set<Id<"pipelineStages">>` (`firstStageIds.add(first._id)`).
- **Keep-logic:** verwijder de `isFirstStage`-naam-helper; vervang de per-opp
  `ctx.db.get(o.stageId)`-laadlus + naam-match door
  `const anyFirst = opps.some((o) => firstStageIds.has(o.stageId))`. → naam-match weg,
  definitie identiek aan resurface, minder DB-reads.

### 3. `convex/followups.ts` → `processDueFollowups`
- Import `pickFirstActiveStage`.
- `const firstStage = [...stages].sort((a,b)=>a.order-b.order)[0]`
  → `const firstStage = pickFirstActiveStage(stages)`. `if (!firstStage) continue` blijft.

## Gedragseffect

Voor StayCool's pipeline (intake = order-0, actief, naam bevat "Lead/Nieuw") zijn oud en
nieuw **identiek** → geen regressie. De wijziging telt alleen in de edge-cases die #12
bereikbaar maakte:
- Hernoemde intake-stage die niet op order 0 staat → keep-logic detecteert nu correct.
- Closed stage op order 0 → cron resurfacet nu naar de eerste *actieve* stage i.p.v. de
  closed stage. (`closedStageIds` ving de opp daar sowieso al af, dus geen dubbel-effect.)

## Testing

- **Unit:** `convex/pipelinesLogic.test.ts` voor `pickFirstActiveStage`: leeg → undefined,
  alles-closed → undefined, normaal → laagste actieve, **closed-op-order-0 → overslaan**
  (robustness-case), ongesorteerde input → sorteert correct.
- **Build-gates:** `npx vitest run` groen · `npx convex dev --once` schoon · `npm run
  build` `✓ built` · `npx tsc --noEmit` geen nieuwe fouten in de 3 files.
- **Dev-smoke (no-regression):** `/crm` toont nog steeds ~123 leads (de #11-baseline bij
  venster 90) → keep-logic ongewijzigd voor StayCool. De divergente gevallen zijn door de
  unit-test gedekt; de live dev-pipeline muteer ik niet. De cron-wijziging is voor
  StayCool gedrags-identiek (order-0 = actief).

## Risico's

- Laag. Voor de bestaande prod-pipeline gedrags-identiek; de wijziging verbetert puur de
  robustness in door #12 bereikbaar geworden edge-cases. Cron-touch beperkt tot één regel
  (de target-selectie); `shouldResurfaceOpp`-logica ongemoeid.

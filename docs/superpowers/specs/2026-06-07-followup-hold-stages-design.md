# Follow-up: gevorderde stages vasthouden — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** een per-stage vlag waarmee de follow-up-cron (`convex/followups.ts processDueFollowups`) opps in die stage NIET auto-terugzet naar Nieuw. Lost de multi-opp-regressie op (een deal in "Afspraak Ingepland" wordt niet onterecht teruggetrokken door een contact-level follow-up). **Sensitive (live cron) → bouwen op dev, vóór prod-merge aan Marvin voorleggen.**

## Doel
`nextFollowUpAt` staat op contact-niveau; de cron sleept álle niet-gesloten opps van een due contact naar de eerste stage. Voor een contact met meerdere opps kan een gevorderde deal (bijv. "Afspraak Ingepland") zo onterecht naar Nieuw regresseren. Met een "vasthouden bij follow-up"-vlag per stage slaat de cron die stage over.

## Huidige situatie (geverifieerd)
- `convex/followups.ts` `processDueFollowups`: per workspace → default pipeline → stages → `firstStage` (laagste order) + `closedStageIds` (won/lost). Due contacts via `by_workspace_nextFollowUp` ([1, now]). Per due contact: unreachable/deleted → alleen `nextFollowUpAt` clearen; anders per opp: skip first-stage, skip closed, anders `patch(stageId=first)` + `opportunityStageHistory` + `moved++`; daarna `nextFollowUpAt=undefined` + `cleared++`. **Geverifieerd correct** (reproductie 2026-06-07).
- `pipelineStages`: `pipelineId, name, order, color, isWonStage, isLostStage` + index `by_pipeline_order`. Geen "noResurface".
- `convex/pipelines.ts`: `setStageRole`-mutation (membership-checked) als patroon. Settings-UI `src/routes/crm.settings_.pipeline.tsx` rendert stages met rename/color/role/delete via een `StageRow`-component.

## Gewenste situatie

### 1. Schema
`pipelineStages` + `noResurface: v.optional(v.boolean())`. Leeg/false = huidig gedrag (wél terugzetten). Additief, geen migratie.

### 2. Pure helper
`convex/followupLogic.ts` → `shouldResurfaceOpp(stageId, { firstStageId, closedStageIds, noResurfaceStageIds })`: `false` als stage = first, of in closed-set, of in noResurface-set; anders `true`. `closedStageIds`/`noResurfaceStageIds` getypeerd als `ReadonlySet<string>` (accepteert `Set<Id<...>>`). Unit-testbaar.

### 3. Cron
`processDueFollowups`: bouw `noResurfaceStageIds` (stages met `noResurface === true`); vervang de twee inline-checks in de opp-loop door `if (!shouldResurfaceOpp(o.stageId, {...})) continue;`. `nextFollowUpAt` wordt nog steeds altijd gecleared (geen eindeloze her-trigger). Gedrag ongewijzigd zolang geen enkele stage `noResurface` heeft.

### 4. Mutation
`convex/pipelines.ts` → `setStageNoResurface({ stageId, value: boolean })` (membership-checked via `pipeline.workspaceId`, patcht `noResurface`).

### 5. UI
`src/routes/crm.settings_.pipeline.tsx`: per stage een toggle **"Vasthouden bij follow-up"** (aria-label + korte uitleg "niet auto-terugzetten naar Nieuw"). `StageRow` krijgt `onNoResurface`. Roept `setStageNoResurface` aan met toast + `humanizeConvexError`.

## Data-flow
```
cron processDueFollowups
  stages → firstStage, closedStageIds, noResurfaceStageIds(noResurface===true)
  due contact → per opp: shouldResurfaceOpp? ja → naar Nieuw + history + moved++ ; nee → skip
  nextFollowUpAt = undefined (altijd) ; cleared++
settings: toggle per stage → setStageNoResurface → pipelineStages.noResurface
```

## Wijzigingen (overzicht)
- `convex/schema.ts` — `pipelineStages.noResurface`.
- `convex/followupLogic.ts` (+ `.test.ts`) — `shouldResurfaceOpp`.
- `convex/followups.ts` — helper gebruiken + noResurfaceStageIds.
- `convex/pipelines.ts` — `setStageNoResurface`.
- `src/routes/crm.settings_.pipeline.tsx` — toggle.

## Edge cases
- **Geen stage met noResurface:** identiek aan huidig gedrag (set leeg).
- **Alle opps van een contact in noResurface/closed:** geen move (`moved` telt 0 voor dat contact), `nextFollowUpAt` wél gecleared (lead resurface't niet, maar follow-up niet eindeloos).
- **first-stage óók noResurface:** first wordt sowieso geskipt (eerste check); harmless.
- **Type:** `ReadonlySet<string>` zodat `Set<Id<"pipelineStages">>` zonder cast past.

## Out of scope (bewust)
- Per-opportunity follow-up (grotere refactor — `nextFollowUpAt` naar opp).
- Andere cron-wijzigingen / dashboard-resurface (`listIncomingLeads`) ongemoeid.
- Default een stage als noResurface markeren (Marvin zet zelf "Afspraak Ingepland" aan).

## Verificatie
1. `npx vitest run` groen (incl. `shouldResurfaceOpp`-tests).
2. `npx convex dev --once` schoon; `npm run build` + geen nieuwe tsc-fouten in gewijzigde bestanden.
3. **Dev-smoke reproductie:** markeer "Afspraak Ingepland" als vasthouden via de settings-UI; maak een contact due met (a) een opp in "Afspraak Ingepland" en (b) een opp in "1x Gebeld"; run de cron → alléén de "1x Gebeld"-opp gaat naar Nieuw, de "Afspraak Ingepland"-opp blijft staan; `nextFollowUpAt` gecleared.
4. **GEEN prod-merge zonder Marvins expliciete go** (live cron).

# Pipelines slice 1 — Statistieken-balk op de kanban — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** een statistieken-balk bovenaan de kanban (`src/routes/crm.pipelines.tsx`) met aantallen + win-rate%. Eerste slice van de Pipelines-parity. GEEN merge/prod zonder Marvins go.

## Doel
De kanban toont nu alleen kolommen + kaarten, geen funnel-overzicht. Voeg een balk toe met **Open / Gewonnen / Verloren** (aantallen) + **win-rate%**, zodat Marvin de funnel-gezondheid in één oogopslag ziet. Geen €-bedragen (zie hieronder).

## Huidige situatie (geverifieerd)
- `crm.pipelines.tsx` `KanbanBoard` laadt `api.pipelines.getDefault({ workspaceId })` → pipeline, en `api.opportunities.listForKanban({ pipelineId })` → `{ pipeline, stages, opportunities }`. `listForKanban` doet **`.take(200)` per stage** → niet geschikt voor accurate totalen/win-rate over de hele set.
- `opportunities` heeft `value` (optioneel) + `currency`; **bijna alle opps hebben `value = €1500`** (uniforme placeholder/migratie-default, geen echte deal-bedragen). Marvin koos daarom: **stats-balk zonder €** (alleen aantallen + win-rate).
- `pipelineStages` heeft `isWonStage` / `isLostStage` (booleans) → bron voor won/lost-classificatie.
- `convex/opportunities.ts`: heeft `query`, `v`, module-helper `requireWorkspaceMembership(ctx, workspaceId)`, `Doc`/`Id`. Index `by_workspace_stage` op opportunities, `by_pipeline_order` op pipelineStages.
- De kanban-pagina toont nu al €-placeholder op drie plekken (subtitel "totaal €", per-stage, per-kaart). **Niet** aangeraakt in deze slice (zie out of scope).

## Gewenste situatie

### 1. Pure aggregatie-helper (testbaar)
Nieuw `convex/pipelineStats.ts` (pure functie):
```ts
computePipelineStats(
  stages: Array<{ _id: string; isWonStage: boolean; isLostStage: boolean }>,
  opps: Array<{ stageId: string }>,
): { openCount, wonCount, lostCount, totalCount, winRate: number | null }
```
Classificatie per opp: stage in won-set → won; in lost-set → lost; anders → open. `winRate = round(won / (won + lost) * 100)`; **`null`** als `won + lost === 0` (geen deel-door-nul). Geïsoleerd + unit-testbaar onder de bestaande vitest-config (`convex/**/*.test.ts`).

### 2. Aggregatie-query
`api.opportunities.pipelineStats({ pipelineId })` → membership-check (via `pipeline.workspaceId`) → collect alle stages + **álle** opps per stage (`by_workspace_stage`, **zónder** `.take`) → `computePipelineStats(...)`. Voor StayCool ~553 opps; goedkoop. Returnt het stats-object.

### 3. UI — stats-balk
In `crm.pipelines.tsx` een component `PipelineStatsBar({ pipelineId })` die `api.opportunities.pipelineStats` query't en vier compacte kaartjes toont in een responsive grid (2 koloms mobiel, 4 desktop): **Open** (open-aantal) · **Gewonnen** (won, emerald) · **Verloren** (lost, rose) · **Win-rate** (blauw, `—` als `null`). Geplaatst tussen de header en de `DndContext`. Reactief via `useQuery` → updatet live bij het slepen van kaarten (Convex-reactiviteit). Loading (`undefined`) → een lichte placeholder-hoogte (geen layout-shift).

## Data-flow
```
KanbanBoard → PipelineStatsBar(pipelineId)
  → api.opportunities.pipelineStats({pipelineId})
      collect stages + alle opps (geen take-cap)
      → computePipelineStats → { openCount, wonCount, lostCount, totalCount, winRate }
  → 4 kaartjes; live update bij moveToStage (drag-drop) via Convex-reactiviteit
```

## Wijzigingen (overzicht)
- `convex/pipelineStats.ts` — nieuw, pure helper.
- `convex/pipelineStats.test.ts` — nieuw, unit-tests.
- `convex/opportunities.ts` — + `pipelineStats` query (import helper).
- `src/routes/crm.pipelines.tsx` — + `PipelineStatsBar`-component + plaatsing in `KanbanBoard`.

Geen schema-wijziging, geen migratie, geen nieuwe dependency.

## Edge cases
- **Geen opps:** alles 0, win-rate `—`.
- **Alleen open opps (niks gesloten):** win-rate `—` (geen deel-door-nul).
- **Alles gewonnen:** win-rate 100%.
- **Meerdere won/lost-stages:** alle won-stages tellen mee als won, alle lost-stages als lost (set-based).
- **Stage met zowel `isWonStage` als `isLostStage` true** (data-anomalie): de helper checkt won eerst → telt als **won**. Unit-getest.
- **Stats vs. kanban-kolom bij >200 opps/stage:** `listForKanban` capt op 200 per stage, `pipelineStats` leest ongecapt. Bij een stage met >200 opps kan de stats-balk dus een hoger aantal tonen dan de kolom. Dit is **verwacht & correct** (stats = waarheid, kolom = performance-cap). Voor StayCool nu niet zichtbaar (grootste stage ~192).
- **Datavolume:** de query leest alle opps van de pipeline (collect, geen cap) — bewust, voor accurate win-rate. ~553 nu; ruim onder Convex' per-query-leeslimiet (orde ~16k documenten/8 MiB). Bij zeer grote pipelines (>~10k opps) later denormaliseren naar tellers (YAGNI nu).

## Out of scope (bewust)
- **€-waarde-stats** (value is een uniforme €1500-placeholder) — Marvin koos aantallen + win-rate.
- **Bestaande €1500-weergaven** op de pagina (subtitel/per-stage/per-kaart) — niet aangeraakt in deze slice; aparte opruim-beslissing.
- Per-stage follow-up-config (schema-uitbreiding), "pipeline aanmaken"-UI, hardcode→settings (take-limits/default-stages/branche-presets), conversie-per-stage / doorlooptijd-metrics.

## Verificatie
1. `npx vitest run` groen (incl. nieuwe `convex/pipelineStats.test.ts`).
2. `npx convex dev --once` schoon + `npm run build` (`✓ built`) + geen nieuwe tsc-fouten in gewijzigde bestanden.
3. Dev-smoke (browser, ingelogd op `localhost:5173/crm/pipelines`): de balk toont Open/Gewonnen/Verloren-aantallen + win-rate%; sleep een kaart naar Gewonnen → de aantallen + win-rate updaten live.

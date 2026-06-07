# Self-service pipeline-aanmaak — Design

**Status:** goedgekeurd (Marvin, 2026-06-07)

## Probleem

Een workspace zonder pipeline loopt vast op een dead-end. De kanban
(`src/routes/crm.pipelines.tsx`, `pipeline === null`) toont letterlijk *"Vraag een
admin om de Sales pipeline te seeden via scripts/seed-pipeline.ts"*; de settings-pagina
(`crm.settings_.pipeline.tsx`, `data === null`) toont *"Nog geen pipeline aangemaakt"*.
Er is geen UI-pad om een pipeline aan te maken — alleen een CLI-script (`seedDefault`).
Voor Leadflow als multi-tenant SaaS is dat een gebroken onboarding voor elke nieuwe klant.

Stage-beheer (toevoegen/hernoemen/verwijderen/herordenen/kleur/rol/Vasthouden) bestáát al
volledig in `convex/pipelines.ts` + de settings-pagina. De enige gap is de **pipeline zelf
aanmaken**.

## Doel

Vervang beide dead-ends door een echt aanmaak-formulier. Na aanmaak is alles aanpasbaar
via de bestaande stage-CRUD. **Eén pipeline per workspace** (huidig model) blijft —
multi-pipeline is een aparte, grotere slice.

## Niet-doelen (YAGNI)

- Geen multi-pipeline (meerdere pipelines per workspace, switcher, default-wissel,
  pipeline-verwijderen). Aparte slice.
- Geen stage-keuze bij aanmaak — de 5 `DEFAULT_STAGES` worden gezet, daarna customizen.
- `seedDefault` blijft bestaan voor het CLI-script (idempotent).

## Architectuur

### Backend — `convex/pipelines.ts` + `convex/pipelinesLogic.ts`

- **Pure helper** `convex/pipelinesLogic.ts`:
  ```ts
  export function validatePipelineName(
    name: string,
  ): { value: string } | { error: string }
  ```
  Trim → leeg = `{ error: "Naam mag niet leeg zijn" }`; >80 tekens =
  `{ error: "Naam mag max 80 tekens zijn" }`; anders `{ value: trimmed }`. Geen
  Convex-imports → unit-testbaar. Hergebruikt in `createPipeline` én (DRY-opruiming in
  dezelfde file, zelfde regels/limiet) in de bestaande `renamePipeline`.

- **Nieuwe mutation** `createPipeline({ workspaceId, name })`:
  1. `requireWorkspaceMembership(ctx, workspaceId)` (bestaand patroon)
  2. `validatePipelineName(name)` → bij `error` throw
  3. **Guard:** als er al een default pipeline voor deze workspace bestaat → throw
     `"Er bestaat al een pipeline voor deze workspace"` (bewaakt single-pipeline-model +
     voorkomt dubbel-aanmaken bij dubbel-submit).
  4. insert `pipelines { workspaceId, name: value, isDefault: true }`
  5. `insertDefaultStages(ctx, pipelineId)`
  6. return `pipelineId`

- **DRY-helper** `insertDefaultStages(ctx, pipelineId)` — extraheert de bestaande
  stage-insert-lus uit `seedDefault`; gebruikt door `seedDefault` én `createPipeline`.
  Gebruikt dezelfde module-constante `DEFAULT_STAGES`.

### Frontend — gedeelde component

`src/components/crm/create-pipeline-form.tsx`, props `{ workspaceId }`:
- Naam-input voorgevuld met `"Sales"` (bewerkbaar), knop "Pipeline aanmaken".
- `useMutation(api.pipelines.createPipeline)`; bij succes geen extra actie nodig (de
  `getDefault`-query refetcht reactief); bij fout `toast.error(humanizeConvexError(...))`.
- Disable-knop tijdens submit; lege naam → knop disabled.

Gebruikt in **beide** empty-states (kanban `pipeline === null`, settings `data === null`),
ter vervanging van de dead-end-tekst. Eén component, twee call-sites → geen duplicatie.

## Data-flow & errors

Geen pipeline → form zichtbaar → `createPipeline` → DB-insert → `getDefault` refetcht
reactief → board/settings verschijnen, form verdwijnt. Form toont uitsluitend bij null →
geen conflict met de guard. Dubbel-submit of bestaande pipeline → guard throwt → toast.
Naam-validatie-fouten → toast.

## Testing

- **Unit:** `convex/pipelinesLogic.test.ts` voor `validatePipelineName`: leeg/whitespace →
  error, >80 → error, geldig → getrimde value.
- **Build-gates:** `npx vitest run` groen · `npx convex dev --once` schoon ·
  `npm run build` `✓ built` · `npx tsc --noEmit` geen nieuwe fouten in changed files.
- **Backend dev-smoke (CLI, reversibel, non-destructief):** dev heeft maar één workspace,
  die al een pipeline heeft → de empty-state is niet veilig bereikbaar zonder StayCool's
  live pipeline (269 opps) te raken. Daarom een tijdelijke `convex/__debug.ts`
  internalMutation (zoals eerder gebruikt + daarna verwijderd) die:
  1. een **wegwerp** org + workspace aanmaakt,
  2. de `createPipeline`-insert-logica draait (pipeline + `insertDefaultStages`) →
     assert: pipeline bestaat + exact 5 stages, rollen kloppen (1 won, 1 lost, 3 actief),
  3. de guard test: een tweede create op die workspace → moet throwen,
  4. **alles wat hij aanmaakte weer verwijdert** (stages, pipeline, workspace, org) op ID.
  Run via `npx convex run`. Daarna `convex/__debug.ts` verwijderen. Raakt geen bestaande
  StayCool-data.
- **UI-render:** de empty-state-form is een standaard form-component; render-pad geverifieerd
  via `npm run build` + tsc + de gedeelde-component-structuur. Eerlijk genoteerd: de
  empty-state-UI wordt niet in de browser ge-smoket omdat dev geen pipeline-loze workspace
  heeft; de eerste echte nieuwe-klant-workspace is de natuurlijke live-verificatie.

## Risico's

- Laag. Additieve mutation + form; bestaand gedrag ongewijzigd (form toont alleen bij
  null). `seedDefault`-refactor naar `insertDefaultStages` is gedrags-neutraal (zelfde
  inserts). `renamePipeline`-refactor gebruikt dezelfde regels/messages.

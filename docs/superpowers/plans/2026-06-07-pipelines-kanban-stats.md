# Pipelines slice 1 — Statistieken-balk op de kanban — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak-voor-taak uit te voeren. Steps gebruiken checkbox-syntax (`- [ ]`).

**Goal:** Een statistieken-balk (Open / Gewonnen / Verloren + win-rate%) bovenaan de kanban, gevoed door een aggregatie-query over álle opps van de pipeline.

**Architecture:** Geen schema-wijziging. Pure helper `computePipelineStats` (unit-getest) + een `pipelineStats`-query (collect-all, zonder de 200-cap van `listForKanban`) + een `PipelineStatsBar`-component op de kanban.

**Tech Stack:** TanStack Start (React) + Convex + shadcn/ui + vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-pipelines-kanban-stats-design.md`

**Niet mergen/prod zonder Marvins go.**

---

## File Structure
- `convex/pipelineStats.ts` — pure helper (geen Convex-context).
- `convex/pipelineStats.test.ts` — unit-tests.
- `convex/opportunities.ts` — + `pipelineStats` query (importeert de helper; naast `listForKanban`).
- `src/routes/crm.pipelines.tsx` — + `PipelineStatsBar`-component + plaatsing in `KanbanBoard`.

---

### Task 0: Setup — feature-branch

**Files:** geen.

- [ ] **Step 1: Branch vanaf actuele main**

```bash
cd /home/marvin/Projecten/leadflowv2
git checkout main && git pull --ff-only origin main
git checkout -b feat/pipelines-stats
```

Expected: `Switched to a new branch 'feat/pipelines-stats'`.

---

### Task 1: Pure helper `computePipelineStats` (TDD)

**Files:**
- Create: `convex/pipelineStats.test.ts`
- Create: `convex/pipelineStats.ts`

- [ ] **Step 1: Schrijf de falende test**

Maak `convex/pipelineStats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computePipelineStats } from "./pipelineStats";

const stages = [
  { _id: "s_new", isWonStage: false, isLostStage: false },
  { _id: "s_appt", isWonStage: false, isLostStage: false },
  { _id: "s_won", isWonStage: true, isLostStage: false },
  { _id: "s_lost", isWonStage: false, isLostStage: true },
];

describe("computePipelineStats", () => {
  it("classificeert open/won/lost + win-rate", () => {
    const opps = [
      { stageId: "s_new" },
      { stageId: "s_appt" },
      { stageId: "s_won" },
      { stageId: "s_won" },
      { stageId: "s_lost" },
    ];
    const r = computePipelineStats(stages, opps);
    expect(r.openCount).toBe(2);
    expect(r.wonCount).toBe(2);
    expect(r.lostCount).toBe(1);
    expect(r.totalCount).toBe(5);
    expect(r.winRate).toBe(67); // round(2/3*100)
  });
  it("geen opps → alles 0, win-rate null", () => {
    const r = computePipelineStats(stages, []);
    expect(r).toEqual({
      openCount: 0,
      wonCount: 0,
      lostCount: 0,
      totalCount: 0,
      winRate: null,
    });
  });
  it("alleen open opps → win-rate null", () => {
    const r = computePipelineStats(stages, [
      { stageId: "s_new" },
      { stageId: "s_appt" },
    ]);
    expect(r.winRate).toBeNull();
    expect(r.openCount).toBe(2);
  });
  it("alles gewonnen → win-rate 100", () => {
    const r = computePipelineStats(stages, [
      { stageId: "s_won" },
      { stageId: "s_won" },
    ]);
    expect(r.winRate).toBe(100);
  });
  it("opp in onbekende stage telt als open", () => {
    const r = computePipelineStats(stages, [{ stageId: "s_ghost" }]);
    expect(r.openCount).toBe(1);
  });
  it("stage met isWonStage EN isLostStage → telt als won", () => {
    const weird = [{ _id: "s_x", isWonStage: true, isLostStage: true }];
    const r = computePipelineStats(weird, [{ stageId: "s_x" }]);
    expect(r.wonCount).toBe(1);
    expect(r.lostCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run de test — verwacht FAIL**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/pipelineStats.test.ts`
Expected: FAIL — module/export bestaat niet.

- [ ] **Step 3: Implementeer de helper**

Maak `convex/pipelineStats.ts`:

```ts
/**
 * Pure aggregatie voor de kanban-stats-balk. Geen Convex-context →
 * unit-testbaar onder `convex/**\/*.test.ts`.
 */

type StatStage = { _id: string; isWonStage: boolean; isLostStage: boolean };

export function computePipelineStats(
  stages: Array<StatStage>,
  opps: Array<{ stageId: string }>,
): {
  openCount: number;
  wonCount: number;
  lostCount: number;
  totalCount: number;
  winRate: number | null;
} {
  const wonIds = new Set(stages.filter((s) => s.isWonStage).map((s) => s._id));
  const lostIds = new Set(
    stages.filter((s) => s.isLostStage).map((s) => s._id),
  );

  let won = 0;
  let lost = 0;
  let open = 0;
  for (const o of opps) {
    if (wonIds.has(o.stageId)) won++;
    else if (lostIds.has(o.stageId)) lost++;
    else open++;
  }

  const closed = won + lost;
  return {
    openCount: open,
    wonCount: won,
    lostCount: lost,
    totalCount: opps.length,
    winRate: closed === 0 ? null : Math.round((won / closed) * 100),
  };
}
```

- [ ] **Step 4: Run de test — verwacht PASS**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/pipelineStats.test.ts`
Expected: PASS — 5 tests groen.

- [ ] **Step 5: Commit**

```bash
git add convex/pipelineStats.ts convex/pipelineStats.test.ts
git commit -m "feat(pipelines): computePipelineStats helper + unit tests"
```

---

### Task 2: `pipelineStats`-query

**Files:**
- Modify: `convex/opportunities.ts` (import + nieuwe query ná `listForKanban`, ~regel 142)

- [ ] **Step 1: Voeg de helper-import toe**

Voeg ná `import type { Doc, Id } from "./_generated/dataModel";` (regel 10) toe:

```ts
import { computePipelineStats } from "./pipelineStats";
```

- [ ] **Step 2: Voeg de query toe (ná `listForKanban`)**

Plaats ná het einde van `listForKanban` (de regel `    return { pipeline, stages, opportunities: enriched };` gevolgd door `  },` en `});`):

```ts

/**
 * Aggregaten voor de kanban-stats-balk: aantallen + win-rate over ÁLLE opps
 * van de pipeline (geen 200-cap zoals listForKanban). Geen €-waarde (value is
 * een uniforme placeholder).
 */
export const pipelineStats = query({
  args: { pipelineId: v.id("pipelines") },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline) throw new Error("Pipeline not found");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) =>
        q.eq("pipelineId", args.pipelineId),
      )
      .collect();

    const opps: Array<{ stageId: string }> = [];
    for (const stage of stages) {
      const rows = await ctx.db
        .query("opportunities")
        .withIndex("by_workspace_stage", (q) =>
          q.eq("workspaceId", pipeline.workspaceId).eq("stageId", stage._id),
        )
        .collect();
      for (const r of rows) opps.push({ stageId: r.stageId });
    }

    return computePipelineStats(stages, opps);
  },
});
```

- [ ] **Step 3: Typecheck/deploy naar dev**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: schoon (functies klaar, geen validator-/typefouten).

- [ ] **Step 4: Commit**

```bash
git add convex/opportunities.ts
git commit -m "feat(pipelines): pipelineStats aggregatie-query"
```

---

### Task 3: `PipelineStatsBar` op de kanban

**Files:**
- Modify: `src/routes/crm.pipelines.tsx` (component-definitie + plaatsing in `KanbanBoard`)

- [ ] **Step 1: Plaats de balk in `KanbanBoard`**

Vervang in `KanbanBoard` (ná de header-`</div>`, vóór de `<DndContext>`):

```tsx
        </Button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
```

door:

```tsx
        </Button>
      </div>

      <PipelineStatsBar pipelineId={pipeline.pipeline._id} />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
```

- [ ] **Step 2: Voeg de `PipelineStatsBar`-component toe**

Voeg toe direct vóór `function StageColumn({` (alle imports — `useQuery`, `api`, `Skeleton`, `cn`, `Id` — bestaan al bovenin het bestand):

```tsx
function PipelineStatsBar({ pipelineId }: { pipelineId: Id<'pipelines'> }) {
  const stats = useQuery(api.opportunities.pipelineStats, { pipelineId })
  if (stats === undefined) {
    return <Skeleton className="h-[68px] w-full" />
  }
  const items = [
    { label: 'Open', value: String(stats.openCount), tone: 'text-zinc-900' },
    {
      label: 'Gewonnen',
      value: String(stats.wonCount),
      tone: 'text-emerald-600',
    },
    { label: 'Verloren', value: String(stats.lostCount), tone: 'text-rose-600' },
    {
      label: 'Win-rate',
      value: stats.winRate === null ? '—' : `${stats.winRate}%`,
      tone: 'text-blue-600',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
        >
          <div className="text-xs text-zinc-500">{it.label}</div>
          <div className={cn('mt-0.5 text-xl font-semibold', it.tone)}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function StageColumn({
```

- [ ] **Step 3: Build + typecheck**

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: `✓ built`.

Run: `cd /home/marvin/Projecten/leadflowv2 && npx tsc --noEmit 2>&1 | grep -E "crm\.pipelines\.tsx|pipelineStats\.ts|opportunities\.ts"`
Expected: geen output (geen nieuwe fouten in de gewijzigde bestanden). Pre-existing baseline-fouten elders (bv. `scripts/`) zijn niet relevant.

- [ ] **Step 4: Commit**

```bash
git add src/routes/crm.pipelines.tsx
git commit -m "feat(pipelines): statistieken-balk op de kanban"
```

---

### Task 4: Eindverificatie

**Files:** geen.

- [ ] **Step 1: Volledige gates**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run`
Expected: PASS — bestaande tests + 5 nieuwe `pipelineStats`-tests, alle groen.

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: schoon.

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: `✓ built`.

- [ ] **Step 2: Dev-smoke (browser, ingelogd op `localhost:5173/crm/pipelines`)**

Controleer:
- De stats-balk staat boven de kanban: Open / Gewonnen / Verloren (aantallen) + Win-rate%.
- De aantallen kloppen met de kolom-tellingen. ⚠️ NB: bij een stage met >200 opps mag de stats-balk hóger zijn dan de kolom (stats leest ongecapt, kanban capt op 200) — verwacht & correct. Voor StayCool nu n.v.t. (grootste stage ~192).
- Sleep een kaart naar de Gewonnen-kolom → Gewonnen-aantal +1 en win-rate% updaten live.

- [ ] **Step 3: Branch pushen — GEEN merge/prod zonder Marvins go**

```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin feat/pipelines-stats
```

Rapporteer aan Marvin: slice gebouwd + geverifieerd, branch gepusht, klaar voor zijn merge-besluit.

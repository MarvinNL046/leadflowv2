# Self-service pipeline-aanmaak — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox-syntax.

**Goal:** Vervang de "vraag een admin / draai een script"-dead-ends door een echt pipeline-aanmaak-formulier (naam → pipeline + 5 default-stages), zodat een nieuwe workspace self-service een pipeline kan opzetten.

**Architecture:** Pure helper `validatePipelineName` (TDD) + nieuwe `createPipeline`-mutation (guard op single-pipeline-model) + gedeelde DRY-helper `insertDefaultStages` (ook in `seedDefault`) + één gedeelde `CreatePipelineForm`-component in beide empty-states.

**Tech Stack:** Convex (mutation/query), TanStack Start (React), vitest, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-06-07-pipeline-aanmaak-design.md`

**Eén pipeline per workspace (huidig model) blijft. Additief — bestaand gedrag ongewijzigd (form toont alleen bij geen pipeline). Normale merge-route na go.**

---

### Task 0: Branch (AL GEDAAN)

Branch `feat/pipeline-aanmaak` bestaat al en de spec is erop gecommit. Geen actie.

---

### Task 1: Pure helper `convex/pipelinesLogic.ts` (TDD)

**Files:**
- Create: `convex/pipelinesLogic.ts`
- Test: `convex/pipelinesLogic.test.ts`

- [ ] **Step 1: Falende test** — `convex/pipelinesLogic.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validatePipelineName } from "./pipelinesLogic";

describe("validatePipelineName", () => {
  it("geldige naam → getrimde value", () => {
    expect(validatePipelineName("  Sales  ")).toEqual({ value: "Sales" });
  });
  it("lege naam → error", () => {
    expect(validatePipelineName("")).toEqual({
      error: "Naam mag niet leeg zijn",
    });
  });
  it("alleen whitespace → error", () => {
    expect(validatePipelineName("   ")).toEqual({
      error: "Naam mag niet leeg zijn",
    });
  });
  it("> 80 tekens → error", () => {
    expect(validatePipelineName("x".repeat(81))).toEqual({
      error: "Naam mag max 80 tekens zijn",
    });
  });
  it("exact 80 tekens → ok", () => {
    const name = "x".repeat(80);
    expect(validatePipelineName(name)).toEqual({ value: name });
  });
});
```

- [ ] **Step 2:** Run → FAIL: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/pipelinesLogic.test.ts`
  Verwacht: FAIL (module/function niet gevonden).

- [ ] **Step 3: Implementeer** — `convex/pipelinesLogic.ts`:
```ts
/**
 * Pure validatie voor pipeline-namen. Geen Convex-imports → unit-testbaar.
 * Gebruikt door createPipeline + renamePipeline (zelfde regels: ≤80 tekens).
 */
export function validatePipelineName(
  name: string,
): { value: string } | { error: string } {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Naam mag niet leeg zijn" };
  if (trimmed.length > 80) return { error: "Naam mag max 80 tekens zijn" };
  return { value: trimmed };
}
```

- [ ] **Step 4:** Run → PASS: `npx vitest run convex/pipelinesLogic.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/pipelinesLogic.ts convex/pipelinesLogic.test.ts
git commit -m "feat(pipelines): pure validatePipelineName helper + tests"
```

---

### Task 2: Backend — `insertDefaultStages` + `createPipeline` + `renamePipeline` refactor

**Files:** Modify `convex/pipelines.ts`

- [ ] **Step 1: Import helper** — voeg ná `import type { Id } from "./_generated/dataModel";`
  (regel 9) toe:
```ts
import { validatePipelineName } from "./pipelinesLogic";
```

- [ ] **Step 2: `insertDefaultStages`-helper** — voeg direct ná het `DEFAULT_STAGES`-array
  (ná de `];` op regel 26) toe:
```ts

/**
 * Insert de DEFAULT_STAGES voor een pipeline (order 0..n). Gedeeld door
 * seedDefault (CLI-seed) en createPipeline (UI). Geëxporteerd zodat de
 * reversibele backend-smoke de échte helper test (niet een kopie).
 */
export async function insertDefaultStages(
  ctx: MutationCtx,
  pipelineId: Id<"pipelines">,
): Promise<void> {
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    const s = DEFAULT_STAGES[i];
    await ctx.db.insert("pipelineStages", {
      pipelineId,
      name: s.name,
      order: i,
      color: s.color,
      isWonStage: s.isWonStage,
      isLostStage: s.isLostStage,
    });
  }
}
```

- [ ] **Step 3: `seedDefault` gebruikt de helper** — vervang in `seedDefault` de inline-lus
```ts
    for (let i = 0; i < DEFAULT_STAGES.length; i++) {
      const s = DEFAULT_STAGES[i];
      await ctx.db.insert("pipelineStages", {
        pipelineId,
        name: s.name,
        order: i,
        color: s.color,
        isWonStage: s.isWonStage,
        isLostStage: s.isLostStage,
      });
    }

    return { pipelineId, created: true };
```
  door
```ts
    await insertDefaultStages(ctx, pipelineId);

    return { pipelineId, created: true };
```

- [ ] **Step 4: `createPipeline`-mutation** — voeg direct ná de afsluiting van `seedDefault`
  (ná de `});` op regel 111) toe:
```ts

/**
 * Maak de (eerste) pipeline voor een workspace + de 5 default-stages. UI-pad
 * voor de empty-state. Single-pipeline-model: weigert als er al een default is.
 */
export const createPipeline = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const result = validatePipelineName(args.name);
    if ("error" in result) throw new Error(result.error);

    // Guard: single-pipeline-model. Convex-mutations draaien atomisch in één
    // transactie → geen race-window tussen deze check en de insert hieronder.
    const existing = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (existing) {
      throw new Error("Er bestaat al een pipeline voor deze workspace");
    }

    const pipelineId = await ctx.db.insert("pipelines", {
      workspaceId: args.workspaceId,
      name: result.value,
      isDefault: true,
    });
    await insertDefaultStages(ctx, pipelineId);

    return pipelineId;
  },
});
```

- [ ] **Step 5: `renamePipeline` gebruikt de helper (DRY)** — vervang in `renamePipeline`
  het inline-validatieblok
```ts
    const trimmed = args.name.trim();
    if (!trimmed) throw new Error("Naam mag niet leeg zijn");
    if (trimmed.length > 80) throw new Error("Naam mag max 80 tekens zijn");

    await ctx.db.patch(args.pipelineId, { name: trimmed });
```
  door
```ts
    const result = validatePipelineName(args.name);
    if ("error" in result) throw new Error(result.error);

    await ctx.db.patch(args.pipelineId, { name: result.value });
```

- [ ] **Step 6:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/pipelines\.ts"` → geen nieuwe fouten. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/pipelines.ts convex/_generated
git commit -m "feat(pipelines): createPipeline + insertDefaultStages helper + renamePipeline DRY"
```

---

### Task 3: Gedeelde component `CreatePipelineForm`

**Files:** Create `src/components/crm/create-pipeline-form.tsx`

- [ ] **Step 1: Component** — `src/components/crm/create-pipeline-form.tsx`:
```tsx
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export function CreatePipelineForm({
  workspaceId,
}: {
  workspaceId: Id<'workspaces'>
}) {
  const create = useMutation(api.pipelines.createPipeline)
  const [name, setName] = useState('Sales')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await create({ workspaceId, name: trimmed })
      toast.success('Pipeline aangemaakt')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Aanmaken mislukt'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm items-center gap-2"
    >
      <Input
        value={name}
        maxLength={80}
        placeholder="Pipeline-naam (bijv. Sales)"
        onChange={(e) => setName(e.target.value)}
        className="flex-1"
      />
      <Button type="submit" disabled={saving || !name.trim()}>
        <Plus className="h-4 w-4" />
        {saving ? 'Aanmaken…' : 'Pipeline aanmaken'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 2:** `npm run build` → `✓ built`. `npx tsc --noEmit 2>&1 | grep -E "create-pipeline-form\.tsx"` → geen fouten. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add src/components/crm/create-pipeline-form.tsx
git commit -m "feat(pipelines): gedeelde CreatePipelineForm-component"
```

---

### Task 4: Wire form in beide empty-states

**Files:** Modify `src/routes/crm.pipelines.tsx`, `src/routes/crm.settings_.pipeline.tsx`

- [ ] **Step 1: Kanban-import** — voeg in `src/routes/crm.pipelines.tsx` ná
  `import { InlineEditText } from '../components/crm/inline-edit-text'` (regel 23) toe:
```ts
import { CreatePipelineForm } from '../components/crm/create-pipeline-form'
```

- [ ] **Step 2: Kanban empty-state** — vervang in `crm.pipelines.tsx` het `<p>`-blok
```tsx
          <p className="max-w-md text-center text-sm text-zinc-500">
            Vraag een admin om de Sales pipeline te seeden via
            scripts/seed-pipeline.ts.
          </p>
```
  door
```tsx
          <p className="max-w-md text-center text-sm text-zinc-500">
            Maak je eerste pipeline aan om leads in een kanban te beheren. Je
            krijgt 5 standaard-stages die je daarna kunt aanpassen.
          </p>
          <CreatePipelineForm workspaceId={workspaceId} />
```

- [ ] **Step 3: Settings-import** — voeg in `src/routes/crm.settings_.pipeline.tsx` ná
  `import { InlineEditText } from '../components/crm/inline-edit-text'` (regel 28) toe:
```ts
import { CreatePipelineForm } from '../components/crm/create-pipeline-form'
```

- [ ] **Step 4: Settings empty-state** — vervang in `crm.settings_.pipeline.tsx` het
  `data === null`-blok
```tsx
  if (data === null) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-amber-700">
            Nog geen pipeline aangemaakt voor deze workspace.
          </p>
        </CardContent>
      </Card>
    )
  }
```
  door
```tsx
  if (data === null) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="text-sm text-zinc-600">
            Nog geen pipeline aangemaakt voor deze workspace. Maak er een aan —
            je krijgt 5 standaard-stages die je daarna kunt aanpassen.
          </p>
          <CreatePipelineForm workspaceId={workspaceId} />
        </CardContent>
      </Card>
    )
  }
```

- [ ] **Step 5: Verifieer `workspaceId` in scope (al bevestigd)** — beide empty-state-blokken
  zitten in een inner component die `workspaceId: Id<'workspaces'>` als **niet-optionele
  prop** krijgt (geen `undefined`): `crm.pipelines.tsx` → `KanbanBoard` (regel 50, null-tak
  regel 68); `crm.settings_.pipeline.tsx` → `PipelineEditor` (regel 64, null-tak regel 82).
  Dus `<CreatePipelineForm workspaceId={workspaceId} />` type-checkt schoon. Bevestig met:
```bash
cd /home/marvin/Projecten/leadflowv2
npx tsc --noEmit 2>&1 | grep -E "crm\.pipelines\.tsx|crm\.settings_\.pipeline\.tsx" || echo "geen nieuwe fouten in de twee routes"
```

- [ ] **Step 6:** `npm run build` → `✓ built`. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add src/routes/crm.pipelines.tsx src/routes/crm.settings_.pipeline.tsx
git commit -m "feat(pipelines): CreatePipelineForm in kanban + settings empty-states"
```

---

### Task 5: Eindverificatie + reversibele backend-smoke

**Files:** tijdelijk `convex/__debug.ts` (daarna verwijderd)

- [ ] **Step 1: Build-gates**
```bash
cd /home/marvin/Projecten/leadflowv2
npx vitest run            # groen, incl. pipelinesLogic.test.ts
npx convex dev --once     # schoon
npm run build             # ✓ built
npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/pipelines(Logic)?\.ts|create-pipeline-form\.tsx|crm\.pipelines\.tsx|crm\.settings_\.pipeline\.tsx" || echo "geen nieuwe fouten in changed files"
```

- [ ] **Step 2: Reversibele backend-smoke** — `convex/__debug.ts`:
```ts
import { internalMutation } from "./_generated/server";
import { insertDefaultStages } from "./pipelines";

/**
 * WEGWERP — verifieert de échte insertDefaultStages-helper + guard-query tegen
 * een throwaway workspace, en ruimt alles weer op. Verwijder na de run.
 */
export const smokeCreatePipeline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db.query("users").first();
    if (!user) throw new Error("geen user op dev");

    const orgId = await ctx.db.insert("orgs", {
      name: "__smoke_org",
      slug: "__smoke_org_" + user._id,
      ownerId: user._id,
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      orgId,
      name: "__smoke_ws",
      isDefault: false,
    });

    // Insert pipeline + roep de ÉCHTE insertDefaultStages aan (zoals createPipeline,
    // zonder de auth-wrapper).
    const pipelineId = await ctx.db.insert("pipelines", {
      workspaceId,
      name: "Sales",
      isDefault: true,
    });
    await insertDefaultStages(ctx, pipelineId);

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipelineId))
      .collect();
    const won = stages.filter((s) => s.isWonStage).length;
    const lost = stages.filter((s) => s.isLostStage).length;
    const active = stages.filter((s) => !s.isWonStage && !s.isLostStage).length;

    // Guard-check: een default pipeline bestaat nu → createPipeline zou weigeren.
    const existingDefault = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    const guardWouldBlock = existingDefault !== null;

    // Teardown — verwijder alles wat we aanmaakten.
    for (const s of stages) await ctx.db.delete(s._id);
    await ctx.db.delete(pipelineId);
    await ctx.db.delete(workspaceId);
    await ctx.db.delete(orgId);

    return {
      stageCount: stages.length,
      won,
      lost,
      active,
      guardWouldBlock,
    };
  },
});
```

- [ ] **Step 3: Run de smoke**
```bash
cd /home/marvin/Projecten/leadflowv2
npx convex dev --once     # deploy __debug
npx convex run __debug:smokeCreatePipeline '{}'
```
  Verwacht: `{ stageCount: 5, won: 1, lost: 1, active: 3, guardWouldBlock: true }`.

- [ ] **Step 4: Verwijder debug-bestand + redeploy**
```bash
cd /home/marvin/Projecten/leadflowv2
rm convex/__debug.ts
npx convex dev --once     # __debug weg uit deployment
```

- [ ] **Step 5: Branch pushen + rapporteren (normale merge-route na go):**
```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin feat/pipeline-aanmaak
```

# Follow-up: gevorderde stages vasthouden — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans. Steps gebruiken checkbox-syntax (`- [ ]`).

**Goal:** Per-stage vlag `noResurface` waarmee de follow-up-cron opps in die stage NIET auto-terugzet naar Nieuw.

**Architecture:** Additief schema-veld + pure helper `shouldResurfaceOpp` (unit-getest) die de cron-beslissing inkapselt + een settings-toggle. Gedrag ongewijzigd zolang geen stage de vlag heeft.

**Tech Stack:** Convex + TanStack Start + shadcn/ui + vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-followup-hold-stages-design.md`

**⚠️ SENSITIVE — live cron. Bouwen op dev. GEEN prod-merge zonder Marvins expliciete go.**

---

### Task 0: Setup — feature-branch

```bash
cd /home/marvin/Projecten/leadflowv2
git checkout main && git pull --ff-only origin main
git checkout -b feat/followup-hold-stages
```

---

### Task 1: Schema — `pipelineStages.noResurface`

**Files:** `convex/schema.ts`

- [ ] **Step 1:** In `pipelineStages: defineTable({ ... })`, voeg ná `isLostStage: v.boolean(),` toe:

```ts
    noResurface: v.optional(v.boolean()),
```

- [ ] **Step 2:** `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once` → schoon (additief).

- [ ] **Step 3:** Commit:
```bash
git add convex/schema.ts
git commit -m "feat(followup): pipelineStages.noResurface veld"
```

---

### Task 2: Pure helper `shouldResurfaceOpp` (TDD) + cron

**Files:** `convex/followupLogic.test.ts` (create), `convex/followupLogic.ts` (create), `convex/followups.ts` (modify)

- [ ] **Step 1: Falende test** — maak `convex/followupLogic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldResurfaceOpp } from "./followupLogic";

const opts = {
  firstStageId: "first",
  closedStageIds: new Set(["won", "lost"]),
  noResurfaceStageIds: new Set(["appt"]),
};

describe("shouldResurfaceOpp", () => {
  it("first-stage → false (al in Nieuw)", () => {
    expect(shouldResurfaceOpp("first", opts)).toBe(false);
  });
  it("won/lost → false", () => {
    expect(shouldResurfaceOpp("won", opts)).toBe(false);
    expect(shouldResurfaceOpp("lost", opts)).toBe(false);
  });
  it("noResurface-stage → false", () => {
    expect(shouldResurfaceOpp("appt", opts)).toBe(false);
  });
  it("normale stage → true", () => {
    expect(shouldResurfaceOpp("called", opts)).toBe(true);
  });
});
```

- [ ] **Step 2:** Run → FAIL: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/followupLogic.test.ts`

- [ ] **Step 3: Implementeer** — maak `convex/followupLogic.ts`:

```ts
/**
 * Pure beslissing voor de follow-up-cron: mag een opp in deze stage worden
 * teruggezet naar Nieuw? Geen Convex-context → unit-testbaar.
 * Sets als ReadonlySet<string> zodat Set<Id<...>> zonder cast past.
 */
export function shouldResurfaceOpp(
  stageId: string,
  opts: {
    firstStageId: string;
    closedStageIds: ReadonlySet<string>;
    noResurfaceStageIds: ReadonlySet<string>;
  },
): boolean {
  if (stageId === opts.firstStageId) return false;
  if (opts.closedStageIds.has(stageId)) return false;
  if (opts.noResurfaceStageIds.has(stageId)) return false;
  return true;
}
```

- [ ] **Step 4:** Run → PASS (4 tests).

- [ ] **Step 5: Cron gebruikt de helper** — in `convex/followups.ts`:

(a) Voeg import toe ná de bestaande imports:
```ts
import { shouldResurfaceOpp } from "./followupLogic";
```

(b) Voeg ná het `closedStageIds`-blok toe:
```ts
      const noResurfaceStageIds = new Set<Id<"pipelineStages">>(
        stages.filter((s) => s.noResurface === true).map((s) => s._id),
      );
```

(c) Vervang in de opp-loop:
```ts
        for (const o of opps) {
          if (o.stageId === firstStage._id) continue; // al in Nieuw
          if (closedStageIds.has(o.stageId)) continue; // won/lost → laten staan
          await ctx.db.patch(o._id, { stageId: firstStage._id });
```
door:
```ts
        for (const o of opps) {
          if (
            !shouldResurfaceOpp(o.stageId, {
              firstStageId: firstStage._id,
              closedStageIds,
              noResurfaceStageIds,
            })
          )
            continue;
          await ctx.db.patch(o._id, { stageId: firstStage._id });
```

- [ ] **Step 6:** `npx convex dev --once` → schoon.

- [ ] **Step 7:** Commit:
```bash
git add convex/followupLogic.ts convex/followupLogic.test.ts convex/followups.ts
git commit -m "feat(followup): shouldResurfaceOpp helper + cron respecteert noResurface"
```

---

### Task 3: Mutation `setStageNoResurface`

**Files:** `convex/pipelines.ts`

- [ ] **Step 1:** Voeg toe (ná `setStageRole`, hergebruikt `mutation`, `v`, `requireWorkspaceMembership`):

```ts
/** Zet de "vasthouden bij follow-up"-vlag op een stage. */
export const setStageNoResurface = mutation({
  args: { stageId: v.id("pipelineStages"), value: v.boolean() },
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage niet gevonden");
    const pipeline = await ctx.db.get(stage.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);
    await ctx.db.patch(args.stageId, { noResurface: args.value });
    return null;
  },
});
```

- [ ] **Step 2:** `npx convex dev --once` → schoon.

- [ ] **Step 3:** Commit:
```bash
git add convex/pipelines.ts
git commit -m "feat(followup): setStageNoResurface mutation"
```

---

### Task 4: UI — toggle in pipeline-settings

**Files:** `src/routes/crm.settings_.pipeline.tsx`

- [ ] **Step 1: Mutation-hook + doorgeven aan StageRow**

(a) Bij de andere `useMutation`-hooks (naast `setStageRole`):
```ts
  const setStageNoResurface = useMutation(api.pipelines.setStageNoResurface)
```

(b) In de `<StageRow ... />`-aanroep (in de `orderedStages.map`), voeg ná `onRole={...}` toe:
```tsx
              onNoResurface={async (value) => {
                try {
                  await setStageNoResurface({ stageId: stage._id, value })
                  toast.success(
                    value
                      ? 'Stage wordt vastgehouden bij follow-up'
                      : 'Stage doet weer mee met follow-up',
                  )
                } catch (err) {
                  toast.error(
                    humanizeConvexError(err, 'Wijzigen mislukt'),
                  )
                }
              }}
```

- [ ] **Step 2: StageRow prop + toggle**

(a) Voeg `onNoResurface` toe aan de `StageRow`-props (destructuring + type):
```ts
  onNoResurface,
```
en in het type-blok ná `onRole: (role: 'normal' | 'won' | 'lost') => Promise<void>`:
```ts
  onNoResurface: (value: boolean) => Promise<void>
```

(b) Voeg de toggle-knop toe ná `<RoleSelector value={role} onChange={onRole} />`, vóór de delete-`<Button>`:
```tsx
      <button
        type="button"
        onClick={() => void onNoResurface(!stage.noResurface)}
        className={cn(
          'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
          stage.noResurface
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50',
        )}
        title="Niet auto-terugzetten naar Nieuw bij verlopen follow-up"
        aria-pressed={stage.noResurface === true}
      >
        Vasthouden
      </button>
```

(c) Zorg dat `cn` geïmporteerd is bovenin `crm.settings_.pipeline.tsx` (`import { cn } from '#/lib/utils.ts'`); voeg toe als 'ie ontbreekt.

- [ ] **Step 3: Build + typecheck**

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build` → `✓ built`.
Run: `cd /home/marvin/Projecten/leadflowv2 && npx tsc --noEmit 2>&1 | grep -E "(^|/)src/routes/crm\.settings_\.pipeline\.tsx|(^|/)convex/followups\.ts|(^|/)convex/followupLogic\.ts|(^|/)convex/pipelines\.ts"` → geen output.

- [ ] **Step 4:** Commit:
```bash
git add src/routes/crm.settings_.pipeline.tsx
git commit -m "feat(followup): 'Vasthouden bij follow-up'-toggle in pipeline-settings"
```

---

### Task 5: Eindverificatie

- [ ] **Step 1: Gates** — `npx vitest run` (groen, incl. `shouldResurfaceOpp`), `npx convex dev --once` (schoon), `npm run build` (`✓ built`).

- [ ] **Step 2: Dev-smoke reproductie (browser + CLI)**
  - In `/crm/settings/pipeline`: zet de toggle "Vasthouden" AAN bij **"Afspraak Ingepland"**.
  - Maak een contact due met (a) een opp in "Afspraak Ingepland" + (b) een opp in "1x Gebeld" (tijdelijk debug-mutatie zoals eerder, óf via de app + handmatig `nextFollowUpAt` backdaten).
  - `npx convex run followups:processDueFollowups` → controleer: de "1x Gebeld"-opp staat in Nieuw; de "Afspraak Ingepland"-opp **bleef** staan; `nextFollowUpAt` gecleared.
  - Verwijder eventuele tijdelijke debug-code.
  - Zet de toggle weer UIT als je de live default niet wilt wijzigen (tot prod).

- [ ] **Step 3: Branch pushen — GEEN merge/prod.**
```bash
git push -u origin feat/followup-hold-stages
```
Rapporteer aan Marvin: gebouwd + dev-geverifieerd; **wacht op expliciete go voor merge naar main + prod** (live cron).

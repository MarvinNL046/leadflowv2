# Per-stage retry-interval — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox-syntax.

**Goal:** Maak het "volgende belpoging over N dagen"-interval (na "Niet bereikt") instelbaar per pipeline-stage; niet ingesteld = workspace-`defaultFollowUpDays` = huidig gedrag.

**Architecture:** Pure helper `resolveFollowUpDays` (TDD) + schema-veld `pipelineStages.followUpDays` + `setStageFollowUpDays`-mutation + integratie in `recordCallNoAnswer` (verst-gevorderde open opp bepaalt het interval) + per-stage-veld in de pipeline-settings-UI.

**Tech Stack:** Convex (mutation), TanStack Start (React), vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-per-stage-followup-design.md`

**Additief; default-pad ongewijzigd. Raakt de call-flow-mutation `recordCallNoAnswer` (geen mail/SMS). Normale merge-route na go.**

---

### Task 0: Branch (AL GEDAAN)

Branch `feat/per-stage-followup` bestaat al + spec erop gecommit. Geen actie.

---

### Task 1: Pure helper `convex/followUpInterval.ts` (TDD)

**Files:** Create `convex/followUpInterval.ts`, `convex/followUpInterval.test.ts`

- [ ] **Step 1: Falende test** — `convex/followUpInterval.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveFollowUpDays } from "./followUpInterval";

describe("resolveFollowUpDays", () => {
  it("geen open opp → default", () => {
    expect(resolveFollowUpDays([], 2)).toBe(2);
  });
  it("één open opp zonder override → default", () => {
    expect(resolveFollowUpDays([{ order: 0 }], 2)).toBe(2);
  });
  it("één open opp mét override → override", () => {
    expect(resolveFollowUpDays([{ order: 0, followUpDays: 5 }], 2)).toBe(5);
  });
  it("meerdere opps → hoogste-order stage wint", () => {
    expect(
      resolveFollowUpDays(
        [
          { order: 0, followUpDays: 1 },
          { order: 2, followUpDays: 7 },
          { order: 1, followUpDays: 3 },
        ],
        2,
      ),
    ).toBe(7);
  });
  it("hoogste-order zonder override → default (negeert lagere override)", () => {
    expect(
      resolveFollowUpDays([{ order: 0, followUpDays: 1 }, { order: 2 }], 2),
    ).toBe(2);
  });
});
```

- [ ] **Step 2:** Run → FAIL: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/followUpInterval.test.ts`

- [ ] **Step 3: Implementeer** — `convex/followUpInterval.ts`:
```ts
/**
 * Bepaalt het retry-interval (dagen tot volgende belpoging) voor een lead na
 * "Niet bereikt". De verst-gevorderde open opp (hoogste stage-order) bepaalt
 * het interval: diens stage-followUpDays, of de workspace-default als die stage
 * geen override heeft of er geen open opp is. Pure → unit-testbaar.
 */
export function resolveFollowUpDays(
  openStages: Array<{ order: number; followUpDays?: number | null }>,
  defaultDays: number,
): number {
  if (openStages.length === 0) return defaultDays;
  const furthest = [...openStages].sort((a, b) => b.order - a.order)[0];
  return furthest.followUpDays ?? defaultDays;
}
```

- [ ] **Step 4:** Run → PASS: `npx vitest run convex/followUpInterval.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/followUpInterval.ts convex/followUpInterval.test.ts
git commit -m "feat(pipelines): pure resolveFollowUpDays helper + tests"
```

---

### Task 2: Schema — `pipelineStages.followUpDays`

**Files:** Modify `convex/schema.ts`

- [ ] **Step 1:** In de `pipelineStages`-tabel, direct ná
  `noResurface: v.optional(v.boolean()),` (regel 177) toevoegen:
```ts
    /** Per-stage retry-interval (dagen tot volgende belpoging na "Niet bereikt").
     * Afwezig = workspace-default (crmSettings.defaultFollowUpDays). */
    followUpDays: v.optional(v.number()),
```

- [ ] **Step 2:** `npx convex dev --once` → schoon. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/schema.ts convex/_generated
git commit -m "feat(pipelines): pipelineStages.followUpDays veld"
```

---

### Task 3: `setStageFollowUpDays`-mutation

**Files:** Modify `convex/pipelines.ts`

- [ ] **Step 1:** Voeg ONDERAAN `convex/pipelines.ts` toe (ná `setStageNoResurface`,
  die eindigt op regel ~526 met `});`):
```ts

/**
 * Zet (of wis) het per-stage retry-interval. days = null → wis (terug naar de
 * workspace-default). Alleen voor actieve stages (Gewonnen/Verloren hebben geen
 * follow-up-retry). Spiegelt setStageNoResurface.
 */
export const setStageFollowUpDays = mutation({
  args: {
    stageId: v.id("pipelineStages"),
    days: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage niet gevonden");
    const pipeline = await ctx.db.get(stage.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);
    if (stage.isWonStage || stage.isLostStage) {
      throw new Error(
        "Follow-up-interval geldt alleen voor actieve stages (niet Gewonnen/Verloren)",
      );
    }
    if (args.days !== null && (args.days < 1 || args.days > 60)) {
      throw new Error("Follow-up dagen moet tussen 1 en 60 zijn");
    }
    await ctx.db.patch(args.stageId, {
      followUpDays: args.days ?? undefined,
    });
    return null;
  },
});
```

- [ ] **Step 2:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/pipelines\.ts"` → geen nieuwe fouten. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/pipelines.ts convex/_generated
git commit -m "feat(pipelines): setStageFollowUpDays-mutation"
```

---

### Task 4: Integratie in `recordCallNoAnswer`

**Files:** Modify `convex/contacts.ts`

- [ ] **Step 1: Import** — voeg ná
  `import { pickFirstActiveStage } from "./pipelinesLogic";` toe:
```ts
import { resolveFollowUpDays } from "./followUpInterval";
```

- [ ] **Step 2: `followUpDays`-variabele + per-stage-resolutie** — in `recordCallNoAnswer`,
  vervang het non-final-strike-blok
```ts
    if (isFinalStrike) {
      patch.unreachable = true;
      patch.nextFollowUpAt = undefined;  // geen follow-up meer
    } else {
      patch.nextFollowUpAt =
        Date.now() + settings.defaultFollowUpDays * 24 * 60 * 60 * 1000;
    }
```
  door
```ts
    let followUpDays = settings.defaultFollowUpDays;
    if (isFinalStrike) {
      patch.unreachable = true;
      patch.nextFollowUpAt = undefined;  // geen follow-up meer
    } else {
      // Per-stage retry-interval: de verst-gevorderde open opp bepaalt de dagen.
      const opps = await ctx.db
        .query("opportunities")
        .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
        .collect();
      const openStages = (
        await Promise.all(
          opps.map(async (o) => {
            const s = await ctx.db.get(o.stageId);
            if (!s || s.isWonStage || s.isLostStage) return null;
            return { order: s.order, followUpDays: s.followUpDays };
          }),
        )
      ).filter(
        (x): x is { order: number; followUpDays?: number } => x != null,
      );
      followUpDays = resolveFollowUpDays(
        openStages,
        settings.defaultFollowUpDays,
      );
      patch.nextFollowUpAt = Date.now() + followUpDays * 24 * 60 * 60 * 1000;
    }
```

- [ ] **Step 3: Note-tekst gebruikt `followUpDays`** — vervang
```ts
        : `📞 Niet bereikt (poging ${newCount}). Volgende belpoging over ${settings.defaultFollowUpDays} dagen.`,
```
  door
```ts
        : `📞 Niet bereikt (poging ${newCount}). Volgende belpoging over ${followUpDays} dagen.`,
```

- [ ] **Step 4:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/contacts\.ts"` → geen nieuwe fouten. `npx vitest run` → groen. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/contacts.ts convex/_generated
git commit -m "feat(pipelines): recordCallNoAnswer gebruikt per-stage retry-interval"
```

---

### Task 5: UI — per-stage `followUpDays`-veld

**Files:** Modify `src/routes/crm.settings_.pipeline.tsx`

- [ ] **Step 1: Mutation + settings-query in `PipelineEditor`** — ná
  `const setStageNoResurface = useMutation(api.pipelines.setStageNoResurface)`
  (rond regel 73-75) toevoegen:
```ts
  const setStageFollowUpDays = useMutation(api.pipelines.setStageFollowUpDays)
  const settings = useQuery(api.crmSettings.get, { workspaceId })
  const defaultFollowUpDays = settings?.defaultFollowUpDays ?? 2
```

- [ ] **Step 2: Prop doorgeven aan `StageRow`** — in de `<StageRow ... />`-render (in de
  `orderedStages.map`), ná `onNoResurface={...}` (vóór `onDelete={...}`) toevoegen:
```tsx
              defaultFollowUpDays={defaultFollowUpDays}
              onFollowUpDays={async (days) => {
                try {
                  await setStageFollowUpDays({ stageId: stage._id, days })
                  toast.success(
                    days === null
                      ? 'Terug naar standaard-interval'
                      : 'Follow-up-interval bijgewerkt',
                  )
                } catch (err) {
                  toast.error(humanizeConvexError(err, 'Wijzigen mislukt'))
                }
              }}
```

- [ ] **Step 3: `StageRow`-props uitbreiden** — in de `StageRow`-prop-destructuring voeg
  `onFollowUpDays` + `defaultFollowUpDays` toe ná `onNoResurface,`:
```ts
  onFollowUpDays,
  defaultFollowUpDays,
```
  en in het props-type ná `onNoResurface: (value: boolean) => Promise<void>`:
```ts
  onFollowUpDays: (days: number | null) => Promise<void>
  defaultFollowUpDays: number
```

- [ ] **Step 4: Veld renderen** — in `StageRow`, ná het `{!isFirst && role === 'normal' &&
  (...)}`-Vasthouden-blok (de sluitende `)}` op regel ~369), vóór de delete-`<Button>`,
  toevoegen:
```tsx
      {role === 'normal' && (
        <FollowUpDaysField
          value={stage.followUpDays}
          defaultDays={defaultFollowUpDays}
          onChange={onFollowUpDays}
        />
      )}
```

- [ ] **Step 5: `FollowUpDaysField`-component** — voeg ONDERAAN `crm.settings_.pipeline.tsx`
  toe (vereist `useEffect` — voeg toe aan de `import { useState } from 'react'`-regel zodat
  die `import { useState, useEffect } from 'react'` wordt):
```tsx
function FollowUpDaysField({
  value,
  defaultDays,
  onChange,
}: {
  value: number | undefined
  defaultDays: number
  onChange: (days: number | null) => Promise<void>
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '')
  useEffect(() => {
    setLocal(value != null ? String(value) : '')
  }, [value])

  async function commit() {
    const trimmed = local.trim()
    if (trimmed === '') {
      if (value != null) await onChange(null)
      return
    }
    const n = Number(trimmed)
    if (!Number.isInteger(n) || n < 1 || n > 60) {
      setLocal(value != null ? String(value) : '')
      return
    }
    if (n !== value) await onChange(n)
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={1}
        max={60}
        value={local}
        placeholder={String(defaultDays)}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="w-16 rounded-md border border-zinc-200 px-2 py-1 text-xs"
        title="Dagen tot volgende belpoging voor leads in deze stage (leeg = workspace-standaard)"
        aria-label="Follow-up-interval (dagen) voor deze stage"
      />
      <span className="text-xs text-zinc-400">d</span>
    </div>
  )
}
```

- [ ] **Step 6:** `npm run build` → `✓ built`. `npx tsc --noEmit 2>&1 | grep -E "crm\.settings_\.pipeline\.tsx"` → geen nieuwe fouten. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add src/routes/crm.settings_.pipeline.tsx
git commit -m "feat(pipelines): per-stage follow-up-interval-veld in pipeline-settings"
```

---

### Task 6: Eindverificatie + smokes

**Files:** tijdelijk `convex/__debug.ts` (daarna verwijderd)

- [ ] **Step 1: Build-gates**
```bash
cd /home/marvin/Projecten/leadflowv2
npx vitest run            # groen, incl. followUpInterval.test.ts
npx convex dev --once     # schoon
npm run build             # ✓ built
npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/(contacts|pipelines|followUpInterval)\.ts|crm\.settings_\.pipeline\.tsx" || echo "geen nieuwe fouten in changed files"
```

- [ ] **Step 2: Reversibele integratie-smoke** — `convex/__debug.ts`:
```ts
import { internalMutation } from "./_generated/server";
import { resolveFollowUpDays } from "./followUpInterval";

/**
 * WEGWERP — verifieert de open-opps-laad + resolveFollowUpDays-integratie tegen
 * throwaway data, en ruimt op. Verwijder na de run.
 */
export const smokePerStageFollowup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db.query("users").first();
    if (!user) throw new Error("geen user op dev");
    const orgId = await ctx.db.insert("orgs", {
      name: "__smoke_org",
      slug: "__smoke_org_fu_" + user._id,
      ownerId: user._id,
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      orgId,
      name: "__smoke_ws",
      isDefault: false,
    });
    const pipelineId = await ctx.db.insert("pipelines", {
      workspaceId,
      name: "Smoke",
      isDefault: true,
    });
    // stage 0 = override 1 dag, stage 1 = geen override
    const stage0 = await ctx.db.insert("pipelineStages", {
      pipelineId,
      name: "Nieuw",
      order: 0,
      isWonStage: false,
      isLostStage: false,
      followUpDays: 1,
    });
    const stage1 = await ctx.db.insert("pipelineStages", {
      pipelineId,
      name: "Contact",
      order: 1,
      isWonStage: false,
      isLostStage: false,
    });
    const contactId = await ctx.db.insert("contacts", {
      workspaceId,
      firstName: "Smoke",
      callCount: 0,
    });

    // Helper: bouw openStages zoals recordCallNoAnswer doet, resolve.
    const resolve = async () => {
      const opps = await ctx.db
        .query("opportunities")
        .withIndex("by_contact", (q) => q.eq("contactId", contactId))
        .collect();
      const openStages = (
        await Promise.all(
          opps.map(async (o) => {
            const s = await ctx.db.get(o.stageId);
            if (!s || s.isWonStage || s.isLostStage) return null;
            return { order: s.order, followUpDays: s.followUpDays };
          }),
        )
      ).filter(
        (x): x is { order: number; followUpDays?: number } => x != null,
      );
      return resolveFollowUpDays(openStages, 2);
    };

    const noOpp = await resolve(); // geen open opp → default 2

    const opp0 = await ctx.db.insert("opportunities", {
      workspaceId,
      contactId,
      pipelineId,
      stageId: stage0,
      title: "Smoke",
    });
    const oneOverride = await resolve(); // alleen stage0 (override 1) → 1

    await ctx.db.insert("opportunities", {
      workspaceId,
      contactId,
      pipelineId,
      stageId: stage1,
      title: "Smoke2",
    });
    const furthestNoOverride = await resolve(); // hoogste = stage1 (geen override) → default 2

    // Teardown
    const opps = await ctx.db
      .query("opportunities")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    for (const o of opps) await ctx.db.delete(o._id);
    await ctx.db.delete(contactId);
    await ctx.db.delete(stage0);
    await ctx.db.delete(stage1);
    await ctx.db.delete(pipelineId);
    await ctx.db.delete(workspaceId);
    await ctx.db.delete(orgId);

    void opp0;
    return { noOpp, oneOverride, furthestNoOverride };
  },
});
```

- [ ] **Step 3: Run de smoke**
```bash
cd /home/marvin/Projecten/leadflowv2
npx convex dev --once
npx convex run __debug:smokePerStageFollowup '{}'
```
  Verwacht: `{ noOpp: 2, oneOverride: 1, furthestNoOverride: 2 }`.
  *(Schema-vereisten geverifieerd: `contacts` vereist `callCount`, `opportunities` vereist
  `pipelineId` + `stageId` + `title` — verwerkt in de inserts hierboven.)*

- [ ] **Step 4: Verwijder debug + redeploy**
```bash
cd /home/marvin/Projecten/leadflowv2
rm convex/__debug.ts
npx convex dev --once
```

- [ ] **Step 5: UI-smoke (browser, reversibel)** — `/crm/settings/pipeline`: zet bij een
  actieve stage een follow-up-getal (bv. 1) → herlaad → veld persisteert + placeholder bij
  lege stages = de workspace-default. Wis het getal → terug naar placeholder. (Config, geen
  lead-data.)

- [ ] **Step 6: Branch pushen (normale merge-route na go):**
```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin feat/per-stage-followup
```

# Robuuste first-active-stage definitie — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox-syntax.

**Goal:** Vervang drie afwijkende "eerste stage"-heuristieken (naam-match, `order===0`, `sort[0]`) door één pure helper `pickFirstActiveStage` (= eerste niet-won/niet-lost stage op volgorde), overal gebruikt.

**Architecture:** Pure helper in `convex/pipelinesLogic.ts` (TDD), gebruikt in `listIncomingLeads` (resurface + keep-logic, naam-match weg) en in de follow-up-cron (`sort[0]` → eerste actieve).

**Tech Stack:** Convex (query/internalMutation), vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-first-active-stage-design.md`

**Robustness-fix. Voor de bestaande prod-pipeline gedrags-identiek (intake = order-0 = actief). Raakt de live uur-cron (één regel). Normale merge-route na go.**

---

### Task 0: Branch (AL GEDAAN)

Branch `feat/first-active-stage` bestaat al en de spec is erop gecommit. Geen actie.

---

### Task 1: Pure helper `pickFirstActiveStage` (TDD)

**Files:**
- Modify: `convex/pipelinesLogic.ts` (append)
- Modify: `convex/pipelinesLogic.test.ts` (append)

- [ ] **Step 1: Falende test** — voeg ONDERAAN `convex/pipelinesLogic.test.ts` toe (en
  breid de import-regel uit):

  Vervang bovenaan:
```ts
import { validatePipelineName } from "./pipelinesLogic";
```
  door:
```ts
import { validatePipelineName, pickFirstActiveStage } from "./pipelinesLogic";
```
  En voeg onderaan toe:
```ts
describe("pickFirstActiveStage", () => {
  const mk = (
    order: number,
    isWonStage: boolean,
    isLostStage: boolean,
    name: string,
  ) => ({ order, isWonStage, isLostStage, name });

  it("lege lijst → undefined", () => {
    expect(pickFirstActiveStage([])).toBeUndefined();
  });
  it("alleen closed stages → undefined", () => {
    const stages = [
      mk(0, true, false, "Gewonnen"),
      mk(1, false, true, "Verloren"),
    ];
    expect(pickFirstActiveStage(stages)).toBeUndefined();
  });
  it("normaal → laagste-order actieve stage", () => {
    const stages = [
      mk(0, false, false, "Lead"),
      mk(1, false, false, "Contact"),
      mk(2, true, false, "Gewonnen"),
    ];
    expect(pickFirstActiveStage(stages)?.name).toBe("Lead");
  });
  it("closed op order 0 → sla over, pak eerste actieve", () => {
    const stages = [
      mk(0, false, true, "Verloren"),
      mk(1, false, false, "Lead"),
      mk(2, false, false, "Contact"),
    ];
    expect(pickFirstActiveStage(stages)?.name).toBe("Lead");
  });
  it("ongesorteerde input → sorteert op order", () => {
    const stages = [
      mk(2, false, false, "Voorstel"),
      mk(0, false, false, "Lead"),
      mk(1, false, false, "Contact"),
    ];
    expect(pickFirstActiveStage(stages)?.name).toBe("Lead");
  });
});
```

- [ ] **Step 2:** Run → FAIL: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/pipelinesLogic.test.ts`
  Verwacht: FAIL (`pickFirstActiveStage` niet geëxporteerd).

- [ ] **Step 3: Implementeer** — voeg ONDERAAN `convex/pipelinesLogic.ts` toe:
```ts

/**
 * De eerste actieve (niet-won/niet-lost) stage op volgorde. Single-sourced
 * definitie van "de eerste/intake-stage" — gebruikt door het dashboard
 * (listIncomingLeads) en de follow-up-cron. Sorteert intern, dus volgorde van
 * de input maakt niet uit. undefined als er geen actieve stage is.
 */
export function pickFirstActiveStage<
  T extends { order: number; isWonStage: boolean; isLostStage: boolean },
>(stages: T[]): T | undefined {
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .find((s) => !s.isWonStage && !s.isLostStage);
}
```

- [ ] **Step 4:** Run → PASS: `npx vitest run convex/pipelinesLogic.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/pipelinesLogic.ts convex/pipelinesLogic.test.ts
git commit -m "feat(pipelines): pure pickFirstActiveStage helper + tests"
```

---

### Task 2: `listIncomingLeads` — single-sourced first-stage

**Files:** Modify `convex/contacts.ts`

- [ ] **Step 1: Import** — voeg ná
  `import { isWithinDashboardWindow } from "./dashboardWindow";` toe:
```ts
import { pickFirstActiveStage } from "./pipelinesLogic";
```

- [ ] **Step 2: `firstStageIds`-set declareren** — vervang in `listIncomingLeads` de regel
```ts
    const firstStageContactIds = new Set<Id<"contacts">>();
```
  door
```ts
    const firstStageContactIds = new Set<Id<"contacts">>();
    const firstStageIds = new Set<Id<"pipelineStages">>();
```

- [ ] **Step 3: Resurface-loop gebruikt de helper + vult `firstStageIds`** — vervang
```ts
      const first = stages.find((s) => !s.isWonStage && !s.isLostStage);
      if (!first) continue;
      const opps = await ctx.db
```
  door
```ts
      const first = pickFirstActiveStage(stages);
      if (!first) continue;
      firstStageIds.add(first._id);
      const opps = await ctx.db
```

- [ ] **Step 4: Verwijder de naam-helper** — verwijder dit blok volledig:
```ts
    const isFirstStage = (name?: string) => {
      const n = (name ?? "").toLowerCase();
      return n.includes("nieuw") || n.includes("new") || n.includes("lead");
    };
```

- [ ] **Step 5: Keep-logic gebruikt de set** — vervang
```ts
        if (opps.length === 0)
          return { c, keep: false, dueFollowup: false };
        const stages = await Promise.all(
          opps.map((o) => ctx.db.get(o.stageId)),
        );
        // Toon als MINSTENS ÉÉN opp nog in de eerste stage (Nieuw) staat —
        // een contact kan meerdere opps hebben (elke submission = verse opp),
        // dus een verse Nieuw-opp naast oude afgehandelde moet tóch tonen.
        const anyFirst = stages.some(
          (s) => s != null && (s.order === 0 || isFirstStage(s.name)),
        );
        return { c, keep: anyFirst, dueFollowup: false };
```
  door
```ts
        if (opps.length === 0)
          return { c, keep: false, dueFollowup: false };
        // Toon als MINSTENS ÉÉN opp in de eerste actieve stage staat —
        // single-sourced via firstStageIds (zie pickFirstActiveStage in de
        // resurface-loop). Een contact kan meerdere opps hebben (elke submission
        // = verse opp), dus een verse eerste-stage-opp naast oude afgehandelde
        // moet tóch tonen.
        const anyFirst = opps.some((o) => firstStageIds.has(o.stageId));
        return { c, keep: anyFirst, dueFollowup: false };
```

- [ ] **Step 6:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/contacts\.ts"` → geen nieuwe fouten. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/contacts.ts convex/_generated
git commit -m "feat(pipelines): listIncomingLeads gebruikt pickFirstActiveStage (naam-match weg)"
```

---

### Task 3: Follow-up-cron — first-active resurface-target

**Files:** Modify `convex/followups.ts`

- [ ] **Step 1: Import** — voeg ná `import { shouldResurfaceOpp } from "./followupLogic";`
  (regel 3) toe:
```ts
import { pickFirstActiveStage } from "./pipelinesLogic";
```

- [ ] **Step 2: Helper als resurface-target** — vervang
```ts
      const firstStage = [...stages].sort((a, b) => a.order - b.order)[0];
      if (!firstStage) continue;
```
  door
```ts
      const firstStage = pickFirstActiveStage(stages);
      if (!firstStage) continue;
```

- [ ] **Step 3:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/followups\.ts"` → geen nieuwe fouten. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/followups.ts convex/_generated
git commit -m "feat(pipelines): follow-up-cron resurfacet naar eerste actieve stage"
```

---

### Task 4: Eindverificatie + dev-smoke

- [ ] **Step 1: Build-gates**
```bash
cd /home/marvin/Projecten/leadflowv2
npx vitest run            # groen, incl. nieuwe pickFirstActiveStage-tests
npx convex dev --once     # schoon
npm run build             # ✓ built
npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/(contacts|followups|pipelinesLogic)\.ts" || echo "geen nieuwe fouten in changed files"
```

- [ ] **Step 2: Dev-smoke (no-regression, browser)** — open `/crm` op dev (tab logged-in).
  Verwacht: nog steeds **~123 leads om op te volgen** (de #11-baseline bij venster 90) →
  de keep-logic is gedrags-identiek voor StayCool's pipeline (intake = order-0 = actief).
  Een afwijkend (veel lager/0) getal = regressie → stop en onderzoek. (Puur lees/filter,
  geen mail/SMS.)

- [ ] **Step 3: Branch pushen + rapporteren (normale merge-route na go):**
```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin feat/first-active-stage
```

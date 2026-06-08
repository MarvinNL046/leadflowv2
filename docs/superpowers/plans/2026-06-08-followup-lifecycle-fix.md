# Follow-up-lifecycle fix (bug 1 + 2) — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox-syntax.

**Goal:** (bug 2) lead verdwijnt uit /crm na "1x gebeld" en komt terug zodra de follow-up due is; (bug 1) afgehandelde leads (afspraak/won/lost/Vasthouden) komen niet meer terug in Nieuw.

**Architecture:** Pure helper `leadDashboardDecision` (TDD) → in `listIncomingLeads` (verbergt toekomstige follow-ups); + `nextFollowUpAt` wissen bij afhandelen in `recordCallAnswered` (appointment/not_interested) en `moveToStage` (won/lost/noResurface → patch op het CONTACT).

**Tech Stack:** Convex (query/mutation), vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-followup-lifecycle-fix-design.md`

**HOOG-IMPACT: live dashboard + uur-cron. Pure helper unit-getest + reversibele smokes + dev-smoke vóór merge. Normale merge-route na go.**

---

### Task 0: Branch (AL GEDAAN)
Branch `fix/followup-lifecycle` bestaat + spec gecommit. Geen actie.

---

### Task 1: Pure helper `convex/dashboardLeadVisibility.ts` (TDD)

**Files:** Create `convex/dashboardLeadVisibility.ts`, `convex/dashboardLeadVisibility.test.ts`

- [ ] **Step 1: Falende test** — `convex/dashboardLeadVisibility.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { leadDashboardDecision } from "./dashboardLeadVisibility";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const due = NOW + DAY; // einde-vandaag-achtige dueBefore

describe("leadDashboardDecision", () => {
  it("verlopen follow-up → tonen + dueFollowup, ongeacht opp", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: NOW - DAY,
        dueBefore: due,
        hasAnyOpp: false,
        hasFirstStageOpp: false,
      }),
    ).toEqual({ keep: true, dueFollowup: true });
  });
  it("toekomstige follow-up → verbergen (bug 2-kern)", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: NOW + 2 * DAY,
        dueBefore: due,
        hasAnyOpp: true,
        hasFirstStageOpp: true,
      }),
    ).toEqual({ keep: false, dueFollowup: false });
  });
  it("geen follow-up + opp in eerste stage → tonen", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: null,
        dueBefore: due,
        hasAnyOpp: true,
        hasFirstStageOpp: true,
      }),
    ).toEqual({ keep: true, dueFollowup: false });
  });
  it("geen follow-up + opp maar niet in eerste stage → verbergen", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: null,
        dueBefore: due,
        hasAnyOpp: true,
        hasFirstStageOpp: false,
      }),
    ).toEqual({ keep: false, dueFollowup: false });
  });
  it("geen opp → verbergen", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: null,
        dueBefore: due,
        hasAnyOpp: false,
        hasFirstStageOpp: false,
      }),
    ).toEqual({ keep: false, dueFollowup: false });
  });
  it("dueBefore null → val terug op eerste-stage-opp", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: NOW + 2 * DAY,
        dueBefore: null,
        hasAnyOpp: true,
        hasFirstStageOpp: true,
      }),
    ).toEqual({ keep: true, dueFollowup: false });
  });
});
```

- [ ] **Step 2:** Run → FAIL: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/dashboardLeadVisibility.test.ts`

- [ ] **Step 3: Implementeer** — `convex/dashboardLeadVisibility.ts`:
```ts
/**
 * Beslist of een lead op het speed-to-lead-dashboard (listIncomingLeads) hoort.
 * Pure → unit-testbaar. Volgorde:
 *   1. verlopen follow-up → tonen (de "komt na N dagen terug"-trigger).
 *   2. geen opp → verbergen (import zonder deal).
 *   3. toekomstige (nog niet due) follow-up → verbergen tot due
 *      (de "1x gebeld → verdwijnt"-flow).
 *   4. anders → tonen als er een opp in de eerste actieve stage staat.
 */
export function leadDashboardDecision(args: {
  nextFollowUpAt: number | null | undefined;
  dueBefore: number | null | undefined;
  hasAnyOpp: boolean;
  hasFirstStageOpp: boolean;
}): { keep: boolean; dueFollowup: boolean } {
  const { nextFollowUpAt, dueBefore, hasAnyOpp, hasFirstStageOpp } = args;
  if (
    dueBefore != null &&
    nextFollowUpAt != null &&
    nextFollowUpAt <= dueBefore
  ) {
    return { keep: true, dueFollowup: true };
  }
  if (!hasAnyOpp) return { keep: false, dueFollowup: false };
  if (dueBefore != null && nextFollowUpAt != null) {
    // nextFollowUpAt > dueBefore → toekomstige follow-up → verbergen
    return { keep: false, dueFollowup: false };
  }
  return { keep: hasFirstStageOpp, dueFollowup: false };
}
```

- [ ] **Step 4:** Run → PASS: `npx vitest run convex/dashboardLeadVisibility.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/dashboardLeadVisibility.ts convex/dashboardLeadVisibility.test.ts
git commit -m "feat(fix): pure leadDashboardDecision helper + tests"
```

---

### Task 2: `listIncomingLeads` gebruikt de helper

**Files:** Modify `convex/contacts.ts`

- [ ] **Step 1: Import** — ná `import { resolveFollowUpDays } from "./followUpInterval";`
  toevoegen:
```ts
import { leadDashboardDecision } from "./dashboardLeadVisibility";
```

- [ ] **Step 2: Keep-logica vervangen** — vervang het hele `checked`-map-blok:
```ts
    const checked = await Promise.all(
      followable.map(async (c) => {
        // (a) Verlopen follow-up → resurface (ongeacht stage). dueBefore =
        // einde-vandaag, meegegeven door de client. Onbereikbare (3x) leads
        // hebben geen nextFollowUpAt + zijn al uit `followable` gefilterd.
        if (
          args.dueBefore != null &&
          c.nextFollowUpAt != null &&
          c.nextFollowUpAt <= args.dueBefore
        ) {
          return { c, keep: true, dueFollowup: true };
        }
        const opps = await ctx.db
          .query("opportunities")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .collect();
        // Opp-loze contacten = geïmporteerde contacten zonder deal, GEEN
        // op-te-volgen lead. Niet tonen (anders floodt de bulk-import het
        // dashboard). Echte Meta/webhook-leads krijgen altijd een opp.
        if (opps.length === 0)
          return { c, keep: false, dueFollowup: false };
        // Toon als MINSTENS ÉÉN opp in de eerste actieve stage staat —
        // single-sourced via firstStageIds (zie pickFirstActiveStage in de
        // resurface-loop). Een contact kan meerdere opps hebben (elke submission
        // = verse opp), dus een verse eerste-stage-opp naast oude afgehandelde
        // moet tóch tonen.
        const anyFirst = opps.some((o) => firstStageIds.has(o.stageId));
        return { c, keep: anyFirst, dueFollowup: false };
      }),
    );
```
  door:
```ts
    const checked = await Promise.all(
      followable.map(async (c) => {
        const opps = await ctx.db
          .query("opportunities")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .collect();
        const hasFirstStageOpp = opps.some((o) =>
          firstStageIds.has(o.stageId),
        );
        // Toon-beslissing (zie leadDashboardDecision):
        //   verlopen follow-up → tonen · geen opp → verbergen ·
        //   TOEKOMSTIGE follow-up → verbergen tot due (1x gebeld → verdwijnt) ·
        //   anders → opp in eerste actieve stage.
        const { keep, dueFollowup } = leadDashboardDecision({
          nextFollowUpAt: c.nextFollowUpAt,
          dueBefore: args.dueBefore,
          hasAnyOpp: opps.length > 0,
          hasFirstStageOpp,
        });
        return { c, keep, dueFollowup };
      }),
    );
```

- [ ] **Step 3:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/contacts\.ts"` && echo FOUTEN || echo schoon. `npx vitest run` groen. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/contacts.ts convex/_generated
git commit -m "fix(dashboard): verberg leads met toekomstige follow-up tot due (bug 2)"
```

---

### Task 3: `recordCallAnswered` wist nextFollowUpAt bij afhandelen

**Files:** Modify `convex/contacts.ts`

- [ ] **Step 1:** Vervang het nextFollowUpAt-zet-blok in `recordCallAnswered`:
```ts
    if (args.outcome === "customer_will_callback") {
      // Klant belt zelf terug — bumpt callCount (telt als 1× gebeld) +
      // 7-dag safety-net follow-up zodat lead niet verdwijnt als klant
      // vergeet. Geen stage-update (blijft waar 't is).
      patch.callCount = (contact.callCount ?? 0) + 1;
      patch.nextFollowUpAt =
        args.followUpAt ?? Date.now() + settings.customerCallbackDays * 24 * 60 * 60 * 1000;
    } else if (args.followUpAt !== undefined) {
      patch.nextFollowUpAt = args.followUpAt;
    } else if (args.outcome === "callback") {
      // Default 7 dagen
      patch.nextFollowUpAt = Date.now() + settings.customerCallbackDays * 24 * 60 * 60 * 1000;
    }
```
  door:
```ts
    if (args.outcome === "customer_will_callback") {
      // Klant belt zelf terug — bumpt callCount (telt als 1× gebeld) +
      // 7-dag safety-net follow-up zodat lead niet verdwijnt als klant
      // vergeet. Geen stage-update (blijft waar 't is).
      patch.callCount = (contact.callCount ?? 0) + 1;
      patch.nextFollowUpAt =
        args.followUpAt ?? Date.now() + settings.customerCallbackDays * 24 * 60 * 60 * 1000;
    } else if (args.outcome === "callback") {
      // Terugbel-afspraak → toekomstige follow-up (dashboard verbergt 'm tot due).
      patch.nextFollowUpAt =
        args.followUpAt ?? Date.now() + settings.customerCallbackDays * 24 * 60 * 60 * 1000;
    } else {
      // appointment / not_interested = afgehandeld → wis de resurface-klok zodat
      // de cron de lead NIET terug naar Nieuw sleept. De afspraakdatum gaat al
      // de note in (zie hieronder). (bug 1)
      patch.nextFollowUpAt = undefined;
    }
```

- [ ] **Step 2:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/contacts\.ts"` && echo FOUTEN || echo schoon. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/contacts.ts convex/_generated
git commit -m "fix(leadflow): wis nextFollowUpAt bij afspraak/niet-geïnteresseerd (bug 1)"
```

---

### Task 4: `moveToStage` wist contact.nextFollowUpAt bij afgehandelde stage

**Files:** Modify `convex/opportunities.ts`

- [ ] **Step 1:** Direct ná `await ctx.db.patch(args.opportunityId, updates);` (in
  `moveToStage`) toevoegen:
```ts
    // Afgehandelde / vastgehouden stage → stop de auto-resurface-klok op het
    // contact, anders sleept de follow-up-cron de opp later terug naar Nieuw.
    // (bug 1: handmatige kanban-sleep naar Gewonnen/Verloren/Vasthouden)
    if (
      targetStage.isWonStage ||
      targetStage.isLostStage ||
      targetStage.noResurface === true
    ) {
      await ctx.db.patch(opp.contactId, { nextFollowUpAt: undefined });
    }
```

- [ ] **Step 2:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/opportunities\.ts"` && echo FOUTEN || echo schoon. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/opportunities.ts convex/_generated
git commit -m "fix(pipeline): moveToStage wist nextFollowUpAt bij won/lost/Vasthouden (bug 1)"
```

---

### Task 4b: Pure helper `convex/callAttemptStage.ts` (TDD) — Fix C

**Files:** Create `convex/callAttemptStage.ts`, `convex/callAttemptStage.test.ts`

- [ ] **Step 1: Falende test** — `convex/callAttemptStage.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pickCallAttemptStage } from "./callAttemptStage";

const mk = (name: string) => ({ name });
const stages = [
  mk("Nieuw"),
  mk("1x Gebeld"),
  mk("2x Gebeld"),
  mk("3x Gebeld"),
  mk("Afspraak Ingepland"),
];

describe("pickCallAttemptStage", () => {
  it("attempt 1 → '1x Gebeld'", () => {
    expect(pickCallAttemptStage(stages, 1)?.name).toBe("1x Gebeld");
  });
  it("attempt 2 → '2x Gebeld'", () => {
    expect(pickCallAttemptStage(stages, 2)?.name).toBe("2x Gebeld");
  });
  it("case/whitespace-ongevoelig", () => {
    expect(pickCallAttemptStage([mk("  1X   GEBELD ")], 1)?.name).toBe(
      "  1X   GEBELD ",
    );
  });
  it("geen match → undefined (graceful: opp blijft, Fix A verbergt)", () => {
    expect(
      pickCallAttemptStage([mk("Lead"), mk("Contact")], 1),
    ).toBeUndefined();
  });
  it("geen false-positive op '11x Gebeld' voor attempt 1", () => {
    expect(pickCallAttemptStage([mk("11x Gebeld")], 1)).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run → FAIL: `npx vitest run convex/callAttemptStage.test.ts`

- [ ] **Step 3: Implementeer** — `convex/callAttemptStage.ts`:
```ts
/**
 * Vindt de "Nx Gebeld"-stage voor een belpoging (V1-call-progressie). Exact-match
 * op de genormaliseerde naam `"{attempt}x gebeld"` (lowercase, whitespace ingeklapt)
 * → geen false-positives (bv. "11x Gebeld" matcht attempt 1 niet). Geen match →
 * undefined → caller laat de opp staan (dashboard verbergt 'm via de follow-up).
 * Pure → unit-testbaar.
 */
export function pickCallAttemptStage<T extends { name: string }>(
  stages: T[],
  attempt: number,
): T | undefined {
  const target = `${attempt}x gebeld`;
  return stages.find(
    (s) => s.name.toLowerCase().replace(/\s+/g, " ").trim() === target,
  );
}
```

- [ ] **Step 4:** Run → PASS: `npx vitest run convex/callAttemptStage.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/callAttemptStage.ts convex/callAttemptStage.test.ts
git commit -m "feat(fix): pure pickCallAttemptStage helper + tests (V1-call-progressie)"
```

---

### Task 4c: `recordCallNoAnswer` verplaatst opp naar "Nx Gebeld" — Fix C

**Files:** Modify `convex/contacts.ts`

- [ ] **Step 1: Import** — ná
  `import { leadDashboardDecision } from "./dashboardLeadVisibility";` toevoegen:
```ts
import { pickCallAttemptStage } from "./callAttemptStage";
```

- [ ] **Step 2: opp-move in de niet-final-strike-tak** — in `recordCallNoAnswer`, in de
  `else`-tak ná de bestaande `triggerFollowUpDue`-scheduler (de `ctx.scheduler.runAfter(
  settings.followUpReminderDays * ..., internal.workflowEngine.triggerFollowUpDue, {...})`),
  toevoegen:
```ts
      // V1-call-progressie: verplaats de opp naar "Nx Gebeld" (N = nieuwe
      // callCount) zodat de kanban-kolommen vullen. Geen zo'n stage → opp blijft
      // staan; het dashboard verbergt 'm alsnog via de toekomstige follow-up.
      // moveOppToStage raakt nextFollowUpAt NIET → de cron zet 'm na N dagen
      // terug naar Nieuw (de V1-loop).
      const attemptOppId = await findOrCreateOpportunity(
        ctx,
        contact.workspaceId,
        args.contactId,
        contactDisplay(contact),
      );
      if (attemptOppId) {
        const pipelineData = await getDefaultPipelineStages(
          ctx,
          contact.workspaceId,
        );
        if (pipelineData) {
          const attemptStage = pickCallAttemptStage(
            pipelineData.stages,
            newCount,
          );
          if (attemptStage) {
            await moveOppToStage(
              ctx,
              attemptOppId,
              attemptStage,
              userId,
              `called_${newCount}x`,
            );
          }
        }
      }
```

- [ ] **Step 3:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/contacts\.ts"` && echo FOUTEN || echo schoon. `npx vitest run` groen. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/contacts.ts convex/_generated
git commit -m "feat(leadflow): recordCallNoAnswer verplaatst opp naar Nx Gebeld (V1-call-progressie)"
```

---

### Task 5: Eindverificatie + smokes

**Files:** tijdelijk `convex/__debug.ts` (daarna verwijderd)

- [ ] **Step 1: Build-gates**
```bash
cd /home/marvin/Projecten/leadflowv2
npx vitest run            # groen, incl. dashboardLeadVisibility.test.ts
npx convex dev --once     # schoon
npm run build             # ✓ built
npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/(contacts|opportunities|dashboardLeadVisibility|callAttemptStage)\.ts" && echo "FOUTEN" || echo "geen nieuwe fouten in changed files"
```

- [ ] **Step 2: Reversibele CLI-smoke** — `convex/__debug.ts`:
```ts
import { internalMutation } from "./_generated/server";

/** WEGWERP — verifieert bug-1-clears tegen throwaway data. Verwijder na run. */
export const smokeFollowupLifecycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db.query("users").first();
    if (!user) throw new Error("geen user");
    const orgId = await ctx.db.insert("orgs", {
      name: "__smoke_fl",
      slug: "__smoke_fl_" + user._id,
      ownerId: user._id,
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      orgId,
      name: "WS",
      isDefault: false,
    });
    const pipelineId = await ctx.db.insert("pipelines", {
      workspaceId,
      name: "P",
      isDefault: true,
    });
    const nieuw = await ctx.db.insert("pipelineStages", {
      pipelineId,
      name: "Nieuw",
      order: 0,
      isWonStage: false,
      isLostStage: false,
    });
    const won = await ctx.db.insert("pipelineStages", {
      pipelineId,
      name: "Gewonnen",
      order: 1,
      isWonStage: true,
      isLostStage: false,
    });
    const future = 9_999_999_999_999;
    const contactId = await ctx.db.insert("contacts", {
      workspaceId,
      firstName: "Smoke",
      callCount: 0,
      nextFollowUpAt: future,
    });
    const oppId = await ctx.db.insert("opportunities", {
      workspaceId,
      contactId,
      pipelineId,
      stageId: nieuw,
      title: "Smoke",
    });

    // Simuleer moveToStage→won-clear: patch opp + (zoals de code) wis
    // contact.nextFollowUpAt omdat target won is.
    await ctx.db.patch(oppId, { stageId: won });
    await ctx.db.patch(contactId, { nextFollowUpAt: undefined });
    const after = await ctx.db.get(contactId);
    const cleared = after?.nextFollowUpAt === undefined;

    // Teardown
    await ctx.db.delete(oppId);
    await ctx.db.delete(contactId);
    await ctx.db.delete(nieuw);
    await ctx.db.delete(won);
    await ctx.db.delete(pipelineId);
    await ctx.db.delete(workspaceId);
    await ctx.db.delete(orgId);

    return { clearedAfterWonMove: cleared };
  },
});
```
  *(NB: deze smoke verifieert de DB-clear-stap + dat de helper-unit-tests de toon-logica
  dekken. De echte mutation-paden (recordCallAnswered/moveToStage) zijn dunne wrappers rond
  deze patch + zijn tsc-geverifieerd; de browser-dev-smoke in Step 5 dekt het end-to-end.)*

- [ ] **Step 3: Run smoke**
```bash
cd /home/marvin/Projecten/leadflowv2
npx convex dev --once
npx convex run __debug:smokeFollowupLifecycle '{}'
```
  Verwacht: `{ clearedAfterWonMove: true }`.

- [ ] **Step 4: Verwijder debug + redeploy**
```bash
cd /home/marvin/Projecten/leadflowv2
rm convex/__debug.ts
npx convex dev --once
```

- [ ] **Step 5: Browser dev-smoke (bug 2 + Fix C end-to-end, reversibel)** — op dev:
  1. `/crm`: noteer de lead-telling. Kies een onschuldige test-lead die nú zichtbaar is
     (opp in Nieuw, geen due follow-up); noteer de naam.
  2. Open de lead-dialog → "Bel" → "Niet bereikt" (poging 1). (Interne patch, geen mail/SMS.)
  3. Terug naar `/crm` → **die lead is verdwenen** (telling −1). ✓ bug 2 gefixt.
  4. `/crm/pipelines` (kanban) → de opp staat nu in **"1x Gebeld"** (niet meer Nieuw). ✓
     Fix C (V1-call-progressie).
  5. (Herstel, reversibel) sleep de opp op de kanban terug naar "Nieuw" (of zet via een
     debug-mutation de stage terug + `callCount`/`nextFollowUpAt` terug). De lead komt dan
     weer in /crm. callCount blijft +1 op die dev-lead (acceptabel op dev; geen prod-impact).
  ⚠️ Dev = kopie van prod: kies een test-lead; "Niet bereikt" stuurt niks naar buiten
  (alleen contact-patch + opp-stage-move + interne note).

- [ ] **Step 6: Branch pushen (normale merge-route na go):**
```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin fix/followup-lifecycle
```

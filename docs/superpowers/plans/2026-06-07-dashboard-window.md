# Dashboard-window (instelbaar, default 90d) — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox-syntax.

**Goal:** Maak de speed-to-lead-dashboard-recency instelbaar — nooit-opgevolgde "Nieuw"-leads ouder dan N dagen vallen van het bord (default 90), leads met een verlopen/due follow-up blijven áltijd zichtbaar.

**Architecture:** Pure keep-helper (`dashboardWindow.ts`, TDD) + nieuwe setting `dashboardWindowDays` (standaard crmSettings-plumbing) + één post-filter in `listIncomingLeads` op `leadCreatedAt`, met cutoff afgeleid van de bestaande stabiele client-timestamp `dueBefore`. `.take(400)` perf-bound blijft ongemoeid.

**Tech Stack:** Convex (query/mutation), TanStack Start (React), vitest, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-06-07-dashboard-window-design.md`

**Gedrags-wijzigend op prod-dashboard (verbergt oude nooit-opgevolgde Nieuw-leads van het hot-bord; ze blijven in de pipeline). Normale merge-route na go.**

---

### Task 0: Branch (AL GEDAAN)

Branch `feat/dashboard-window` bestaat al en de spec is erop gecommit (`ddfbed4`). Geen actie.

---

### Task 1: Pure keep-helper `convex/dashboardWindow.ts` (TDD)

**Files:**
- Create: `convex/dashboardWindow.ts`
- Test: `convex/dashboardWindow.test.ts`

- [ ] **Step 1: Falende test** — `convex/dashboardWindow.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isWithinDashboardWindow } from "./dashboardWindow";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000; // vaste referentie, geen Date.now()
const cutoff = NOW - 90 * DAY;

describe("isWithinDashboardWindow", () => {
  it("geen venster (cutoff null) → altijd zichtbaar", () => {
    expect(isWithinDashboardWindow(NOW - 999 * DAY, false, null)).toBe(true);
  });
  it("due follow-up → altijd zichtbaar, ongeacht leeftijd", () => {
    expect(isWithinDashboardWindow(NOW - 999 * DAY, true, cutoff)).toBe(true);
  });
  it("recente lead binnen venster → zichtbaar", () => {
    expect(isWithinDashboardWindow(NOW - 10 * DAY, false, cutoff)).toBe(true);
  });
  it("oude lead buiten venster, geen follow-up → verborgen", () => {
    expect(isWithinDashboardWindow(NOW - 100 * DAY, false, cutoff)).toBe(false);
  });
  it("grens (leadCreatedAt == cutoff) → zichtbaar (>=)", () => {
    expect(isWithinDashboardWindow(cutoff, false, cutoff)).toBe(true);
  });
});
```

- [ ] **Step 2:** Run → FAIL: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/dashboardWindow.test.ts`
  Verwacht: FAIL ("isWithinDashboardWindow is not a function" / module niet gevonden).

- [ ] **Step 3: Implementeer** — `convex/dashboardWindow.ts`:
```ts
/**
 * Pure helper voor de recency-filter van het speed-to-lead-dashboard
 * (listIncomingLeads). Geen Convex-imports → unit-testbaar onder node-env.
 *
 * Regels:
 *   - windowCutoff === null  → geen venster (caller gaf geen dueBefore mee) → tonen
 *   - dueFollowup === true    → due/verlopen follow-up = expliciet "bel deze persoon"
 *                               → áltijd tonen, ongeacht leeftijd
 *   - anders                  → alleen tonen als de lead-activiteit binnen het
 *                               venster valt (leadCreatedAt >= windowCutoff)
 */
export function isWithinDashboardWindow(
  leadCreatedAt: number,
  dueFollowup: boolean,
  windowCutoff: number | null,
): boolean {
  if (windowCutoff === null) return true;
  if (dueFollowup) return true;
  return leadCreatedAt >= windowCutoff;
}
```

- [ ] **Step 4:** Run → PASS: `npx vitest run convex/dashboardWindow.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/dashboardWindow.ts convex/dashboardWindow.test.ts
git commit -m "feat(dashboard): pure isWithinDashboardWindow keep-helper + tests"
```

---

### Task 2: Schema — setting `dashboardWindowDays`

**Files:** Modify `convex/schema.ts` (crmSettings-tabel, ná regel 273 `sendEmailOnUnreachable`)

- [ ] **Step 1:** In de `crmSettings`-tabel, direct ná de regel
  `sendEmailOnUnreachable: v.optional(v.boolean()),` toevoegen:
```ts
    /** Recency-venster speed-to-lead-dashboard (dagen). Default 90. Leads ouder
     * dan dit + zonder due follow-up vallen van het bord (blijven in pipeline). */
    dashboardWindowDays: v.optional(v.number()),
```

- [ ] **Step 2:** `npx convex dev --once` → schoon (geen schema-fouten). Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/schema.ts convex/_generated
git commit -m "feat(dashboard): crmSettings.dashboardWindowDays veld"
```

---

### Task 3: `crmSettings.ts` — defaults / get / update / effective + ctx-widening

**Files:** Modify `convex/crmSettings.ts`

- [ ] **Step 1: DEFAULT_SETTINGS** — in het `DEFAULT_SETTINGS`-object, ná
  `sendEmailOnUnreachable: false,` (regel 30) toevoegen:
```ts
  dashboardWindowDays: 90,
```

- [ ] **Step 2: `get`-return** — ná het `sendEmailOnUnreachable`-blok (regel 82-84),
  vóór de afsluitende `};`, toevoegen:
```ts
      dashboardWindowDays:
        settings?.dashboardWindowDays ??
        DEFAULT_SETTINGS.dashboardWindowDays,
```

- [ ] **Step 3: `update.args`** — ná `sendEmailOnUnreachable: v.optional(v.boolean()),`
  (regel 102) toevoegen:
```ts
    dashboardWindowDays: v.optional(v.number()),
```

- [ ] **Step 4: `update` validatie** — ná het `customerCallbackDays`-validatieblok
  (regel 130-135, eindigt met `}`), toevoegen:
```ts
    if (
      args.dashboardWindowDays !== undefined &&
      (args.dashboardWindowDays < 7 || args.dashboardWindowDays > 730)
    ) {
      throw new Error("Dashboard-venster moet tussen 7 en 730 dagen zijn");
    }
```

- [ ] **Step 5: `update` patch** — ná het `sendEmailOnUnreachable`-patchblok
  (regel 155-156) toevoegen:
```ts
    if (args.dashboardWindowDays !== undefined)
      patch.dashboardWindowDays = args.dashboardWindowDays;
```

- [ ] **Step 6: `getEffectiveSettings` ctx-widening + return** — wijzig de signatuur
  zodat een query-ctx (reader) óók geaccepteerd wordt (listIncomingLeads is een query):
  vervang
```ts
export async function getEffectiveSettings(
  ctx: { db: MutationCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<{
  maxCallAttempts: number;
  defaultFollowUpDays: number;
  followUpReminderDays: number;
  customerCallbackDays: number;
  sendEmailOnUnreachable: boolean;
}> {
```
door
```ts
export async function getEffectiveSettings(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<{
  maxCallAttempts: number;
  defaultFollowUpDays: number;
  followUpReminderDays: number;
  customerCallbackDays: number;
  sendEmailOnUnreachable: boolean;
  dashboardWindowDays: number;
}> {
```
  (`QueryCtx` is al geïmporteerd op regel 7. `getEffectiveSettings` leest alleen, dus een
  reader-ctx volstaat; een mutation-writer is assignable aan de reader-tak van de union,
  dus de bestaande call-sites in `contacts.ts` (regel 700/835) blijven werken.)

- [ ] **Step 7: `getEffectiveSettings` return-value** — ná het `sendEmailOnUnreachable`-blok
  in de return (regel 197-199), vóór de afsluitende `};`, toevoegen:
```ts
    dashboardWindowDays:
      settings?.dashboardWindowDays ?? DEFAULT_SETTINGS.dashboardWindowDays,
```

- [ ] **Step 8:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/crmSettings\.ts"` → geen nieuwe fouten. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/crmSettings.ts convex/_generated
git commit -m "feat(dashboard): dashboardWindowDays in defaults/get/update/effective (+ctx-widening)"
```

---

### Task 4: `listIncomingLeads` — venster-wiring in `convex/contacts.ts`

**Files:** Modify `convex/contacts.ts` (import + `listIncomingLeads`, regel 248-387)

- [ ] **Step 1: Import** — ná `import { getEffectiveSettings } from "./crmSettings";`
  (regel 13) toevoegen:
```ts
import { isWithinDashboardWindow } from "./dashboardWindow";
```

- [ ] **Step 2: settings + cutoff** — in `listIncomingLeads`, direct ná
  `const limit = Math.min(args.limit ?? 200, 500);` (regel 259) toevoegen:
```ts

    // Recency-venster: leads ouder dan settings.dashboardWindowDays + zonder due
    // follow-up vallen van het hot-bord. Cutoff afgeleid van de stabiele client-
    // timestamp dueBefore (geen Date.now() → geen refetch-thrash). Geen dueBefore
    // ⇒ geen venster (veilige fallback voor non-dashboard callers).
    const settings = await getEffectiveSettings(ctx, args.workspaceId);
    const windowCutoff =
      args.dueBefore != null
        ? args.dueBefore - settings.dashboardWindowDays * 86_400_000
        : null;
```

- [ ] **Step 3: `dueFollowup`-vlag in `checked`** — in de `checked`-map (regel 320-351):
  - vervang het verlopen-follow-up keep-return
```ts
          return { c, keep: true };
```
  door
```ts
          return { c, keep: true, dueFollowup: true };
```
  - vervang het opp-loze return
```ts
        if (opps.length === 0) return { c, keep: false };
```
  door
```ts
        if (opps.length === 0)
          return { c, keep: false, dueFollowup: false };
```
  - vervang het eerste-stage return
```ts
        return { c, keep: anyFirst };
```
  door
```ts
        return { c, keep: anyFirst, dueFollowup: false };
```

- [ ] **Step 4: `keepers` behoudt de vlag** — vervang (regel 354)
```ts
    const keepers = checked.filter((x) => x.keep).map((x) => x.c);
```
  door
```ts
    const keepers = checked.filter((x) => x.keep);
```

- [ ] **Step 5: `enriched` neemt vlag mee** — vervang de `enriched`-map-signatuur (regel 358)
```ts
      keepers.map(async (c) => {
```
  door
```ts
      keepers.map(async ({ c, dueFollowup }) => {
```
  en voeg in het return-object van die map (regel 371-377), ná
  `leadCreatedAt: attribution?._creationTime ?? c._creationTime,` toe:
```ts
          dueFollowup,
```

- [ ] **Step 6: post-filter vóór sort/slice** — vervang (regel 383-385)
```ts
    return enriched
      .sort((a, b) => b.leadCreatedAt - a.leadCreatedAt)
      .slice(0, limit);
```
  door
```ts
    return enriched
      .filter((e) =>
        isWithinDashboardWindow(e.leadCreatedAt, e.dueFollowup, windowCutoff),
      )
      .sort((a, b) => b.leadCreatedAt - a.leadCreatedAt)
      .slice(0, limit);
```

- [ ] **Step 7:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/contacts\.ts"` → geen nieuwe fouten. `npx vitest run` → groen. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/contacts.ts convex/_generated
git commit -m "feat(dashboard): pas instelbaar recency-venster toe in listIncomingLeads"
```

---

### Task 5: UI-veld in lead-flow-settings

**Files:** Modify `src/routes/crm.settings_.lead-flow.tsx`

- [ ] **Step 1: DEFAULTS** — in het `DEFAULTS`-object (regel 31-37), ná
  `sendEmailOnUnreachable: false,` toevoegen:
```ts
  dashboardWindowDays: 90,
```

- [ ] **Step 2: state** — ná `const [sendEmailOnUnreachable, setSendEmail] = useState(false)`
  (regel 74) toevoegen:
```ts
  const [dashboardWindowDays, setWindow] = useState(
    DEFAULTS.dashboardWindowDays,
  )
```

- [ ] **Step 3: `useEffect`** — in de `useEffect([settings])` (regel 77-86), ná
  `setSendEmail(settings.sendEmailOnUnreachable)` toevoegen:
```ts
      setWindow(settings.dashboardWindowDays)
```

- [ ] **Step 4: `resetToDefaults`** — ná `setSendEmail(false)` (regel 94) toevoegen:
```ts
    setWindow(DEFAULTS.dashboardWindowDays)
```

- [ ] **Step 5: `handleSave`** — in het `update({...})`-object (regel 102-110), ná
  `sendEmailOnUnreachable,` toevoegen:
```ts
        dashboardWindowDays,
```

- [ ] **Step 6: UI-veld** — in de "Drempelwaarden"-Card, ná het auto-afscheidsmail-blok
  (sluitende `</div>` op regel 202), vóór `</CardContent>` (regel 203), toevoegen:
```tsx
            <Field
              label="Dashboard-venster"
              hint="Nooit-opgevolgde leads ouder dan dit aantal dagen verdwijnen van het speed-to-lead-dashboard (ze blijven in de pipeline). Leads met een openstaande follow-up blijven altijd zichtbaar."
              value={dashboardWindowDays}
              onChange={setWindow}
              min={7}
              max={730}
              suffix="dagen"
            />
```

- [ ] **Step 7:** `npm run build` → `✓ built`. `npx tsc --noEmit 2>&1 | grep -E "lead-flow\.tsx"` → geen nieuwe fouten. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add src/routes/crm.settings_.lead-flow.tsx
git commit -m "feat(dashboard): 'Dashboard-venster (dagen)'-veld in lead-flow-settings"
```

---

### Task 6: Eindverificatie + dev-smoke

- [ ] **Step 1: Build-gates**
```bash
cd /home/marvin/Projecten/leadflowv2
npx vitest run            # groen, incl. dashboardWindow.test.ts
npx convex dev --once     # schoon
npm run build             # ✓ built
npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/(contacts|crmSettings|dashboardWindow)\.ts|lead-flow\.tsx" || echo "geen nieuwe fouten in changed files"
```

- [ ] **Step 2: Dev-smoke (browser, tab dev)** — `/crm/settings/lead-flow`:
  1. Noteer een lead die nú op `/crm` (dashboard) staat en duidelijk oud is (lead-datum > paar dagen geleden) en GEEN due follow-up heeft (een "Nieuw"-opp-lead).
  2. Zet "Dashboard-venster" op `7` → Opslaan. Ga naar `/crm` → die oude Nieuw-lead is **weg** van het bord. Een lead met een verlopen/due follow-up (badge/sortering) blijft staan.
  3. Zet venster terug op `90` → Opslaan → `/crm` → de oude lead komt terug.
  (Dev = kopie van prod; deze smoke verstuurt geen e-mail/SMS — puur lees/filter.)

- [ ] **Step 3: Branch pushen + rapporteren (normale merge-route na go):**
```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin feat/dashboard-window
```

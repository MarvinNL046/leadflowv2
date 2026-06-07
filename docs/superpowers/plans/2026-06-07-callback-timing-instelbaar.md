# Callback-timing instelbaar — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans. Steps gebruiken checkbox-syntax (`- [ ]`).

**Goal:** Callback-knoppen (`PRESETS`) + de 7-dagen safety-net instelbaar maken per workspace onder `/crm/settings/lead-flow`.

**Architecture:** Additieve `crmSettings`-velden + pure helper (validatie/default, unit-getest) + UI: lead-dialog leest presets uit settings, settings-pagina krijgt een lijst-editor. Defaults = huidig gedrag.

**Tech Stack:** Convex + TanStack Start + shadcn/ui + vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-callback-timing-instelbaar-design.md`

**Laag-risico (geen cron). Normale merge-route na Marvins go.**

---

### Task 0: Branch
```bash
cd /home/marvin/Projecten/leadflowv2
git checkout main && git pull --ff-only origin main
git checkout -b feat/callback-timing-settings
```

---

### Task 1: Pure helper `crmSettingsLogic.ts` (TDD)

**Files:** create `convex/crmSettingsLogic.test.ts`, `convex/crmSettingsLogic.ts`

- [ ] **Step 1: Falende test** — `convex/crmSettingsLogic.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateCallbackPresets } from "./crmSettingsLogic";

describe("validateCallbackPresets", () => {
  it("geldige lijst → null", () => {
    expect(
      validateCallbackPresets([
        { days: 1, label: "Morgen" },
        { days: 7, label: "Week" },
      ]),
    ).toBeNull();
  });
  it("lege lijst → null (UI valt terug op default)", () => {
    expect(validateCallbackPresets([])).toBeNull();
  });
  it(">8 items → fout", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      days: i + 1,
      label: "x",
    }));
    expect(validateCallbackPresets(many)).toMatch(/8/);
  });
  it("days 0 of >365 → fout", () => {
    expect(validateCallbackPresets([{ days: 0, label: "x" }])).not.toBeNull();
    expect(validateCallbackPresets([{ days: 400, label: "x" }])).not.toBeNull();
  });
  it("niet-geheel days → fout", () => {
    expect(validateCallbackPresets([{ days: 1.5, label: "x" }])).not.toBeNull();
  });
  it("leeg label → fout", () => {
    expect(validateCallbackPresets([{ days: 1, label: "  " }])).not.toBeNull();
  });
  it("dubbele days → fout", () => {
    expect(
      validateCallbackPresets([
        { days: 3, label: "a" },
        { days: 3, label: "b" },
      ]),
    ).toMatch(/3/);
  });
});
```

- [ ] **Step 2:** Run → FAIL: `npx vitest run convex/crmSettingsLogic.test.ts`

- [ ] **Step 3: Implementeer** — `convex/crmSettingsLogic.ts`:
```ts
/** Pure helpers voor crmSettings — geen Convex-context → unit-testbaar. */

export const DEFAULT_CALLBACK_PRESETS: Array<{ days: number; label: string }> = [
  { days: 1, label: "Morgen" },
  { days: 3, label: "Over 3 dagen" },
  { days: 7, label: "Over een week" },
  { days: 14, label: "Over 2 weken" },
  { days: 30, label: "Over een maand" },
];

/** Returnt een foutmelding of null als de lijst geldig is. Lege lijst = OK. */
export function validateCallbackPresets(
  presets: Array<{ days: number; label: string }>,
): string | null {
  if (presets.length > 8) return "Maximaal 8 terugbel-knoppen";
  const seen = new Set<number>();
  for (const p of presets) {
    if (!Number.isInteger(p.days) || p.days < 1 || p.days > 365) {
      return "Dagen moet een geheel getal tussen 1 en 365 zijn";
    }
    if (seen.has(p.days)) return `Dubbele waarde: ${p.days} dagen`;
    seen.add(p.days);
    const label = p.label.trim();
    if (label.length < 1 || label.length > 40) {
      return "Label moet tussen 1 en 40 tekens zijn";
    }
  }
  return null;
}
```

- [ ] **Step 4:** Run → PASS (7 tests).

- [ ] **Step 5:** Commit:
```bash
git add convex/crmSettingsLogic.ts convex/crmSettingsLogic.test.ts
git commit -m "feat(settings): validateCallbackPresets + DEFAULT_CALLBACK_PRESETS helper"
```

---

### Task 2: Schema

**Files:** `convex/schema.ts`

- [ ] **Step 1:** In `crmSettings: defineTable({ ... })`, voeg ná `followUpReminderDays: v.optional(v.number()),` toe:
```ts
    callbackPresets: v.optional(
      v.array(v.object({ days: v.number(), label: v.string() })),
    ),
    customerCallbackDays: v.optional(v.number()),
```

- [ ] **Step 2:** `npx convex dev --once` → schoon.

- [ ] **Step 3:** Commit:
```bash
git add convex/schema.ts
git commit -m "feat(settings): crmSettings callbackPresets + customerCallbackDays velden"
```

---

### Task 3: Backend `crmSettings.ts`

**Files:** `convex/crmSettings.ts`

- [ ] **Step 1: Import + DEFAULT_SETTINGS**

Voeg import toe (ná regel 9, de dataModel-import):
```ts
import {
  DEFAULT_CALLBACK_PRESETS,
  validateCallbackPresets,
} from "./crmSettingsLogic";
```

In `DEFAULT_SETTINGS`, voeg ná `followUpReminderDays: 2,` toe:
```ts
  customerCallbackDays: 7,
```

- [ ] **Step 2: `get`-return uitbreiden**

In de `get`-handler, ná `timezone: settings?.timezone ?? DEFAULT_SETTINGS.timezone,`:
```ts
      callbackPresets:
        settings?.callbackPresets && settings.callbackPresets.length > 0
          ? settings.callbackPresets
          : DEFAULT_CALLBACK_PRESETS,
      customerCallbackDays:
        settings?.customerCallbackDays ?? DEFAULT_SETTINGS.customerCallbackDays,
```

- [ ] **Step 3: `update` args + validatie + patch**

In `update.args`, ná `followUpReminderDays: v.optional(v.number()),`:
```ts
    callbackPresets: v.optional(
      v.array(v.object({ days: v.number(), label: v.string() })),
    ),
    customerCallbackDays: v.optional(v.number()),
```

In de handler, ná de bestaande `followUpReminderDays`-validatie (ná regel ~104):
```ts
    if (args.callbackPresets !== undefined) {
      const err = validateCallbackPresets(args.callbackPresets);
      if (err) throw new Error(err);
    }
    if (
      args.customerCallbackDays !== undefined &&
      (args.customerCallbackDays < 1 || args.customerCallbackDays > 60)
    ) {
      throw new Error("Safety-net dagen moet tussen 1 en 60 zijn");
    }
```

In het patch-blok, ná `patch.followUpReminderDays = args.followUpReminderDays;`:
```ts
    if (args.callbackPresets !== undefined)
      patch.callbackPresets = args.callbackPresets;
    if (args.customerCallbackDays !== undefined)
      patch.customerCallbackDays = args.customerCallbackDays;
```

- [ ] **Step 4: `getEffectiveSettings` + customerCallbackDays**

In de return-type van `getEffectiveSettings`, ná `followUpReminderDays: number;`:
```ts
  customerCallbackDays: number;
```
En in de return-value, ná de `followUpReminderDays`-regel:
```ts
    customerCallbackDays:
      settings?.customerCallbackDays ?? DEFAULT_SETTINGS.customerCallbackDays,
```

- [ ] **Step 5:** `npx convex dev --once` → schoon. Commit:
```bash
git add convex/crmSettings.ts
git commit -m "feat(settings): callbackPresets + customerCallbackDays in get/update/effective"
```

---

### Task 4: `recordCallAnswered` leest customerCallbackDays

**Files:** `convex/contacts.ts`

- [ ] **Step 1:** In `recordCallAnswered`, ná `const { contact, userId } = await requireMembershipForContact(ctx, args.contactId,);` voeg toe:
```ts
    const settings = await getEffectiveSettings(ctx, contact.workspaceId);
```

- [ ] **Step 2:** Vervang BEIDE voorkomens van `Date.now() + 7 * 24 * 60 * 60 * 1000` in `recordCallAnswered` door:
```ts
Date.now() + settings.customerCallbackDays * 24 * 60 * 60 * 1000
```
(De string `7 * 24 * 60 * 60 * 1000` komt alléén in deze 2 regels voor — `recordCallNoAnswer` gebruikt `settings.defaultFollowUpDays`.)

- [ ] **Step 3:** `npx convex dev --once` → schoon. Commit:
```bash
git add convex/contacts.ts
git commit -m "feat(settings): recordCallAnswered safety-net uit customerCallbackDays"
```

---

### Task 5: Frontend

**Files:** `src/components/crm/lead-dialog/views/callback-options.tsx`, `src/components/crm/lead-dialog/index.tsx`, `src/routes/crm.settings_.lead-flow.tsx`

- [ ] **Step 1: `callback-options.tsx` — presets-prop**

Vervang de `Props`-interface + de map-bron:
```ts
interface Props {
  processing: string | null
  presets: Array<{ days: number; label: string }>
  onPick: (days: number) => void
}

const FALLBACK_PRESETS = [
  { days: 1, label: 'Morgen' },
  { days: 3, label: 'Over 3 dagen' },
  { days: 7, label: 'Over een week' },
  { days: 14, label: 'Over 2 weken' },
  { days: 30, label: 'Over een maand' },
]

export function CallbackOptionsView({ processing, presets, onPick }: Props) {
  const items = presets.length > 0 ? presets : FALLBACK_PRESETS
```
en wijzig `{PRESETS.map((p) => (` naar `{items.map((p) => (`. (De oude `const PRESETS = [...]` verwijderen.)

- [ ] **Step 2: `lead-dialog/index.tsx` — query + presets doorgeven**

Voeg een query toe bij de andere hooks (ná de `workspaceId`-regel ~53):
```ts
  const callbackSettings = useQuery(
    api.crmSettings.get,
    workspaceId ? { workspaceId } : 'skip',
  )
```
In de `<CallbackOptionsView ... />`-aanroep, voeg ná `processing={processing}` toe:
```tsx
            presets={callbackSettings?.callbackPresets ?? []}
```

- [ ] **Step 3: `crm.settings_.lead-flow.tsx` — Field + lijst-editor**

(a) `DEFAULTS` + `customerCallbackDays: 7,`.

(b) State (ná `followUpReminderDays`-state):
```ts
  const [customerCallbackDays, setSafetyNet] = useState(7)
  const [callbackPresets, setPresets] = useState<
    Array<{ days: number; label: string }>
  >([])
```

(c) In de `useEffect(... [settings])`, ná de bestaande setters:
```ts
      setSafetyNet(settings.customerCallbackDays)
      setPresets(settings.callbackPresets)
```

(d) `resetToDefaults`: voeg toe `setSafetyNet(7)` + `setPresets([])` (leeg = default in backend).

(e) In `handleSave`'s `update({...})`, voeg toe: `customerCallbackDays,` en `callbackPresets,`.

(f) In de JSX, ná de `</Card>` met "Drempelwaarden", voeg een tweede Card toe:
```tsx
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Terugbel-knoppen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-zinc-500">
              De knoppen die verschijnen bij "Bel → opgenomen → bel later".
              Leeg = standaardlijst.
            </p>
            <div className="space-y-2">
              {callbackPresets.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={p.days}
                    onChange={(e) =>
                      setPresets((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? { ...x, days: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-zinc-500">dagen</span>
                  <Input
                    value={p.label}
                    maxLength={40}
                    placeholder="Label (bv. Over een week)"
                    onChange={(e) =>
                      setPresets((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPresets((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="text-zinc-400 hover:text-red-600"
                    aria-label="Knop verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {callbackPresets.length < 8 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPresets((prev) => [...prev, { days: 7, label: '' }])
                }
              >
                <Plus className="h-4 w-4" />
                Knop toevoegen
              </Button>
            )}
            <Field
              label="Safety-net 'klant belt zelf terug' (dagen)"
              hint="Als een klant zegt zelf terug te bellen, wordt na N dagen toch een follow-up ingepland zodat de lead niet verdwijnt."
              value={customerCallbackDays}
              onChange={setSafetyNet}
              min={1}
              max={60}
              suffix="dagen"
            />
          </CardContent>
        </Card>
```

(g) Voeg `Plus, Trash2` toe aan de lucide-import (regel 5: `import { ArrowLeft, Save, RotateCcw, Route as RouteIcon } from 'lucide-react'`).

- [ ] **Step 4: Build + typecheck**

Run: `npm run build` → `✓ built`.
Run: `npx tsc --noEmit 2>&1 | grep -E "(^|/)src/routes/crm\.settings_\.lead-flow\.tsx|(^|/)src/components/crm/lead-dialog/(index|views/callback-options)\.tsx|(^|/)convex/crmSettings\.ts|(^|/)convex/contacts\.ts|(^|/)convex/crmSettingsLogic\.ts"` → geen output.

- [ ] **Step 5:** Commit:
```bash
git add src/components/crm/lead-dialog/views/callback-options.tsx src/components/crm/lead-dialog/index.tsx src/routes/crm.settings_.lead-flow.tsx
git commit -m "feat(settings): callback-presets-editor + safety-net + lead-dialog leest presets"
```

---

### Task 6: Eindverificatie

- [ ] **Step 1:** `npx vitest run` (groen, incl. validateCallbackPresets) · `npx convex dev --once` (schoon) · `npm run build` (`✓ built`).

- [ ] **Step 2: Dev-smoke (browser)**
  - `/crm/settings/lead-flow`: wijzig een callback-knop-label + voeg een knop toe + wijzig safety-net-dagen → Opslaan → toast "opgeslagen".
  - Validatie: zet twee knoppen op dezelfde dagen of days=0 → Opslaan → foutmelding-toast.
  - Open een lead → "Bel" → (markeer opgenomen) → "bel later" → de **nieuwe** callback-knoppen verschijnen.

- [ ] **Step 3:** Branch pushen + rapporteren (normale merge-route na Marvins go):
```bash
git push -u origin feat/callback-timing-settings
```

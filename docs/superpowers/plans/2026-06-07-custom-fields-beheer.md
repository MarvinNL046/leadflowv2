# Custom-fields beheer (handmatige velden) — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans. Steps = checkbox-syntax.

**Goal:** Handmatige custom-fields definiëren (settings) + waardes bewerken (contact-detail), schoon gescheiden van de read-only Meta-form-antwoorden via een `isManual`-vlag.

**Architecture:** `isManual`-vlag op definitions; pure helpers (slugifyKey/validateDefinition, getest); 6 nieuwe Convex-fns; settings-CRUD-pagina + bewerkbare contact-sectie. Defaults = bestaand gedrag.

**Spec:** `docs/superpowers/specs/2026-06-07-custom-fields-beheer-design.md`

**Laag-risico (additief, geen cron/triggers). Normale merge-route na Marvins go.**

---

### Task 0: Branch
```bash
cd /home/marvin/Projecten/leadflowv2
git checkout main && git pull --ff-only origin main
git checkout -b feat/custom-fields-beheer
```

---

### Task 1: Pure helpers (TDD)

**Files:** create `convex/customFieldsLogic.test.ts`, `convex/customFieldsLogic.ts`

- [ ] **Step 1: Falende test** — `convex/customFieldsLogic.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { slugifyKey, validateDefinition } from "./customFieldsLogic";

describe("slugifyKey", () => {
  it("normaliseert naar snake_case", () => {
    expect(slugifyKey("Type woning")).toBe("type_woning");
    expect(slugifyKey("Budget (€)")).toBe("budget");
    expect(slugifyKey("  Meerdere   spaties ")).toBe("meerdere_spaties");
  });
  it("strip diacrieten", () => {
    expect(slugifyKey("José veld")).toBe("jose_veld");
  });
});

describe("validateDefinition", () => {
  it("geldig text-veld → null", () => {
    expect(validateDefinition({ label: "Type woning", fieldType: "text" })).toBeNull();
  });
  it("leeg label → fout", () => {
    expect(validateDefinition({ label: "  ", fieldType: "text" })).not.toBeNull();
  });
  it("select zonder opties → fout", () => {
    expect(validateDefinition({ label: "X", fieldType: "select", selectOptions: [] })).not.toBeNull();
  });
  it("select met opties → null", () => {
    expect(validateDefinition({ label: "X", fieldType: "select", selectOptions: ["a", "b"] })).toBeNull();
  });
});
```

- [ ] **Step 2:** Run → FAIL: `npx vitest run convex/customFieldsLogic.test.ts`

- [ ] **Step 3: Implementeer** — `convex/customFieldsLogic.ts`:
```ts
/** Pure helpers voor custom-fields — geen Convex-context → unit-testbaar. */

export function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function validateDefinition(d: {
  label: string;
  fieldType: string;
  selectOptions?: string[];
}): string | null {
  const label = d.label.trim();
  if (label.length < 1 || label.length > 40) {
    return "Label moet tussen 1 en 40 tekens zijn";
  }
  if (d.fieldType === "select") {
    const opts = (d.selectOptions ?? []).map((o) => o.trim()).filter(Boolean);
    if (opts.length < 1) return "Een keuzelijst heeft minstens 1 optie nodig";
  }
  return null;
}
```

- [ ] **Step 4:** Run → PASS. Commit:
```bash
git add convex/customFieldsLogic.ts convex/customFieldsLogic.test.ts
git commit -m "feat(custom-fields): slugifyKey + validateDefinition helpers + tests"
```

---

### Task 2: Schema — `isManual`

**Files:** `convex/schema.ts`

- [ ] **Step 1:** In `customFieldDefinitions`, voeg ná `sortOrder: v.number(),` toe:
```ts
    /** true = handmatig veld (settings-CRUD); leeg/false = Meta-form-veld. */
    isManual: v.optional(v.boolean()),
```

- [ ] **Step 2:** `npx convex dev --once` → schoon. Commit:
```bash
git add convex/schema.ts
git commit -m "feat(custom-fields): customFieldDefinitions.isManual veld"
```

---

### Task 3: Backend — mutations + queries

**Files:** `convex/customFields.ts`

- [ ] **Step 1: Imports + membership-verbreding**

Vervang regel 3:
```ts
import { query, type QueryCtx } from "./_generated/server";
```
door:
```ts
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { slugifyKey, validateDefinition } from "./customFieldsLogic";
```
En verbreed de helper-signatuur:
```ts
async function requireWorkspaceMembership(
  ctx: QueryCtx,
```
→
```ts
async function requireWorkspaceMembership(
  ctx: QueryCtx | MutationCtx,
```

- [ ] **Step 2: `listForContact` → Meta-only**

In `listForContact`, vervang:
```ts
    return defs
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({ definition: d, value: valueByDef.get(d._id) ?? null }));
```
door:
```ts
    return defs
      .filter((d) => d.isManual !== true)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({ definition: d, value: valueByDef.get(d._id) ?? null }));
```

- [ ] **Step 3: Nieuwe fns** — voeg onderaan `convex/customFields.ts` toe:
```ts
export const listManualDefinitions = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const defs = await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_workspace_entity", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("entityType", "contact"),
      )
      .collect();
    return defs
      .filter((d) => d.isManual === true)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const listManualForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await requireWorkspaceMembership(ctx, contact.workspaceId);
    const defs = (
      await ctx.db
        .query("customFieldDefinitions")
        .withIndex("by_workspace_entity", (q) =>
          q.eq("workspaceId", contact.workspaceId).eq("entityType", "contact"),
        )
        .collect()
    ).filter((d) => d.isManual === true);
    const values = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "contact").eq("entityId", args.contactId),
      )
      .collect();
    const byDef = new Map(values.map((v) => [v.definitionId, v.value]));
    return defs
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({ definition: d, value: byDef.get(d._id) ?? null }));
  },
});

export const createDefinition = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    label: v.string(),
    fieldType: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("boolean"),
      v.literal("date"),
      v.literal("select"),
    ),
    selectOptions: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const err = validateDefinition({
      label: args.label,
      fieldType: args.fieldType,
      selectOptions: args.selectOptions,
    });
    if (err) throw new Error(err);
    const key = slugifyKey(args.label);
    if (!key) throw new Error("Ongeldige veldnaam");
    const existing = await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_workspace_entity", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("entityType", "contact"),
      )
      .collect();
    if (existing.some((d) => d.key === key)) {
      throw new Error("Een veld met deze naam bestaat al");
    }
    const maxOrder = existing.reduce((m, d) => Math.max(m, d.sortOrder), 0);
    await ctx.db.insert("customFieldDefinitions", {
      workspaceId: args.workspaceId,
      entityType: "contact",
      key,
      label: args.label.trim(),
      fieldType: args.fieldType,
      selectOptions:
        args.fieldType === "select" ? (args.selectOptions ?? []) : undefined,
      isRequired: args.isRequired ?? false,
      sortOrder: maxOrder + 1,
      isManual: true,
    });
    return null;
  },
});

export const updateDefinition = mutation({
  args: {
    definitionId: v.id("customFieldDefinitions"),
    label: v.optional(v.string()),
    selectOptions: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const def = await ctx.db.get(args.definitionId);
    if (!def) throw new Error("Veld niet gevonden");
    await requireWorkspaceMembership(ctx, def.workspaceId);
    const patch: Record<string, unknown> = {};
    if (args.label !== undefined) {
      const err = validateDefinition({
        label: args.label,
        fieldType: def.fieldType,
        selectOptions: args.selectOptions ?? def.selectOptions,
      });
      if (err) throw new Error(err);
      patch.label = args.label.trim();
    }
    if (args.selectOptions !== undefined && def.fieldType === "select") {
      const opts = args.selectOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 1) {
        throw new Error("Een keuzelijst heeft minstens 1 optie nodig");
      }
    }
    if (args.selectOptions !== undefined) patch.selectOptions = args.selectOptions;
    if (args.isRequired !== undefined) patch.isRequired = args.isRequired;
    await ctx.db.patch(args.definitionId, patch);
    return null;
  },
});

export const deleteDefinition = mutation({
  args: { definitionId: v.id("customFieldDefinitions") },
  handler: async (ctx, args) => {
    const def = await ctx.db.get(args.definitionId);
    if (!def) throw new Error("Veld niet gevonden");
    await requireWorkspaceMembership(ctx, def.workspaceId);
    const vals = await ctx.db
      .query("customFieldValues")
      .withIndex("by_definition", (q) =>
        q.eq("definitionId", args.definitionId),
      )
      .collect();
    for (const val of vals) await ctx.db.delete(val._id);
    await ctx.db.delete(args.definitionId);
    return null;
  },
});

export const setContactValue = mutation({
  args: {
    contactId: v.id("contacts"),
    definitionId: v.id("customFieldDefinitions"),
    value: v.any(),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact niet gevonden");
    await requireWorkspaceMembership(ctx, contact.workspaceId);
    const def = await ctx.db.get(args.definitionId);
    if (!def || def.workspaceId !== contact.workspaceId) {
      throw new Error("Veld niet gevonden");
    }
    const existing = await ctx.db
      .query("customFieldValues")
      .withIndex("by_definition", (q) =>
        q.eq("definitionId", args.definitionId),
      )
      .filter((q) => q.eq(q.field("entityId"), args.contactId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("customFieldValues", {
        definitionId: args.definitionId,
        entityType: "contact",
        entityId: args.contactId,
        value: args.value,
      });
    }
    return null;
  },
});
```

- [ ] **Step 4:** `npx convex dev --once` → schoon. Commit:
```bash
git add convex/customFields.ts
git commit -m "feat(custom-fields): definition-CRUD + setContactValue + Meta/manual-split"
```

---

### Task 4: Settings-pagina `/crm/settings/custom-fields`

**Files:** create `src/routes/crm.settings_.custom-fields.tsx`; modify `src/routes/crm.settings.tsx`

- [ ] **Step 1:** Maak `src/routes/crm.settings_.custom-fields.tsx`:
```tsx
import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Tags } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/settings_/custom-fields')({
  component: CustomFieldsPage,
})

const TYPES = [
  { value: 'text', label: 'Tekst' },
  { value: 'number', label: 'Getal' },
  { value: 'boolean', label: 'Ja/Nee' },
  { value: 'date', label: 'Datum' },
  { value: 'select', label: 'Keuzelijst' },
] as const

function CustomFieldsPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id as Id<'workspaces'> | undefined
  if (tenants === undefined) return <Skeleton className="h-64 w-full" />
  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-amber-700">Geen workspace gekoppeld.</p>
        </CardContent>
      </Card>
    )
  }
  return <CustomFieldsForm workspaceId={workspaceId} />
}

function CustomFieldsForm({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const defs = useQuery(api.customFields.listManualDefinitions, { workspaceId })
  const create = useMutation(api.customFields.createDefinition)
  const remove = useMutation(api.customFields.deleteDefinition)

  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<string>('text')
  const [options, setOptions] = useState('')
  const [required, setRequired] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (saving) return
    setSaving(true)
    try {
      await create({
        workspaceId,
        label,
        fieldType: fieldType as 'text' | 'number' | 'boolean' | 'date' | 'select',
        selectOptions:
          fieldType === 'select'
            ? options.split(',').map((o) => o.trim()).filter(Boolean)
            : undefined,
        isRequired: required,
      })
      toast.success('Veld toegevoegd')
      setLabel('')
      setOptions('')
      setRequired(false)
      setFieldType('text')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Toevoegen mislukt'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/crm/settings"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar instellingen
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900">Custom velden</h1>
        <p className="text-xs text-zinc-500">
          Eigen velden voor contacten (los van de Meta-form-antwoorden).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nieuw veld</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Naam</Label>
              <Input
                value={label}
                maxLength={40}
                placeholder="bv. Type woning"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {fieldType === 'select' && (
            <div className="space-y-1.5">
              <Label>Opties (komma-gescheiden)</Label>
              <Input
                value={options}
                placeholder="bv. Vrijstaand, Hoekwoning, Appartement"
                onChange={(e) => setOptions(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRequired((v) => !v)}
              className={
                required
                  ? 'rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700'
                  : 'rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50'
              }
            >
              Verplicht
            </button>
            <Button type="button" onClick={handleCreate} disabled={saving || !label.trim()}>
              <Plus className="h-4 w-4" />
              Toevoegen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bestaande velden</CardTitle>
        </CardHeader>
        <CardContent>
          {defs === undefined ? (
            <Skeleton className="h-12 w-full" />
          ) : defs.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              Nog geen eigen velden.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {defs.map((d) => (
                <li key={d._id} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 text-sm font-medium text-zinc-800">
                    {d.label}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {TYPES.find((t) => t.value === d.fieldType)?.label ??
                      d.fieldType}
                  </Badge>
                  {d.isRequired && (
                    <Badge variant="outline" className="text-xs text-blue-600">
                      verplicht
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-zinc-400 hover:text-red-600"
                    aria-label="Veld verwijderen"
                    onClick={async () => {
                      try {
                        await remove({ definitionId: d._id })
                        toast.success('Veld verwijderd')
                      } catch (err) {
                        toast.error(humanizeConvexError(err, 'Verwijderen mislukt'))
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Settings-index kaart** — in `src/routes/crm.settings.tsx`, voeg ná het `ai-agent`-item (in de eerste sectie `items`-array) toe:
```ts
      {
        to: '/crm/settings/custom-fields',
        title: 'Custom velden',
        description: 'Eigen velden voor contacten definiëren (los van Meta-form-antwoorden)',
        icon: Tags,
        iconColor: 'bg-amber-100 text-amber-700',
      },
```
en voeg `Tags` toe aan de lucide-import bovenin `crm.settings.tsx`.

- [ ] **Step 3:** `npm run build` → `✓ built`; `npx tsc --noEmit 2>&1 | grep -E "custom-fields|crm\.settings\.tsx"` → geen nieuwe fouten. Commit:
```bash
git add src/routes/crm.settings_.custom-fields.tsx src/routes/crm.settings.tsx src/routeTree.gen.ts
git commit -m "feat(custom-fields): settings-pagina (def-CRUD) + settings-index-kaart"
```

---

### Task 5: Bewerkbare contact-sectie

**Files:** `src/routes/crm.contacts_.$id.tsx`

- [ ] **Step 1:** Voeg `<ManualFieldsSection contactId={id as Id<'contacts'>} />` toe direct ná de bestaande `<CustomFieldsSection contactId={...} />` (regel ~271).

- [ ] **Step 2:** Voeg de componenten toe (ná de bestaande `CustomFieldsSection`-functie). Zorg dat `useMutation` (uit 'convex/react'), `Input`, `Select`-set, `Button` geïmporteerd zijn bovenin (toevoegen indien afwezig):
```tsx
function ManualFieldsSection({ contactId }: { contactId: Id<'contacts'> }) {
  const fields = useQuery(api.customFields.listManualForContact, { contactId })
  const setValue = useMutation(api.customFields.setContactValue)
  if (fields === undefined || fields.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Eigen velden</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map(({ definition, value }) => (
          <ManualFieldRow
            key={definition._id}
            definition={definition}
            value={value}
            onSave={async (val) => {
              try {
                await setValue({
                  contactId,
                  definitionId: definition._id,
                  value: val,
                })
                toast.success('Opgeslagen')
              } catch (err) {
                toast.error(humanizeConvexError(err, 'Opslaan mislukt'))
              }
            }}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function ManualFieldRow({
  definition,
  value,
  onSave,
}: {
  definition: {
    _id: Id<'customFieldDefinitions'>
    label: string
    fieldType: string
    selectOptions?: string[]
  }
  value: unknown
  onSave: (val: unknown) => Promise<void>
}) {
  const [text, setText] = useState(
    value === null || value === undefined ? '' : String(value),
  )
  const original =
    value === null || value === undefined ? '' : String(value)

  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-zinc-500">
        {definition.label}
      </Label>
      {definition.fieldType === 'boolean' ? (
        <button
          type="button"
          onClick={() => onSave(value === true ? false : true)}
          className={
            value === true
              ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700'
              : 'rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50'
          }
        >
          {value === true ? 'Ja' : 'Nee'}
        </button>
      ) : definition.fieldType === 'select' ? (
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onSave(v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Kies…" />
          </SelectTrigger>
          <SelectContent>
            {(definition.selectOptions ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={
            definition.fieldType === 'number'
              ? 'number'
              : definition.fieldType === 'date'
                ? 'date'
                : 'text'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text === original) return
            const out =
              definition.fieldType === 'number'
                ? text === ''
                  ? null
                  : Number(text)
                : text
            void onSave(out)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Imports** — controleer/voeg toe bovenin `crm.contacts_.$id.tsx`: `useMutation` (uit 'convex/react'), `useState` (uit 'react'), `Input` (`#/components/ui/input.tsx`), `Select`-set (`#/components/ui/select.tsx`), `Button`, `Label`. (Veel zijn er waarschijnlijk al — alleen ontbrekende toevoegen.)

- [ ] **Step 4:** `npm run build` → `✓ built`; `npx tsc --noEmit 2>&1 | grep -E "crm\.contacts_\.\\\$id\.tsx"` → geen nieuwe fouten. Commit:
```bash
git add src/routes/crm.contacts_.$id.tsx
git commit -m "feat(custom-fields): bewerkbare 'Eigen velden'-sectie op contact-detail"
```

---

### Task 6: Eindverificatie

- [ ] **Step 1:** `npx vitest run` (groen, incl. customFieldsLogic) · `npx convex dev --once` (schoon) · `npm run build` (`✓ built`).

- [ ] **Step 2: Dev-smoke (browser)**
  - `/crm/settings/custom-fields`: maak "Type woning" (Keuzelijst, opties "Vrijstaand, Hoekwoning, Appartement") + "Notitie" (Tekst) → verschijnen in "Bestaande velden".
  - Open een contact → "Eigen velden"-sectie → kies een optie + typ notitie → herlaad → waardes blijven. "Form-antwoorden" (Meta) blijft ongewijzigd/read-only.
  - Dubbele veldnaam aanmaken → fout-toast. Veld verwijderen → weg.

- [ ] **Step 3:** Branch pushen + rapporteren (normale merge-route na go):
```bash
git push -u origin feat/custom-fields-beheer
```

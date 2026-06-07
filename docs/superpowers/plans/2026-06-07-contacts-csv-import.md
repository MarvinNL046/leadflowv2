# Contacts CSV-import — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans. Steps gebruiken checkbox-syntax (`- [ ]`).

**Goal:** Bulk contacten importeren uit CSV met kolom-mapping + dedup. Alleen contacten (geen opps/triggers).

**Architecture:** Pure `parseCsv` (unit-getest) client-side → kolom-mapping-UI → `importContacts`-mutation (dedup DB+batch, leadAttribution source "manual", GEEN trigger), client batcht per 100.

**Tech Stack:** Convex + TanStack Start + shadcn/ui + vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-contacts-csv-import-design.md`

**Laag-risico (additief, geen cron, geen triggers). Normale merge-route na Marvins go.**

---

### Task 0: Branch
```bash
cd /home/marvin/Projecten/leadflowv2
git checkout main && git pull --ff-only origin main
git checkout -b feat/contacts-csv-import
```

---

### Task 1: `parseCsv` (TDD)

**Files:** create `src/lib/csv.test.ts`, `src/lib/csv.ts`

- [ ] **Step 1: Falende test** — `src/lib/csv.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('simpele rijen', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })
  it('aangehaald veld met komma', () => {
    expect(parseCsv('"a,b",c')).toEqual([['a,b', 'c']])
  })
  it('escaped quote ("")', () => {
    expect(parseCsv('"a""b",c')).toEqual([['a"b', 'c']])
  })
  it('CRLF', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('embedded newline in quotes', () => {
    expect(parseCsv('"a\nb",c')).toEqual([['a\nb', 'c']])
  })
  it('lege regels overslaan', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})
```

- [ ] **Step 2:** Run → FAIL: `npx vitest run src/lib/csv.test.ts`

- [ ] **Step 3: Implementeer** — `src/lib/csv.ts`:
```ts
/** Parse CSV-tekst → rijen van cellen. State-machine: dubbele quotes,
 *  embedded komma's/newlines, escaped quotes (""), \n of \r\n. Volledig lege
 *  rijen worden weggefilterd. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}
```

- [ ] **Step 4:** Run → PASS (6 tests).

- [ ] **Step 5:** Commit:
```bash
git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "feat(contacts): parseCsv helper + unit tests"
```

---

### Task 2: `importContacts` mutation

**Files:** `convex/contacts.ts` (nieuwe mutation, ná `create`)

- [ ] **Step 1:** Voeg toe ná de `create`-mutation:
```ts
/**
 * Bulk-import van contacten (CSV). Dedup tegen DB + binnen de batch (email→
 * phone). Elk nieuw contact krijgt leadAttribution source "manual". GEEN
 * opportunity, GEEN triggerContactCreated — bulk-import mag de speed-to-lead-
 * workflow/AI NIET massaal afvuren. Client batcht per 100; max 500/call.
 */
export const importContacts = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    contacts: v.array(
      v.object({
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        company: v.optional(v.string()),
        city: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    if (args.contacts.length > 500) {
      throw new Error("Maximaal 500 contacten per batch");
    }

    let imported = 0;
    let skipped = 0;
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();

    for (const c of args.contacts) {
      const hasIdentifier = [c.firstName, c.lastName, c.email, c.phone].some(
        (v) => typeof v === "string" && v.trim().length > 0,
      );
      if (!hasIdentifier) {
        skipped++;
        continue;
      }
      const normalizedEmail = normalizeEmail(c.email);
      const normalizedPhone = normalizePhone(c.phone);

      if (normalizedEmail && seenEmail.has(normalizedEmail)) {
        skipped++;
        continue;
      }
      if (normalizedPhone && seenPhone.has(normalizedPhone)) {
        skipped++;
        continue;
      }

      let dup = false;
      if (normalizedEmail) {
        const e = await ctx.db
          .query("contacts")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("email", normalizedEmail),
          )
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .first();
        if (e) dup = true;
      }
      if (!dup && normalizedPhone) {
        const p = await ctx.db
          .query("contacts")
          .withIndex("by_workspace_phone", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("phone", normalizedPhone),
          )
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .first();
        if (p) dup = true;
      }
      if (dup) {
        skipped++;
        continue;
      }

      if (normalizedEmail) seenEmail.add(normalizedEmail);
      if (normalizedPhone) seenPhone.add(normalizedPhone);

      const contactId = await ctx.db.insert("contacts", {
        workspaceId: args.workspaceId,
        firstName: c.firstName?.trim() || undefined,
        lastName: c.lastName?.trim() || undefined,
        email: normalizedEmail,
        phone: normalizedPhone,
        company: c.company?.trim() || undefined,
        city: c.city?.trim() || undefined,
        callCount: 0,
      });
      await ctx.db.insert("leadAttribution", {
        contactId,
        workspaceId: args.workspaceId,
        source: "manual",
      });
      imported++;
    }

    return { imported, skipped };
  },
});
```

- [ ] **Step 2:** `npx convex dev --once` → schoon. Commit:
```bash
git add convex/contacts.ts
git commit -m "feat(contacts): importContacts bulk-mutation (dedup, source manual, geen triggers)"
```

---

### Task 3: Import-pagina

**Files:** create `src/routes/crm.contacts_.import.tsx`

- [ ] **Step 1:** Maak `src/routes/crm.contacts_.import.tsx`:
```tsx
import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft, Upload, CheckCircle2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { parseCsv } from '#/lib/csv.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/contacts_/import')({
  component: ImportPage,
})

const FIELDS = [
  { key: 'firstName', label: 'Voornaam', syn: ['voornaam', 'firstname', 'first name', 'first', 'naam', 'name'] },
  { key: 'lastName', label: 'Achternaam', syn: ['achternaam', 'lastname', 'last name', 'last', 'surname'] },
  { key: 'email', label: 'E-mail', syn: ['email', 'e-mail', 'mail', 'emailadres'] },
  { key: 'phone', label: 'Telefoon', syn: ['phone', 'telefoon', 'tel', 'mobiel', 'gsm', 'telefoonnummer', 'number'] },
  { key: 'company', label: 'Bedrijf', syn: ['company', 'bedrijf', 'organisatie', 'organization'] },
  { key: 'city', label: 'Plaats', syn: ['city', 'plaats', 'woonplaats', 'stad', 'gemeente'] },
] as const

const NONE = '__none__'
const BATCH = 100

function autoMap(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const f of FIELDS) {
    const idx = headers.findIndex((h) =>
      f.syn.includes(h.trim().toLowerCase()),
    )
    m[f.key] = idx
  }
  return m
}

function ImportPage() {
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
  return <ImportFlow workspaceId={workspaceId} />
}

function ImportFlow({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const importContacts = useMutation(api.contacts.importContacts)
  const navigate = useNavigate()
  const [headers, setHeaders] = useState<string[] | null>(null)
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ''))
      if (rows.length < 2) {
        toast.error('CSV heeft geen data-rijen')
        return
      }
      const hdr = rows[0]
      setHeaders(hdr)
      setDataRows(rows.slice(1))
      setMapping(autoMap(hdr))
      setResult(null)
    }
    reader.readAsText(file)
  }

  function buildContacts() {
    return dataRows
      .map((r) => {
        const obj: Record<string, string> = {}
        for (const f of FIELDS) {
          const idx = mapping[f.key]
          const val = idx >= 0 ? (r[idx] ?? '').trim() : ''
          if (val) obj[f.key] = val
        }
        return obj
      })
      .filter((o) => Object.keys(o).length > 0)
  }

  async function handleImport() {
    const all = buildContacts()
    if (all.length === 0) {
      toast.error('Geen geldige rijen om te importeren')
      return
    }
    setImporting(true)
    let imported = 0
    let skipped = dataRows.length - all.length // rijen zonder enige waarde
    try {
      for (let i = 0; i < all.length; i += BATCH) {
        const batch = all.slice(i, i + BATCH)
        const res = await importContacts({ workspaceId, contacts: batch })
        imported += res.imported
        skipped += res.skipped
      }
      setResult({ imported, skipped })
      toast.success(`${imported} geïmporteerd, ${skipped} overgeslagen`)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Import mislukt'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/crm/contacts"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar contacts
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900">Contacten importeren</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload een CSV. Duplicaten (e-mail/telefoon) worden overgeslagen.
          Geïmporteerde contacten krijgen bron "Handmatig" en worden GEEN
          actieve leads (geen automatische berichten).
        </p>
      </div>

      {result ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-lg font-semibold text-zinc-800">
              {result.imported} geïmporteerd · {result.skipped} overgeslagen
            </p>
            <Button type="button" onClick={() => navigate({ to: '/crm/contacts' })}>
              Naar contacts
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. CSV uploaden</CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 hover:bg-zinc-50">
                <Upload className="h-4 w-4" />
                <span>Kies een .csv-bestand…</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
            </CardContent>
          </Card>

          {headers && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">2. Kolommen koppelen</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label>{f.label}</Label>
                      <Select
                        value={String(mapping[f.key] ?? -1)}
                        onValueChange={(v) =>
                          setMapping((m) => ({ ...m, [f.key]: Number(v) }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="— niet importeren" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1">— niet importeren</SelectItem>
                          {headers.map((h, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {h || `Kolom ${i + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    3. Preview ({dataRows.length} rijen)
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-500">
                        {FIELDS.map((f) => (
                          <th key={f.key} className="px-2 py-1">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.slice(0, 5).map((r, ri) => (
                        <tr key={ri} className="border-t border-zinc-100">
                          {FIELDS.map((f) => {
                            const idx = mapping[f.key]
                            return (
                              <td key={f.key} className="px-2 py-1 text-zinc-700">
                                {idx >= 0 ? (r[idx] ?? '') : ''}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="button" onClick={handleImport} disabled={importing}>
                  <Upload className="h-4 w-4" />
                  {importing ? 'Importeren…' : `Importeer ${dataRows.length} rijen`}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2:** Build + typecheck:
Run: `npm run build` → `✓ built`.
Run: `npx tsc --noEmit 2>&1 | grep -E "(^|/)src/routes/crm\.contacts_\.import\.tsx|(^|/)src/lib/csv\.ts|(^|/)convex/contacts\.ts"` → geen output.

- [ ] **Step 3:** Commit:
```bash
git add src/routes/crm.contacts_.import.tsx
git commit -m "feat(contacts): CSV-import-pagina (upload, mapping, preview, batched import)"
```

---

### Task 4: "Importeren"-knop op de Contacts-pagina

**Files:** `src/routes/crm.contacts.tsx`

- [ ] **Step 1:** Vervang in de header:
```tsx
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Contacts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isLoading
              ? '…'
              : `${contacts.length} van ${total.toLocaleString('nl-NL')} ${total === 1 ? 'contact' : 'contacts'}`}
          </p>
        </div>
      </div>
```
door (voeg de knop toe als tweede kind van de justify-between div):
```tsx
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Contacts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isLoading
              ? '…'
              : `${contacts.length} van ${total.toLocaleString('nl-NL')} ${total === 1 ? 'contact' : 'contacts'}`}
          </p>
        </div>
        <Link
          to="/crm/contacts/import"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Upload className="h-4 w-4" />
          Importeren
        </Link>
      </div>
```

- [ ] **Step 2:** Voeg `Upload` toe aan de lucide-import bovenin (`import { Plus, ChevronDown, Search } from 'lucide-react'` → `+ Upload`). `Link` is al geïmporteerd.

- [ ] **Step 3:** Build → `✓ built`; `npx tsc --noEmit 2>&1 | grep crm.contacts.tsx` → geen nieuwe fouten. Commit:
```bash
git add src/routes/crm.contacts.tsx
git commit -m "feat(contacts): Importeren-knop in de contacts-header"
```

---

### Task 5: Eindverificatie

- [ ] **Step 1:** `npx vitest run` (groen, incl. parseCsv) · `npx convex dev --once` (schoon) · `npm run build` (`✓ built`).

- [ ] **Step 2: Dev-smoke (browser)** — maak een test-CSV (bv. via een data:-bestand of een echte .csv met headers Voornaam,Email,Telefoon,Plaats + 2-3 rijen, waarvan 1 dup van een bestaand contact):
  - `/crm/contacts` → "Importeren" → upload → kolommen auto-gemapt → preview klopt → "Importeer" → samenvatting (X geïmporteerd, Y overgeslagen).
  - Terug naar contacts → de nieuwe contacten met "Handmatig"-bron-badge (filter op bron = Handmatig).
  - Tweede keer hetzelfde bestand importeren → alles overgeslagen (dedup).

- [ ] **Step 3:** Branch pushen + rapporteren (normale merge-route na Marvins go):
```bash
git push -u origin feat/contacts-csv-import
```

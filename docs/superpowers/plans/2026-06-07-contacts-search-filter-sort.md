# Contacts slice 1 — Zoeken + sorteren + kernfilters — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak-voor-taak uit te voeren. Steps gebruiken checkbox-syntax (`- [ ]`).

**Goal:** De Contacts-lijst doorzoekbaar/filterbaar/sorteerbaar maken (6101 contacten) via een server-side collect-all-query met testbare pure helpers.

**Architecture:** Geen schema-wijziging. Pure filter/sorteer-helpers in `convex/contactSearch.ts` (unit-getest), twee nieuwe queries (`searchContacts`, `contactCities`) in `convex/contacts.ts`, en een toolbar (zoekbalk + sorteer-`Select` + plaats-`Select` + toggles) in `crm.contacts.tsx` die `usePaginatedQuery`+`count` vervangt.

**Tech Stack:** TanStack Start (React) + Convex + shadcn/ui (`Select`) + vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-contacts-search-filter-sort-design.md`

**Niet mergen/prod zonder Marvins go.**

---

## File Structure
- `convex/contactSearch.ts` — pure helpers (geen Convex-context). Eén verantwoordelijkheid: matching + sortering.
- `convex/contactSearch.test.ts` — unit-tests voor de helpers.
- `convex/contacts.ts` — + `searchContacts` + `contactCities` queries (importeren de helpers).
- `src/routes/crm.contacts.tsx` — `ContactsContent` herschreven met toolbar; `usePaginatedQuery`/`count` eruit.

---

### Task 0: Setup — feature-branch

**Files:** geen.

- [ ] **Step 1: Branch vanaf actuele main**

```bash
cd /home/marvin/Projecten/leadflowv2
git checkout main && git pull --ff-only origin main
git checkout -b feat/contacts-search
```

Expected: `Switched to a new branch 'feat/contacts-search'`.

---

### Task 1: Pure helpers `convex/contactSearch.ts` (TDD)

**Files:**
- Create: `convex/contactSearch.test.ts`
- Create: `convex/contactSearch.ts`

- [ ] **Step 1: Schrijf de falende test**

Maak `convex/contactSearch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeForSearch,
  contactMatchesSearch,
  contactMatchesFilters,
  compareContacts,
} from "./contactSearch";

const base = {
  _creationTime: 1000,
  firstName: "Jan",
  lastName: "Jansen",
  email: "jan@example.nl",
  phone: "0612345678",
  company: "Acme",
  city: "Maastricht",
};

describe("normalizeForSearch", () => {
  it("lowercased + diacrieten gestript", () => {
    expect(normalizeForSearch("José")).toBe("jose");
    expect(normalizeForSearch("MÜNCHEN")).toBe("munchen");
  });
});

describe("contactMatchesSearch", () => {
  it("matcht op voornaam, email, telefoon, plaats", () => {
    expect(contactMatchesSearch(base, normalizeForSearch("jan"))).toBe(true);
    expect(contactMatchesSearch(base, normalizeForSearch("example"))).toBe(true);
    expect(contactMatchesSearch(base, normalizeForSearch("0612"))).toBe(true);
    expect(contactMatchesSearch(base, normalizeForSearch("maastricht"))).toBe(true);
  });
  it("matcht op bedrijf", () => {
    expect(contactMatchesSearch(base, normalizeForSearch("acme"))).toBe(true);
  });
  it("lege term → true", () => {
    expect(contactMatchesSearch(base, "")).toBe(true);
  });
  it("accent-ongevoelig", () => {
    expect(
      contactMatchesSearch({ ...base, city: "München" }, normalizeForSearch("munchen")),
    ).toBe(true);
  });
  it("geen match → false", () => {
    expect(contactMatchesSearch(base, normalizeForSearch("rotterdam"))).toBe(false);
  });
});

describe("contactMatchesFilters", () => {
  it("hasEmail sluit contacten zonder email uit", () => {
    expect(contactMatchesFilters(base, { hasEmail: true })).toBe(true);
    expect(
      contactMatchesFilters({ ...base, email: undefined }, { hasEmail: true }),
    ).toBe(false);
  });
  it("hasPhone sluit contacten zonder telefoon uit", () => {
    expect(
      contactMatchesFilters({ ...base, phone: undefined }, { hasPhone: true }),
    ).toBe(false);
  });
  it("city = exacte match", () => {
    expect(contactMatchesFilters(base, { city: "Maastricht" })).toBe(true);
    expect(contactMatchesFilters(base, { city: "Heerlen" })).toBe(false);
  });
  it("city-filter sluit contact zonder plaats uit", () => {
    expect(
      contactMatchesFilters({ ...base, city: undefined }, { city: "Maastricht" }),
    ).toBe(false);
  });
  it("lege filters → true", () => {
    expect(contactMatchesFilters(base, {})).toBe(true);
  });
  it("combinatie: alle moeten kloppen", () => {
    expect(
      contactMatchesFilters(base, { hasEmail: true, hasPhone: true, city: "Maastricht" }),
    ).toBe(true);
    expect(
      contactMatchesFilters(base, { hasEmail: true, city: "Heerlen" }),
    ).toBe(false);
  });
});

describe("compareContacts", () => {
  const a = { ...base, _creationTime: 100, firstName: "Anna", lastName: "" };
  const b = { ...base, _creationTime: 200, firstName: "Bob", lastName: "" };
  it("newest = nieuwste eerst", () => {
    expect(compareContacts(a, b, "newest")).toBeGreaterThan(0);
    expect([a, b].sort((x, y) => compareContacts(x, y, "newest"))[0]).toBe(b);
  });
  it("oldest = oudste eerst", () => {
    expect([a, b].sort((x, y) => compareContacts(x, y, "oldest"))[0]).toBe(a);
  });
  it("name_asc = A→Z", () => {
    expect([b, a].sort((x, y) => compareContacts(x, y, "name_asc"))[0]).toBe(a);
  });
  it("name_desc = Z→A", () => {
    expect([a, b].sort((x, y) => compareContacts(x, y, "name_desc"))[0]).toBe(b);
  });
  it("naamloos contact valt terug op email", () => {
    const noName = { ...base, firstName: undefined, lastName: undefined, email: "zzz@x.nl" };
    expect(typeof compareContacts(noName, a, "name_asc")).toBe("number");
  });
});

describe("search + filter gecombineerd", () => {
  it("beide criteria moeten matchen", () => {
    const list = [
      base,
      { ...base, email: undefined }, // matcht zoek maar valt af op hasEmail
      { ...base, city: "Heerlen" }, // matcht zoek maar valt af op city
    ];
    const out = list.filter(
      (c) =>
        contactMatchesSearch(c, normalizeForSearch("jan")) &&
        contactMatchesFilters(c, { hasEmail: true, city: "Maastricht" }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(base);
  });
});
```

- [ ] **Step 2: Run de test — verwacht FAIL**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/contactSearch.test.ts`
Expected: FAIL — module/exports bestaan niet.

- [ ] **Step 3: Implementeer de helpers**

Maak `convex/contactSearch.ts`:

```ts
/**
 * Pure helpers voor de Contacts-zoek/filter/sorteer-query. Geen Convex-context
 * → unit-testbaar onder `convex/**\/*.test.ts`.
 */

type ContactLike = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  city?: string | null;
};

export type ContactSort = "newest" | "oldest" | "name_asc" | "name_desc";

/** Lowercase + diacrieten strippen (accent-ongevoelig zoeken). */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Substring-match van een (reeds genormaliseerde) term over de tekstvelden. */
export function contactMatchesSearch(
  contact: ContactLike,
  termNormalized: string,
): boolean {
  if (!termNormalized) return true;
  const haystack = normalizeForSearch(
    [
      contact.firstName,
      contact.lastName,
      contact.email,
      contact.phone,
      contact.company,
      contact.city,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(termNormalized);
}

export function contactMatchesFilters(
  contact: ContactLike,
  filters: { hasEmail?: boolean; hasPhone?: boolean; city?: string },
): boolean {
  if (filters.hasEmail && !contact.email) return false;
  if (filters.hasPhone && !contact.phone) return false;
  if (filters.city && contact.city !== filters.city) return false;
  return true;
}

function nameKey(c: ContactLike): string {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return (full || c.email || c.phone || "").toLowerCase();
}

export function compareContacts(
  a: ContactLike & { _creationTime: number },
  b: ContactLike & { _creationTime: number },
  sort: ContactSort,
): number {
  switch (sort) {
    case "oldest":
      return a._creationTime - b._creationTime;
    case "name_asc":
      return nameKey(a).localeCompare(nameKey(b), "nl");
    case "name_desc":
      return nameKey(b).localeCompare(nameKey(a), "nl");
    case "newest":
    default:
      return b._creationTime - a._creationTime;
  }
}
```

- [ ] **Step 4: Run de test — verwacht PASS**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/contactSearch.test.ts`
Expected: PASS — alle tests groen.

- [ ] **Step 5: Commit**

```bash
git add convex/contactSearch.ts convex/contactSearch.test.ts
git commit -m "feat(contacts): pure search/filter/sort helpers + unit tests"
```

---

### Task 2: Queries `searchContacts` + `contactCities`

**Files:**
- Modify: `convex/contacts.ts` (import + twee nieuwe queries; plaats ná de bestaande `count` query, ~regel 130)

- [ ] **Step 1: Voeg de helper-import toe**

Voeg bij de imports bovenin `convex/contacts.ts` toe:

```ts
import {
  normalizeForSearch,
  contactMatchesSearch,
  contactMatchesFilters,
  compareContacts,
} from "./contactSearch";
```

- [ ] **Step 2: Voeg de twee queries toe (ná `count`)**

```ts
/**
 * Doorzoekbare/filterbare/sorteerbare contactlijst. Collect-all + in-memory
 * filter/sort (geen searchIndex). Leest de volledige workspace-set per call —
 * gelijk aan `count`; prima voor ~6k, herzien met searchIndex bij >~15k.
 */
export const searchContacts = query({
  args: {
    workspaceId: v.id("workspaces"),
    search: v.optional(v.string()),
    filters: v.optional(
      v.object({
        hasEmail: v.optional(v.boolean()),
        hasPhone: v.optional(v.boolean()),
        city: v.optional(v.string()),
      }),
    ),
    sort: v.optional(
      v.union(
        v.literal("newest"),
        v.literal("oldest"),
        v.literal("name_asc"),
        v.literal("name_desc"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const all = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const termNormalized = args.search ? normalizeForSearch(args.search) : "";
    const filters = args.filters ?? {};
    const sort = args.sort ?? "newest";

    const matched = all
      .filter(
        (c) =>
          contactMatchesSearch(c, termNormalized) &&
          contactMatchesFilters(c, filters),
      )
      .sort((a, b) => compareContacts(a, b, sort));

    const limit = args.limit ?? 25;
    return { contacts: matched.slice(0, limit), total: matched.length };
  },
});

/** Distinct niet-lege plaatsen in de workspace, voor de filter-dropdown. */
export const contactCities = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const all = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const cities = [
      ...new Set(
        all
          .map((c) => c.city)
          .filter((x): x is string => !!x && x.trim() !== ""),
      ),
    ];
    cities.sort((a, b) => a.localeCompare(b, "nl"));
    return cities;
  },
});
```

- [ ] **Step 3: Typecheck/deploy naar dev**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: schoon (functies klaar, geen schema-/validator-fouten).

- [ ] **Step 4: Commit**

```bash
git add convex/contacts.ts
git commit -m "feat(contacts): searchContacts + contactCities queries"
```

---

### Task 3: Toolbar-UI in `crm.contacts.tsx`

**Files:**
- Modify: `src/routes/crm.contacts.tsx` (imports + volledige `ContactsContent`-functie, ~regel 1-163)

- [ ] **Step 1: Werk de imports bij**

Vervang de bovenste imports:

```ts
import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react'
import { toast } from 'sonner'
import { Plus, ChevronDown } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
```

door:

```ts
import { useState, useEffect, useMemo } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Plus, ChevronDown, Search } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { cn } from '#/lib/utils.ts'
```

> **Let op:** dit vervangt alleen de eerste import-regels (react t/m Button). De
> bestaande imports daaronder — `Input`, `Label`, `Skeleton`, `Badge`,
> `Card*`, `humanizeConvexError`, `api`, `Id` — blijven ongewijzigd staan.
> `usePaginatedQuery` is verwijderd; `count`/`listPaginated`-defs in
> `convex/contacts.ts` blijven bestaan (nergens anders gebruikt, harmless).

- [ ] **Step 2: Vervang de hele `ContactsContent`-functie**

Vervang de volledige functie `function ContactsContent({ workspaceId }: { workspaceId: Id<'workspaces'> }) { … }` (van `function ContactsContent` t/m de bijbehorende sluit-`}`, vóór `function CreateContactForm`) door:

```tsx
const SORT_OPTIONS = [
  { value: 'newest', label: 'Nieuwste eerst' },
  { value: 'oldest', label: 'Oudste eerst' },
  { value: 'name_asc', label: 'Naam A-Z' },
  { value: 'name_desc', label: 'Naam Z-A' },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]['value']

const ALL_CITIES = '__all__'

function ContactsContent({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [hasEmail, setHasEmail] = useState(false)
  const [hasPhone, setHasPhone] = useState(false)
  const [city, setCity] = useState<string>(ALL_CITIES)
  const [sort, setSort] = useState<SortValue>('newest')
  const [limit, setLimit] = useState(PAGE_SIZE)

  // Debounce de zoekterm (voorkomt een query per toetsaanslag).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset paginatie als zoekopdracht/filters/sortering wijzigt.
  // `limit` staat bewust NIET in de deps — anders zou dit bij elke
  // "Toon 25 meer" opnieuw resetten (lus).
  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [debouncedSearch, hasEmail, hasPhone, city, sort])

  // Stabiele referentie voor de query-args. Convex `useQuery` vergelijkt args
  // by-value (geen echte loop bij een nieuw object), maar useMemo houdt het
  // netjes en voorkomt twijfel over re-subscribes.
  const filters = useMemo(
    () => ({
      ...(hasEmail ? { hasEmail: true } : {}),
      ...(hasPhone ? { hasPhone: true } : {}),
      ...(city !== ALL_CITIES ? { city } : {}),
    }),
    [hasEmail, hasPhone, city],
  )

  const cities = useQuery(api.contacts.contactCities, { workspaceId })
  const data = useQuery(api.contacts.searchContacts, {
    workspaceId,
    search: debouncedSearch || undefined,
    filters,
    sort,
    limit,
  })

  const isLoading = data === undefined
  const contacts = data?.contacts ?? []
  const total = data?.total ?? 0
  const hasMore = contacts.length < total
  const filtersActive =
    debouncedSearch !== '' || hasEmail || hasPhone || city !== ALL_CITIES

  return (
    <div className="space-y-6">
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

      <CreateContactForm workspaceId={workspaceId} />

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Alle contacts</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op naam, e-mail, telefoon, bedrijf, plaats…"
                className="pl-9"
              />
            </div>

            <Select value={sort} onValueChange={(v) => setSort(v as SortValue)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Alle plaatsen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CITIES}>Alle plaatsen</SelectItem>
                {(cities ?? []).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHasEmail((v) => !v)}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                  hasEmail
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50',
                )}
              >
                Heeft e-mail
              </button>
              <button
                type="button"
                onClick={() => setHasPhone((v) => !v)}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                  hasPhone
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50',
                )}
              >
                Heeft telefoon
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {filtersActive
                ? 'Geen contacten gevonden voor deze zoekopdracht/filters.'
                : 'Nog geen contacts. Voeg je eerste hierboven toe.'}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-zinc-100">
                {contacts.map((c) => {
                  const fullName = [c.firstName, c.lastName]
                    .filter(Boolean)
                    .join(' ')
                  const display = fullName || c.email || c.phone || '(naamloos)'
                  const initials = (fullName || c.email || '?')
                    .slice(0, 2)
                    .toUpperCase()
                  return (
                    <li key={c._id}>
                      <Link
                        to="/crm/contacts/$id"
                        params={{ id: c._id }}
                        className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-zinc-50/60"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-medium text-violet-800">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-zinc-900">
                            {display}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                            {c.email && (
                              <span className="truncate">{c.email}</span>
                            )}
                            {c.phone && <span>· {c.phone}</span>}
                            {c.company && <span>· {c.company}</span>}
                            {c.city && (
                              <Badge variant="secondary" className="text-xs">
                                {c.city}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs text-zinc-400">
                          {new Date(c._creationTime).toLocaleDateString('nl-NL')}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>

              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLimit((l) => l + PAGE_SIZE)}
                    className="w-full max-w-xs border-dashed"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Toon {PAGE_SIZE} meer
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Build + typecheck**

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: `✓ built`.

Run: `cd /home/marvin/Projecten/leadflowv2 && npx tsc --noEmit 2>&1 | grep -E "crm.contacts.tsx|contactSearch.ts|contacts.ts"`
Expected: geen output (geen nieuwe fouten in de gewijzigde bestanden).

- [ ] **Step 4: Commit**

```bash
git add src/routes/crm.contacts.tsx
git commit -m "feat(contacts): zoek/sorteer/filter-toolbar op de contactlijst"
```

---

### Task 4: Eindverificatie

**Files:** geen.

- [ ] **Step 1: Volledige gates**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run`
Expected: PASS — 24 bestaande + nieuwe `contactSearch`-tests, alle groen.

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: schoon.

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: `✓ built`.

- [ ] **Step 2: Dev-smoke (browser, ingelogd op `localhost:5173/crm/contacts`)**

Controleer:
- Zoeken op een naam/email/plaats → lijst filtert naar de juiste contact(en); header "{n} van {total}" klopt.
- Sorteer-dropdown: Naam A-Z / Oudste eerst wijzigen de volgorde zichtbaar.
- "Heeft e-mail" / "Heeft telefoon"-toggles + plaats-dropdown filteren; "Alle plaatsen" reset de plaats-filter.
- "Toon 25 meer" laadt door (limit groeit); reset naar 25 bij nieuwe zoekterm.
- Lege zoek + geen filters = nieuwste-eerst lijst; niet-bestaande zoekterm → "Geen contacten gevonden".

- [ ] **Step 3: Branch pushen — GEEN merge/prod zonder Marvins go**

```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin feat/contacts-search
```

Rapporteer aan Marvin: slice gebouwd + geverifieerd, branch gepusht, klaar voor zijn merge-besluit.

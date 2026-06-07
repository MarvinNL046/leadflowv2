# Contacts slice 2 — Bron-filter + bron-badge — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak-voor-taak uit te voeren. Steps gebruiken checkbox-syntax (`- [ ]`).

**Goal:** De contactlijst filterbaar maken op lead-bron (Meta/Website/handmatig) + een bron-badge per rij.

**Architecture:** `leadAttribution` krijgt `workspaceId` (+ index) zodat bronnen per workspace te queryen zijn; een backfill vult bestaande rijen; `searchContacts` bouwt een contactId→bron-map (pure helper) voor filter + badge. Geen denormalisatie op contacts.

**Tech Stack:** Convex + TanStack Start + shadcn/ui + vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-contacts-source-filter-design.md`

**Niet mergen/prod zonder Marvins go.**

---

## File Structure
- `convex/schema.ts` — `leadAttribution` + `workspaceId` + index `by_workspace`.
- `convex/websiteLeads.ts` + `convex/metaProcessor.ts` — `workspaceId` in de insert.
- `convex/migration.ts` — + `backfillLeadAttributionWorkspace` internalMutation.
- `convex/contactSearch.ts` (+ `.test.ts`) — + `buildSourceMap`.
- `convex/contacts.ts` — `searchContacts`: source-map + filter + return source.
- `src/routes/crm.contacts.tsx` — bron-Select + bron-badge.

---

### Task 0: Setup — feature-branch

- [ ] **Step 1:**

```bash
cd /home/marvin/Projecten/leadflowv2
git checkout main && git pull --ff-only origin main
git checkout -b feat/contacts-source-filter
```

Expected: `Switched to a new branch 'feat/contacts-source-filter'`.

---

### Task 1: Schema + ingest (`workspaceId` op leadAttribution)

**Files:** `convex/schema.ts`, `convex/websiteLeads.ts`, `convex/metaProcessor.ts`

- [ ] **Step 1: Schema — veld + index**

In `convex/schema.ts`, in de `leadAttribution: defineTable({ ... })`: voeg direct ná `contactId: v.id("contacts"),` toe:

```ts
    workspaceId: v.optional(v.id("workspaces")),
```

En voeg aan de index-chain van `leadAttribution` (naast `.index("by_contact", ["contactId"])`) toe:

```ts
    .index("by_workspace", ["workspaceId"])
```

- [ ] **Step 2: websiteLeads-insert**

In `convex/websiteLeads.ts` (~regel 82), vervang:

```ts
    await ctx.db.insert("leadAttribution", {
      contactId,
      source: "api",
      utmSource: args.source,
    });
```

door:

```ts
    await ctx.db.insert("leadAttribution", {
      contactId,
      workspaceId: workspace._id,
      source: "api",
      utmSource: args.source,
    });
```

- [ ] **Step 3: metaProcessor-insert**

In `convex/metaProcessor.ts` (~regel 387), vervang:

```ts
    await ctx.db.insert("leadAttribution", {
      contactId,
      source: "meta",
      metaPageId: args.pageId,
```

door:

```ts
    await ctx.db.insert("leadAttribution", {
      contactId,
      workspaceId: workspace._id,
      source: "meta",
      metaPageId: args.pageId,
```

- [ ] **Step 4: Deploy/typecheck dev**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: schoon (additief veld + index; geen migratie nodig).

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/websiteLeads.ts convex/metaProcessor.ts
git commit -m "feat(contacts): leadAttribution.workspaceId + index + ingest"
```

---

### Task 2: Backfill-internalMutation

**Files:** `convex/migration.ts`

- [ ] **Step 1: Voeg de backfill toe**

Voeg toe in `convex/migration.ts` (gebruikt de bestaande `internalMutation`-import in dat bestand):

```ts
/**
 * Eenmalige backfill: zet leadAttribution.workspaceId vanuit het gekoppelde
 * contact. Batched (max 500/call) + idempotent. Run herhaald tot processed===0.
 * Rijen met een onvindbaar contact worden geteld als skipped (blijven over;
 * verwaarloosbaar).
 */
export const backfillLeadAttributionWorkspace = internalMutation({
  args: {},
  handler: async (ctx) => {
    const batch = await ctx.db
      .query("leadAttribution")
      .filter((q) => q.eq(q.field("workspaceId"), undefined))
      .take(500);

    let processed = 0;
    let skipped = 0;
    for (const row of batch) {
      const contact = await ctx.db.get(row.contactId);
      if (!contact) {
        skipped++;
        continue;
      }
      await ctx.db.patch(row._id, { workspaceId: contact.workspaceId });
      processed++;
    }

    const rest = await ctx.db
      .query("leadAttribution")
      .filter((q) => q.eq(q.field("workspaceId"), undefined))
      .take(1);

    return { processed, skipped, remaining: rest.length };
  },
});
```

- [ ] **Step 2: Deploy/typecheck dev**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: schoon.

- [ ] **Step 3: Run de backfill op DEV (herhaal tot processed===0)**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex run migration:backfillLeadAttributionWorkspace`
Verwacht: `{ processed: N, skipped: ..., remaining: ... }`. Herhaal het commando tot `processed: 0`. (`remaining` mag >0 blijven als dat skipped orphan-rijen zijn.)

- [ ] **Step 4: Commit**

```bash
git add convex/migration.ts
git commit -m "feat(contacts): backfill leadAttribution.workspaceId (batched)"
```

---

### Task 3: `buildSourceMap`-helper (TDD)

**Files:** `convex/contactSearch.test.ts` (toevoegen), `convex/contactSearch.ts` (toevoegen)

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `convex/contactSearch.test.ts` (onderaan, ná de bestaande describes; voeg `buildSourceMap` toe aan de import bovenin):

Import-regel bovenin wijzigen naar:
```ts
import {
  normalizeForSearch,
  contactMatchesSearch,
  contactMatchesFilters,
  compareContacts,
  buildSourceMap,
} from "./contactSearch";
```

Test onderaan toevoegen:
```ts
describe("buildSourceMap", () => {
  it("oudste attributie per contact wint", () => {
    const m = buildSourceMap([
      { contactId: "c1", source: "meta", _creationTime: 200 },
      { contactId: "c1", source: "api", _creationTime: 100 },
      { contactId: "c2", source: "api", _creationTime: 150 },
    ]);
    expect(m.get("c1")).toBe("api"); // oudste (100) wint
    expect(m.get("c2")).toBe("api");
    expect(m.size).toBe(2);
  });
  it("lege input → lege map", () => {
    expect(buildSourceMap([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run — verwacht FAIL**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/contactSearch.test.ts`
Expected: FAIL — `buildSourceMap` bestaat niet.

- [ ] **Step 3: Implementeer de helper**

Voeg onderaan `convex/contactSearch.ts` toe:

```ts
/** Map contactId → bron (oudste attributie wint = oorspronkelijke bron). */
export function buildSourceMap(
  attributions: Array<{
    contactId: string;
    source: string;
    _creationTime: number;
  }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of [...attributions].sort(
    (x, y) => x._creationTime - y._creationTime,
  )) {
    if (!map.has(a.contactId)) map.set(a.contactId, a.source);
  }
  return map;
}
```

- [ ] **Step 4: Run — verwacht PASS**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/contactSearch.test.ts`
Expected: PASS — alle tests groen.

- [ ] **Step 5: Commit**

```bash
git add convex/contactSearch.ts convex/contactSearch.test.ts
git commit -m "feat(contacts): buildSourceMap helper + unit tests"
```

---

### Task 4: `searchContacts` — bron-map + filter + return source

**Files:** `convex/contacts.ts`

- [ ] **Step 1: Import uitbreiden**

Wijzig de bestaande import in `convex/contacts.ts`:

```ts
import {
  normalizeForSearch,
  contactMatchesSearch,
  contactMatchesFilters,
  compareContacts,
} from "./contactSearch";
```

naar:

```ts
import {
  normalizeForSearch,
  contactMatchesSearch,
  contactMatchesFilters,
  compareContacts,
  buildSourceMap,
} from "./contactSearch";
```

- [ ] **Step 2: `source` aan de filters-validator**

In `searchContacts`, vervang:

```ts
        hasPhone: v.optional(v.boolean()),
        city: v.optional(v.string()),
      }),
```

door:

```ts
        hasPhone: v.optional(v.boolean()),
        city: v.optional(v.string()),
        source: v.optional(
          v.union(v.literal("meta"), v.literal("api"), v.literal("manual")),
        ),
      }),
```

- [ ] **Step 3: Handler — map, filter, return source**

In de handler van `searchContacts`, vervang:

```ts
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
```

door:

```ts
    const termNormalized = args.search ? normalizeForSearch(args.search) : "";
    const filters = args.filters ?? {};
    const sort = args.sort ?? "newest";

    const attributions = await ctx.db
      .query("leadAttribution")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const sourceMap = buildSourceMap(attributions);

    const matched = all
      .filter(
        (c) =>
          contactMatchesSearch(c, termNormalized) &&
          contactMatchesFilters(c, filters) &&
          (!filters.source || sourceMap.get(c._id) === filters.source),
      )
      .sort((a, b) => compareContacts(a, b, sort));

    const limit = args.limit ?? 25;
    return {
      contacts: matched.slice(0, limit).map((c) => ({
        ...c,
        source: sourceMap.get(c._id) ?? null,
      })),
      total: matched.length,
    };
```

- [ ] **Step 4: Deploy/typecheck dev**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: schoon.

- [ ] **Step 5: Commit**

```bash
git add convex/contacts.ts
git commit -m "feat(contacts): searchContacts bron-map + source-filter + source in result"
```

---

### Task 5: UI — bron-Select + bron-badge

**Files:** `src/routes/crm.contacts.tsx`

- [ ] **Step 1: Consts + state + filters/deps**

Voeg ná `const ALL_CITIES = '__all__'` toe:

```ts
const ALL_SOURCES = '__all__'

const SOURCE_LABELS: Record<string, string> = {
  meta: 'Meta',
  api: 'Website',
  manual: 'Handmatig',
}
```

In `ContactsContent`, voeg een state toe (na de `city`-state):

```ts
  const [source, setSource] = useState<string>(ALL_SOURCES)
```

In de `filters`-`useMemo`, voeg toe (en `source` aan de deps):

```ts
  const filters = useMemo(
    () => ({
      ...(hasEmail ? { hasEmail: true } : {}),
      ...(hasPhone ? { hasPhone: true } : {}),
      ...(city !== ALL_CITIES ? { city } : {}),
      ...(source !== ALL_SOURCES ? { source } : {}),
    }),
    [hasEmail, hasPhone, city, source],
  )
```

In de limit-reset-`useEffect`, voeg `source` aan de deps toe:

```ts
  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [debouncedSearch, hasEmail, hasPhone, city, sort, source])
```

En in `filtersActive`:

```ts
  const filtersActive =
    debouncedSearch !== '' ||
    hasEmail ||
    hasPhone ||
    city !== ALL_CITIES ||
    source !== ALL_SOURCES
```

- [ ] **Step 2: Bron-`Select` in de toolbar**

Voeg direct ná de plaats-`Select` (de `</Select>` van de city-dropdown), vóór de `<div className="flex gap-2">` met de toggles, toe:

```tsx
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Alle bronnen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SOURCES}>Alle bronnen</SelectItem>
                <SelectItem value="meta">Meta</SelectItem>
                <SelectItem value="api">Website</SelectItem>
                <SelectItem value="manual">Handmatig</SelectItem>
              </SelectContent>
            </Select>
```

- [ ] **Step 3: Bron-badge in de rij**

In de rij-render (in de `<div className="mt-0.5 flex flex-wrap ...">` met email/phone/company/city), voeg ná de city-badge toe:

```tsx
                            {c.source && SOURCE_LABELS[c.source] && (
                              <Badge
                                variant="outline"
                                className="text-xs text-zinc-500"
                              >
                                {SOURCE_LABELS[c.source]}
                              </Badge>
                            )}
```

- [ ] **Step 4: Build + typecheck**

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: `✓ built`.

Run: `cd /home/marvin/Projecten/leadflowv2 && npx tsc --noEmit 2>&1 | grep -E "(^|/)src/routes/crm\.contacts\.tsx|(^|/)convex/contacts\.ts|(^|/)convex/contactSearch\.ts"`
Expected: geen output (geen nieuwe fouten in de gewijzigde bestanden).

- [ ] **Step 5: Commit**

```bash
git add src/routes/crm.contacts.tsx
git commit -m "feat(contacts): bron-Select + bron-badge in de contactlijst"
```

---

### Task 6: Eindverificatie

- [ ] **Step 1: Volledige gates**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run`
Expected: PASS — bestaande + nieuwe `buildSourceMap`-tests, alle groen.

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: schoon.

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: `✓ built`.

- [ ] **Step 2: Dev-smoke (browser, `localhost:5173/crm/contacts`)**

- Bron-`Select` → **Meta**: lijst toont alleen Meta-leads, met "Meta"-badges.
- Bron-`Select` → **Website**: "Website"-badges; combineert met een zoekterm/plaats.
- **Alle bronnen** reset de bron-filter.
- Bron-badges verschijnen ook zonder filter, naast de plaats-badge.

- [ ] **Step 3: Branch pushen — GEEN merge/prod zonder Marvins go**

```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin feat/contacts-source-filter
```

Rapporteer aan Marvin: gebouwd + geverifieerd, branch gepusht; **NB de backfill moet ook op PROD draaien bij de merge** (`npx convex run migration:backfillLeadAttributionWorkspace --prod` tot processed=0).

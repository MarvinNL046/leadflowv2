# Contacts slice 1 — Zoeken + sorteren + kernfilters — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** de Contacts-lijst (`src/routes/crm.contacts.tsx` + `convex/contacts.ts`) bruikbaar maken bij volume (6101 contacten): zoeken, sorteren, kernfilters. Eerste slice van de Contacts-parity. GEEN merge/prod zonder Marvins go.

## Doel
De lijst is nu een platte cursor-paginatie ("Toon 25 meer") zonder zoeken/filteren/sorteren — een specifiek contact vinden van de 6101 is onmogelijk. Voeg een zoekbalk, sorteer-dropdown en kernfilters (heeft-email/heeft-telefoon/plaats) toe.

## Huidige situatie (geverifieerd)
- `crm.contacts.tsx` `ContactsContent` gebruikt `usePaginatedQuery(api.contacts.listPaginated, { workspaceId }, { initialNumItems: 25 })` + `api.contacts.count`. Geen zoeken/filteren/sorteren. `CreateContactForm` eronder.
- `convex/contacts.ts`: `listPaginated` query't `by_workspace_created`, filtert `deletedAt === undefined`, `.order("desc")`, `.paginate()`. `count` doet `.collect()` op álle workspace-contacten (leest dus al de volledige set bij elke page-load). Module-helper `requireWorkspaceMembership(ctx, workspaceId)` bestaat.
- `contacts`-tabel: velden `firstName/lastName/email/phone/company/city` (allemaal `v.optional(v.string())`), `deletedAt`. Indexes: `by_workspace_created`, `by_workspace_email`, `by_workspace_phone`, … **GEEN searchIndex.**
- `leadAttribution` (voor "source") heeft **géén** `workspaceId` en alleen `by_contact` → source-filter is N+1 over 6101 → **uit scope** (aparte slice).
- UI-primitives aanwezig: `Select`-set (`src/components/ui/select.tsx`), `Input`, `Button`, `Badge`, `Card`.

## Gewenste situatie

### 1. Pure filter/sorteer-helpers (testbaar)
Nieuw `convex/contactSearch.ts` (pure functies, geen Convex-context — testbaar onder de bestaande vitest-config `convex/**/*.test.ts`):
- `normalizeForSearch(s: string): string` — lowercase + diacrieten strippen (`NFD` + combining-marks weg).
- `contactMatchesSearch(contact, termNormalized): boolean` — substring-match van de (reeds genormaliseerde) term tegen de genormaliseerde join van voornaam/achternaam/email/telefoon/bedrijf/plaats. Lege term → `true`.
- `contactMatchesFilters(contact, { hasEmail?, hasPhone?, city? }): boolean` — `hasEmail`=true vereist `email`; `hasPhone`=true vereist `phone`; `city` (indien gezet) exacte match. Niet-gezette filters = geen constraint.
- `type ContactSort = 'newest' | 'oldest' | 'name_asc' | 'name_desc'` + `compareContacts(a, b, sort): number` — `newest/oldest` op `_creationTime`; `name_asc/desc` op naam-sleutel (`fullName || email || phone`, lowercased, `localeCompare('nl')`).

### 2. Convex-queries (`convex/contacts.ts`)
- `searchContacts({ workspaceId, search?, filters?, sort?, limit? })` → membership-check → collect `by_workspace_created` (`deletedAt` undefined) → `filter` met de twee match-helpers → `sort` met `compareContacts` → return `{ contacts: matched.slice(0, limit ?? 25), total: matched.length }`. `sort` default `'newest'` (= huidige order). `search` wordt één keer met `normalizeForSearch` genormaliseerd vóór de loop.
- `contactCities({ workspaceId })` → membership-check → collect → distinct niet-lege `city`, gesorteerd (`localeCompare('nl')`) → `string[]`. Voor de plaats-dropdown.

### 3. UI (`crm.contacts.tsx`)
Toolbar boven de lijst (in `ContactsContent`):
- **Zoekbalk** (`Input`) met **300ms debounce** (`search` → `debouncedSearch` via `useEffect`+`setTimeout`).
- **Sorteer-`Select`**: Nieuwste / Oudste / Naam A-Z / Naam Z-A → `sort`-state.
- **Filters:** twee toggle-knoppen ("Heeft e-mail" / "Heeft telefoon", `Button` met actief/inactief via `cn`) + plaats-`Select` (opties uit `contactCities`, met sentinel `__all__` = "Alle plaatsen" → query krijgt `city: undefined`; Radix-`Select` accepteert geen lege string-value).
- Lijst rendert `data?.contacts` (`useQuery(api.contacts.searchContacts, {...})`); header "{contacts.length} van {total}". `data === undefined` → skeletons.
- **Paginatie:** `limit`-state (start 25); "Toon 25 meer" → `limit += 25`; tonen zolang `contacts.length < total`. `limit` reset naar 25 wanneer `debouncedSearch/hasEmail/hasPhone/city/sort` wijzigt (`useEffect`).
- Vervangt `usePaginatedQuery` + `count`. `CreateContactForm` blijft ongewijzigd.

## Data-flow
```
typen in zoekbalk → 300ms debounce → searchContacts({search,filters,sort,limit})
  collect by_workspace_created (deletedAt undefined)
    → contactMatchesSearch && contactMatchesFilters
    → compareContacts(sort)
    → { contacts: slice(limit), total }
  ↓ Convex reactief
lijst + "{n} van {total}" + "Toon 25 meer" (limit += 25)
contactCities → plaats-dropdown
```

## Wijzigingen (overzicht)
- `convex/contactSearch.ts` — nieuw, pure helpers.
- `convex/contactSearch.test.ts` — nieuw, unit-tests.
- `convex/contacts.ts` — + `searchContacts` + `contactCities` queries (import helpers).
- `src/routes/crm.contacts.tsx` — toolbar + queries; `usePaginatedQuery`/`count` eruit.

Geen schema-wijziging, geen migratie, geen nieuwe dependency.

## Edge cases
- **Lege zoek + geen filters:** `searchContacts` geeft de nieuwste-eerst lijst (gedrag = nu).
- **Geen matches:** lege-state "Geen contacten gevonden".
- **Naamloze contacten:** naam-sortering valt terug op email→telefoon; zoeken matcht nog steeds op de aanwezige velden.
- **Diacrieten:** `normalizeForSearch` maakt zoeken accent-ongevoelig ("munchen" matcht "München").
- **Radix `Select` lege value:** plaats-"alle" via sentinel `__all__`, nooit `value=""`.
- **Datavolume:** `searchContacts`/`contactCities` lezen elk de volledige workspace-set per call — gelijk aan wat `count` nu al doet; ruim binnen Convex-limieten voor 6101. Scale-grens: bij >~15k contacten overstappen op een `searchIndex` (gedenormaliseerd `searchText`-veld) — gedocumenteerd, niet nu.

## Out of scope (bewust)
- `source`-filter (vereist `leadAttribution.workspaceId` + index of een gedenormaliseerd `source`-veld — eigen slice).
- CSV bulk-import, custom-fields-CRUD, bulk-acties (aparte Contacts-slices).
- Bedrijf/plaats-**sortering** (makkelijke latere toevoeging; slice 1 = naam + datum).
- `searchIndex`/relevance-ranking (approach 2 — pas nodig bij grote datasets).
- Hardcode→settings (paginatie-grootte-keuze, dedup-sleutel, werkgebied) — latere Contacts-settings-slice.

## Verificatie
1. `npx vitest run` groen (incl. nieuwe `convex/contactSearch.test.ts`).
2. `npx convex dev --once` schoon + `npm run build` (`✓ built`) + geen nieuwe tsc-fouten in gewijzigde bestanden.
3. Dev-smoke (browser, ingelogd op `localhost:5173/crm/contacts`): zoeken op naam/email/plaats vindt het juiste contact; sorteer-opties wijzigen de volgorde; "Heeft e-mail"/"Heeft telefoon"-toggles + plaats-dropdown filteren; "Toon 25 meer" laadt door; lege zoek = nieuwste-eerst; geen-matches-state.

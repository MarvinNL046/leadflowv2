# Contacts slice 2 — Bron-filter + bron-badge — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** filter de contactlijst op lead-bron (Meta / Website / handmatig) + toon een bron-badge per rij. Tweede Contacts-parity-slice. GEEN merge/prod zonder Marvins go.

## Doel
De `source`-filter ontbreekt nog (bewust uitgesteld in slice 1 omdat `leadAttribution` geen `workspaceId` had). Voeg 'm toe zodat collega's leads kunnen segmenteren op herkomst.

## Huidige situatie (geverifieerd)
- `leadAttribution`: velden `contactId`, `source` (`"meta"|"api"|"manual"`), meta*/utm*, `legacyId`. Index alleen `by_contact`. **Geen `workspaceId`** → niet per-workspace te queryen.
- Inserts op 3 plekken: `convex/websiteLeads.ts:82` (source `"api"`, `workspace._id` in scope), `convex/metaProcessor.ts:387` (source `"meta"`, `workspace._id` in scope), `convex/migration.ts:936` (ETL — **dood post-cutover**, niet aangeraakt; backfill dekt deze rijen).
- Praktijk-bronnen: **meta** (Meta lead ads) + **api** (website-form). `manual` komt voor als label maar zelden in data.
- `searchContacts` (slice 1, `convex/contacts.ts`) collect't alle workspace-contacten + filtert/sorteert in JS; pure helpers in `convex/contactSearch.ts`. UI-toolbar in `crm.contacts.tsx` met zoek/sorteer/plaats/toggles.

## Gewenste situatie

### 1. Schema + ingest
- `leadAttribution` + `workspaceId: v.optional(v.id("workspaces"))` (optioneel voor backward-compat tijdens backfill) + index `by_workspace`.
- De 2 live inserts (`websiteLeads`, `metaProcessor`) krijgen `workspaceId: workspace._id`.

### 2. Backfill
- `internalMutation backfillLeadAttributionWorkspace` (in `convex/migration.ts`, het backfill-huis): pak tot 500 rijen met `workspaceId === undefined`, haal per rij de contact op, patch `workspaceId = contact.workspaceId` (rijen met onvindbaar contact → markeer overgeslagen, niet eindeloos herhalen). Returnt `{ processed, remaining, skipped }`. Run herhaald via `npx convex run migration:backfillLeadAttributionWorkspace` op dev én prod tot `processed === 0`.

### 3. Pure helper
- `buildSourceMap(attributions)` in `convex/contactSearch.ts` → `Map<contactId, source>` waarbij de **oudste** attributie per contact wint (oorspronkelijke bron). Unit-testbaar.

### 4. `searchContacts` uitbreiden
- `filters` + `source: v.optional(v.union(v.literal("meta"), v.literal("api"), v.literal("manual")))`.
- Handler: collect `leadAttribution` via `by_workspace` → `buildSourceMap` → filter ook op `filters.source` (via de map; `contactMatchesFilters` blijft voor on-doc velden) → return per contact `source: sourceMap.get(c._id) ?? null`.

### 5. UI (`crm.contacts.tsx`)
- **Bron-`Select`** in de toolbar: Alle bronnen / Meta / Website / Handmatig (sentinel `__all__`). → `filters.source`.
- **Bron-badge** per rij: `meta`→"Meta", `api`→"Website", `manual`→"Handmatig" (geen badge bij `null`).
- Source toevoegen aan de `filters`-`useMemo` + de limit-reset-deps.

## Data-flow
```
searchContacts({..., filters:{source?}})
  collect contacts + collect leadAttribution by_workspace
    → buildSourceMap (oudste/contact)
    → filter: search && on-doc-filters && (geen source-filter || map.get(id)===source)
    → contacts.slice(limit).map(+source) , total
UI: bron-Select → filters.source ; bron-badge uit contact.source
```

## Wijzigingen (overzicht)
- `convex/schema.ts` — `leadAttribution` + `workspaceId` + index `by_workspace`.
- `convex/websiteLeads.ts` + `convex/metaProcessor.ts` — `workspaceId: workspace._id` in de insert.
- `convex/migration.ts` — + `backfillLeadAttributionWorkspace` internalMutation.
- `convex/contactSearch.ts` (+ `.test.ts`) — + `buildSourceMap`.
- `convex/contacts.ts` — `searchContacts`: source-map + filter + return source.
- `src/routes/crm.contacts.tsx` — bron-Select + bron-badge + filters/deps.

## Edge cases
- **Contact zonder attributie** (bare inbound / handmatig zonder attributie): `source = null` → geen badge; bij actief bron-filter valt 'ie buiten elke specifieke bron.
- **Meerdere attributies per contact:** oudste wint (oorspronkelijke bron). Unit-getest.
- **Backfill rij met onvindbaar contact:** overslaan (geen workspaceId te bepalen), niet eindeloos herhalen.
- **Datavolume:** `searchContacts` leest nu contacts (~6101) + leadAttribution (~enkele honderden) per call — ruim onder Convex' per-query-leeslimiet.

## Out of scope (bewust)
- Denormalisatie van `source` op de contacts-tabel.
- UTM/campagne/ad-niveau-filtering, bron-statistieken.
- `migration.ts:936` ETL-insert aanpassen (dood post-cutover; backfill dekt die rijen).
- Wijziging aan lead-intake-logica (alleen `workspaceId` extra meeschrijven).

## Verificatie
1. `npx vitest run` groen (incl. nieuwe `buildSourceMap`-tests).
2. `npx convex dev --once` schoon; backfill op dev gerund → `remaining 0`. `npm run build` + geen nieuwe tsc-fouten in gewijzigde bestanden.
3. Dev-smoke (browser, `localhost:5173/crm/contacts`): bron-`Select` op Meta → alleen Meta-leads + "Meta"-badges; op Website → "Website"-badges; combineert met zoeken/sorteren; "Alle bronnen" reset.

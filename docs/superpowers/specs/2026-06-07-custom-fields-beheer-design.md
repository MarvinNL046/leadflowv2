# Custom-fields beheer (handmatige velden) — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal, "isManual"-variant) — klaar voor implementatieplan
**Scope:** handmatige custom-fields per workspace definiëren + waardes per contact bewerken — schoon gescheiden van de bestaande (read-only) Meta-form-antwoorden. Vierde Contacts-slice. Laag-risico (additief), normale merge-route na Marvins go.

## Doel
Marvin eigen velden laten definiëren (bv. "Type woning", "Budget") + invullen op contacten. De bestaande "Form-antwoorden"-sectie (Meta-lead-form-antwoorden) blijft **read-only** (je bewerkt geen ingezonden antwoord).

## Huidige situatie (geverifieerd)
- `customFieldDefinitions` (workspaceId, entityType contact/opportunity, key, label, fieldType text/number/boolean/date/select, selectOptions?, isRequired, sortOrder) + `customFieldValues` (definitionId, entityType, entityId(string), value:any). Index `by_workspace_entity`, `by_entity`, `by_definition`.
- `convex/customFields.ts`: alleen `listForContact` (read) + module-helper `requireWorkspaceMembership` (QueryCtx-only). **Geen mutations.** De defs zijn nu Meta-form-velden (uit migratie/sync).
- `crm.contacts_.$id.tsx`: `CustomFieldsSection` toont alléén GEVULDE waardes als "Form-antwoorden" (read-only) + `formatCustomFieldValue`.
- Settings-index (`crm.settings.tsx`): `SECTIONS`-array van kaarten ({to,title,description,icon,iconColor}).

## Gewenste situatie

### 1. Schema
`customFieldDefinitions` + `isManual: v.optional(v.boolean())`. Meta/migratie-defs = undefined/false; handmatige CRUD zet `true`. Additief.

### 2. Pure helpers (`convex/customFieldsLogic.ts`, testbaar)
- `slugifyKey(label): string` — lowercase, niet-alfanumeriek → `_`, collapse/trim. ("Type woning" → "type_woning").
- `validateDefinition({label, fieldType, selectOptions}): string | null` — label 1-40; select vereist ≥1 niet-lege optie; anders null.

### 3. Backend (`convex/customFields.ts`)
- membership-helper verbreden naar `QueryCtx | MutationCtx`.
- **`listForContact` aanpassen:** filter `isManual !== true` → "Form-antwoorden" toont alleen Meta-velden.
- **Nieuw:**
  - `listManualDefinitions({workspaceId})` → manual contact-defs (sortOrder).
  - `listManualForContact({contactId})` → `[{definition, value}]` voor manual contact-defs.
  - `createDefinition({workspaceId, label, fieldType, selectOptions?, isRequired})` → `validateDefinition` (throw bij fout); `key = slugifyKey(label)`, weiger bij bestaande key (workspace+contact); `sortOrder = max+1`; insert `entityType:"contact", isManual:true`.
  - `updateDefinition({definitionId, label?, selectOptions?, isRequired?})` (membership via def→pipeline... def→workspaceId).
  - `deleteDefinition({definitionId})` → verwijder def + z'n `customFieldValues` (by_definition).
  - `setContactValue({contactId, definitionId, value})` → membership; upsert in `customFieldValues` (zoek by_definition + entityId match → patch, anders insert met entityType "contact").

### 4. Frontend
- **Settings** `/crm/settings/custom-fields` (`crm.settings_.custom-fields.tsx`): lijst van manual defs + toevoegen/bewerken/verwijderen (label, fieldType-Select, selectOptions-editor wanneer select, isRequired-toggle). + kaart in de settings-index.
- **Contact-detail** `crm.contacts_.$id.tsx`: nieuwe **`ManualFieldsSection`** (bewerkbaar) — per manual def een `ManualFieldRow` met type-passende input (text/number/checkbox/date/select), save via `setContactValue` (onBlur/onChange + toast). Naast de bestaande (Meta) "Form-antwoorden"-sectie.

## Data-flow
```
settings/custom-fields → create/update/deleteDefinition (isManual:true) → customFieldDefinitions
contact-detail ManualFieldsSection → listManualForContact → per veld input → setContactValue → customFieldValues
"Form-antwoorden" (bestaand) → listForContact (nu isManual!==true) → alleen Meta-velden, read-only
```

## Wijzigingen (overzicht)
- `convex/customFieldsLogic.ts` (+ `.test.ts`) — slugifyKey + validateDefinition.
- `convex/schema.ts` — customFieldDefinitions.isManual.
- `convex/customFields.ts` — membership-verbreding, listForContact-filter, 6 nieuwe fns.
- `src/routes/crm.settings_.custom-fields.tsx` — nieuw, def-CRUD.
- `src/routes/crm.contacts_.$id.tsx` — ManualFieldsSection + ManualFieldRow.
- `src/routes/crm.settings.tsx` — kaart "Custom velden".

## Edge cases
- **Dubbele key** (slug bestaat al): createDefinition weigert met duidelijke fout.
- **fieldType=select zonder opties:** validatie weigert.
- **Bestaande Meta-defs:** `isManual` undefined → blijven in "Form-antwoorden", niet in de manual-lijst/-editor. Geen migratie nodig.
- **deleteDefinition:** cascade de waardes (anders orphan-values).
- **Waarde-types:** value is `v.any()` → text(string)/number/boolean/date(string YYYY-MM-DD)/select(string). UI levert het juiste type.
- **Risico laag:** additief; geen cron/triggers. listForContact-filter verandert "Form-antwoorden" alleen door manual-defs (die er nu niet zijn) uit te sluiten → huidige weergave ongewijzigd.

## Out of scope (bewust)
- Opportunity-custom-fields, drag-reorder van defs, per-veld-rechten, required-enforcement bij contact-create, bulk-set.

## Verificatie
1. `npx vitest run` groen (incl. slugifyKey/validateDefinition-tests).
2. `npx convex dev --once` schoon; `npm run build` + geen nieuwe tsc-fouten in gewijzigde bestanden.
3. Dev-smoke: in `/crm/settings/custom-fields` een veld aanmaken (bv. "Type woning", select met opties) + een tekstveld; op een contact-detail verschijnt de "Eigen velden"-sectie → waarde zetten → herladen → waarde blijft; "Form-antwoorden" (Meta) blijft read-only/ongewijzigd; veld verwijderen → weg + waardes weg; dubbele veldnaam → fout.

# Contacts CSV-import — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** bulk contacten importeren uit een CSV-bestand, met kolom-mapping + dedup. **Alleen contacten — GEEN opportunities/leads en GEEN workflow/AI-triggers** (anti-mass-trigger). Derde Contacts-slice. Laag-risico (additief), normale merge-route na Marvins go.

## Doel
Een lijst (bv. oude klanten voor een onderhoud-campagne) als contacten importeren. Geïmporteerde contacten zijn doorzoekbaar (bron "Handmatig"); opp/lead-aanmaak is bewust uitgesteld.

## Huidige situatie (geverifieerd)
- Geen CSV-lib in `package.json` → hand-rolled parser.
- `convex/contacts.ts`: `create`-mutation met dedup-patroon (email→phone, workspace-scoped, `deletedAt`-filtered, returnt `{contact, isDuplicate}`); module-helper `requireWorkspaceMembership`; `normalizeEmail`/`normalizePhone` geïmporteerd uit `./lib/phone`.
- `leadAttribution` heeft `workspaceId` + `source` ("meta"|"api"|"manual") (na de bron-slice) → import = `"manual"` → "Handmatig"-badge/filter.
- Contacts-pagina (`crm.contacts.tsx`): header `flex justify-between` met links de titel, rechts vrij → plek voor een "Importeren"-knop. Route-conventie: `crm.contacts_.$id.tsx` → `/crm/contacts/$id`.
- `vitest.config.ts` globt `src/**/*.test.ts` (sinds de Contacts-zoek-slice) → `src/lib/csv.test.ts` draait mee.

## Gewenste situatie

### 1. Pure parser (testbaar)
`src/lib/csv.ts` → `parseCsv(text: string): string[][]`. State-machine: velden komma-gescheiden; veld optioneel dubbel-aangehaald; aangehaald veld mag komma's, newlines en escaped quotes (`""`) bevatten; rij-einde `\n` of `\r\n`; volledig lege (trailing) regels overslaan. Returnt rijen (array van cel-strings). De caller behandelt rij 0 als headers.

### 2. Backend mutation (`convex/contacts.ts`)
`importContacts({ workspaceId, contacts: Array<{firstName?,lastName?,email?,phone?,company?,city?}> })`:
- membership-check; weiger bij `contacts.length > 500` (client batcht per 100).
- per rij: ≥1 identifier (naam/email/phone) anders `skipped++`; normaliseer email/phone; dedup tegen DB (email dan phone, deletedAt-filtered) **én** binnen de batch (`seenEmail`/`seenPhone`-sets) → bij duplicaat `skipped++`; anders insert contact (`callCount:0`) + `leadAttribution {workspaceId, source:"manual"}` → `imported++`.
- **GEEN** opportunity, **GEEN** `triggerContactCreated`, **GEEN** workflow/AI.
- Returnt `{ imported, skipped }`.

### 3. Frontend (`/crm/contacts/import`)
Nieuwe route `crm.contacts_.import.tsx` + "Importeren"-`Link`-knop in de Contacts-header. Stappen in één pagina (state-machine):
1. **Upload**: `<input type="file" accept=".csv">` → `FileReader.readAsText` → `parseCsv` → `headers = rows[0]`, `dataRows = rows.slice(1)`.
2. **Mapping**: per contact-veld (Voornaam/Achternaam/E-mail/Telefoon/Bedrijf/Plaats) een `Select` van CSV-kolommen (+ "—" = niet mappen). Auto-gok op header-naam (synoniemen-map, bv. email←email/e-mail/mail; firstName←voornaam/first name; etc.).
3. **Preview**: eerste 5 `dataRows` gemapt in een tabelletje.
4. **Importeren**: bouw contact-objecten uit `dataRows` via de mapping (lege velden → undefined; rijen zonder enige identifier worden client-side al overgeslagen-geteld); batch per 100 → `importContacts` per batch → accumuleer `{imported, skipped}`; toon voortgang + resultaat-samenvatting.

### 4. Contacts-header
Een `<Link to="/crm/contacts/import">` "Importeren"-knop rechts in de header (naast de titel).

## Data-flow
```
.csv → FileReader → parseCsv → headers + dataRows
   → kolom-mapping (auto-gok) → preview
   → per batch(100): importContacts({workspaceId, contacts})
        membership · ≥1 identifier · normaliseer · dedup(DB+batch) · insert + leadAttribution(manual)
   → {imported, skipped} geaccumuleerd → samenvatting
```

## Wijzigingen (overzicht)
- `src/lib/csv.ts` (+ `.test.ts`) — `parseCsv`.
- `convex/contacts.ts` — `importContacts` mutation.
- `src/routes/crm.contacts_.import.tsx` — import-pagina.
- `src/routes/crm.contacts.tsx` — "Importeren"-knop in de header.

Geen schema-wijziging (leadAttribution.workspaceId + contacts bestaan al).

## Edge cases
- **Rij zonder identifier** (alle gemapte velden leeg): overslaan + tellen als skipped.
- **Duplicaten** (DB of binnen batch, op genormaliseerde email/phone): skip, niet inserten.
- **CSV zonder header / 1 kolom / rare quotes**: parser robuust; mapping toont de kolommen zoals geparsed.
- **Groot bestand**: client batcht per 100; mutation weigert >500/call. (Zeer grote bestanden: meerdere batches; UI toont voortgang.)
- **Geen workspace / niet ingelogd**: standaard guard zoals andere pagina's.
- **Risico laag**: puur additief; geen cron; geen triggers → geen mass-SMS/mail.

## Out of scope (bewust)
- Opp/lead-/pipeline-toewijzing van geïmporteerde contacten (apart, mét no-trigger-veiligheid).
- xlsx/Excel, kolom-mapping onthouden, "bestaande bijwerken" (alleen skip-bij-duplicaat), undo/rollback van een import.

## Verificatie
1. `npx vitest run` groen (incl. `parseCsv`-tests: quotes, komma-in-veld, escaped quote, CRLF, embedded newline, lege regels).
2. `npx convex dev --once` schoon; `npm run build` + geen nieuwe tsc-fouten in gewijzigde bestanden.
3. Dev-smoke: een test-CSV uploaden → kolommen auto-gemapt + corrigeerbaar → preview klopt → importeren → samenvatting (X geïmporteerd, Y overgeslagen); de nieuwe contacten verschijnen in de lijst met "Handmatig"-bron-badge; een tweede import van hetzelfde bestand → alles overgeslagen (dedup).

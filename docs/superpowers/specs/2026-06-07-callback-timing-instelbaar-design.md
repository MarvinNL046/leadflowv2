# Callback-timing instelbaar — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** de hardcoded callback-knoppen (`PRESETS` in `callback-options.tsx`) + de hardcoded 7-dagen safety-net instelbaar maken per workspace, onder `/crm/settings/lead-flow`. Eerste lead-flow-instelbaar-slice. GEEN merge/prod zonder Marvins go (laag-risico).

## Doel
Bij "Heeft opgenomen → bel later" kiest de gebruiker een terugbel-periode uit vaste knoppen (1/3/7/14/30 dagen, hardcoded). Maak die lijst configureerbaar + maak de 7-dagen "klant belt zelf terug"-safety-net een setting.

## Huidige situatie (geverifieerd)
- `convex/crmSettings.ts`: `DEFAULT_SETTINGS` (maxCallAttempts/defaultFollowUpDays/followUpReminderDays/timezone), `get`-query (defaults toegepast), `update`-mutation (validatie + upsert), `getEffectiveSettings` (voor mutations). Membership-checked. `crmSettings`-tabel.
- `src/components/crm/lead-dialog/views/callback-options.tsx`: `const PRESETS = [{days:1,'Morgen'},{days:3,…},{days:7,…},{days:14,…},{days:30,…}]` hardcoded; `CallbackOptionsView({ processing, onPick })`.
- `src/components/crm/lead-dialog/index.tsx`: heeft `workspaceId` (regel 53); rendert `<CallbackOptionsView onPick={(days)=>recordCallAnswered({outcome:'callback', followUpAt: now+days})} />`.
- `convex/contacts.ts` `recordCallAnswered`: laadt **geen** settings; 2× hardcoded `7 * 24 * 60 * 60 * 1000` (regel ~804 customer_will_callback safety-net, ~809 callback-default). `getEffectiveSettings` is al geïmporteerd in contacts.ts.
- `src/routes/crm.settings_.lead-flow.tsx`: form met `Field` (number-input) per setting + één `update`-save.

## Gewenste situatie

### 1. Pure helper + default (testbaar)
`convex/crmSettingsLogic.ts` (geen Convex-imports → unit-testbaar):
- `DEFAULT_CALLBACK_PRESETS = [{days:1,label:'Morgen'},{days:3,'Over 3 dagen'},{days:7,'Over een week'},{days:14,'Over 2 weken'},{days:30,'Over een maand'}]`.
- `validateCallbackPresets(presets): string | null` — `null` als geldig, anders foutmelding. Regels: ≤8 items; elk `days` geheel 1-365; `label` getrimd 1-40 tekens; `days` uniek. Lege lijst toegestaan (UI valt terug op default).

### 2. Schema
`crmSettings` + `callbackPresets: v.optional(v.array(v.object({ days: v.number(), label: v.string() })))` + `customerCallbackDays: v.optional(v.number())`. Additief.

### 3. Backend (`convex/crmSettings.ts`)
- `DEFAULT_SETTINGS` + `customerCallbackDays: 7`.
- `get`: returnt `callbackPresets: settings?.callbackPresets?.length ? settings.callbackPresets : DEFAULT_CALLBACK_PRESETS` + `customerCallbackDays: settings?.customerCallbackDays ?? 7`.
- `update`: args + `callbackPresets` + `customerCallbackDays`; valideer presets via `validateCallbackPresets` (throw bij fout) + `customerCallbackDays` 1-60; patch beide.
- `getEffectiveSettings`: + `customerCallbackDays` in return.

### 4. Backend wiring (`convex/contacts.ts` `recordCallAnswered`)
Laad `const settings = await getEffectiveSettings(ctx, contact.workspaceId);` boven in de handler; vervang de 2 hardcoded `7 * 24 * 60 * 60 * 1000` door `settings.customerCallbackDays * 24 * 60 * 60 * 1000`.

### 5. Frontend
- `callback-options.tsx`: prop `presets: Array<{days:number; label:string}>`; render die i.p.v. de hardcoded `PRESETS` (de module-const blijft als interne fallback voor `presets?.length ? presets : DEFAULT`).
- `lead-dialog/index.tsx`: `const settings = useQuery(api.crmSettings.get, workspaceId ? { workspaceId } : 'skip')`; geef `presets={settings?.callbackPresets ?? []}` mee aan `CallbackOptionsView`.
- `crm.settings_.lead-flow.tsx`: (a) extra `Field` "Safety-net klant-belt-terug (dagen)" → `customerCallbackDays` (1-60); (b) een **lijst-editor**-Card "Terugbel-knoppen": per preset een rij (number-input dagen + text-input label + verwijder-knop) + "Knop toevoegen". State `callbackPresets`; meegestuurd in `update`.

## Data-flow
```
settings/lead-flow → update({callbackPresets, customerCallbackDays, …})
   validateCallbackPresets (throw bij fout)
lead-dialog → crmSettings.get → callbackPresets → CallbackOptionsView toont de knoppen
recordCallAnswered → getEffectiveSettings.customerCallbackDays voor de safety-net
```

## Wijzigingen (overzicht)
- `convex/crmSettingsLogic.ts` (+ `.test.ts`) — DEFAULT_CALLBACK_PRESETS + validateCallbackPresets.
- `convex/schema.ts` — crmSettings + callbackPresets + customerCallbackDays.
- `convex/crmSettings.ts` — get/update/getEffectiveSettings/DEFAULT_SETTINGS.
- `convex/contacts.ts` — recordCallAnswered leest customerCallbackDays.
- `src/components/crm/lead-dialog/views/callback-options.tsx` — presets-prop.
- `src/components/crm/lead-dialog/index.tsx` — query + presets doorgeven.
- `src/routes/crm.settings_.lead-flow.tsx` — Field + lijst-editor.

## Edge cases
- **Lege callbackPresets** (opgeslagen []): `get` valt terug op DEFAULT_CALLBACK_PRESETS → lead-dialog houdt altijd knoppen.
- **Settings nog aan 't laden** in de lead-dialog: `presets ?? []` → kort geen knoppen; CallbackOptionsView valt terug op default-const indien leeg.
- **Bestaande data**: rows zonder de nieuwe velden → defaults (7d, default-presets). Geen migratie.
- **Risico laag**: additieve settings met defaults = huidig gedrag; geen cron. `recordCallAnswered` 7→setting (default 7) = identiek.

## Out of scope (bewust)
- Dashboard-window (90d) — werkt al via `.take(400)`, behaviour-change → aparte slice.
- `sendEmailOnUnreachable` auto-afscheidsmail — nieuwe behaviour → aparte slice.
- Per-preset reorder/kleur; callback-default vs safety-net splitsen (één `customerCallbackDays` dekt beide).

## Verificatie
1. `npx vitest run` groen (incl. `validateCallbackPresets`-tests).
2. `npx convex dev --once` schoon; `npm run build` + geen nieuwe tsc-fouten in gewijzigde bestanden.
3. Dev-smoke: in `/crm/settings/lead-flow` een callback-knop wijzigen/toevoegen + safety-net-dagen wijzigen → opslaan; in de lead-dialog ("Bel" → opgenomen → bel later) verschijnen de nieuwe knoppen; validatie weigert ongeldige presets (bv. days 0 of dubbele days).

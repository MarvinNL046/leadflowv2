# Per-workspace bedrijfsnaam (email `{{company}}`) — Design

**Status:** goedgekeurd (Marvin, 2026-06-07)

## Probleem

De `{{company}}`-template-variabele in e-mails is hardcoded op
`"Staycool Airconditioning"` — in **beide** render-twins (`convex/templateRender.ts`
`leadTemplateVars` + `src/lib/templates.ts` `leadTemplateVars`). Elke e-mail die een
workspace verstuurt (auto-afscheidsmail backend, compose-view, template-preview) zet dus
"Staycool Airconditioning" als afzender-bedrijf. Voor multi-tenant SaaS is dat een lek:
elke nieuwe klant krijgt StayCool's naam in z'n e-mails.

`bookingUrl` + `signature` zijn al per-workspace instelbaar via de `aiAgentConfig`-tabel;
de resterende hardcoded varianten daarvan zitten in het AI/workflow-subsysteem (gevoelig,
al overschrijfbaar) → buiten scope.

## Doel

Maak de bedrijfsnaam voor `{{company}}` per workspace instelbaar, met de **org-naam als
default** (`orgs.name`, bestaat al) → nul handmatige setup, geen leak voor nieuwe tenants.

## Niet-doelen (YAGNI)

- `bookingUrl` / `signature` (al per-workspace via aiAgentConfig).
- De 2 hardcoded bookingUrl-fallbacks in workflows.ts / aiLeadResponse (AI-subsysteem) →
  aparte follow-up.
- Geen aparte "Bedrijfsgegevens"-pagina; één veld op de bestaande templates-settings-pagina.

## Architectuur

1. **Schema:** `crmSettings.companyName: v.optional(v.string())`.
2. **`crmSettings.ts`:**
   - `get` + `getEffectiveSettings` resolven `companyName = settings?.companyName ??
     org.name` (laad `workspace` via `ctx.db.get(workspaceId)` → `org` via
     `ctx.db.get(workspace.orgId)` → `org.name`; ultieme fallback `""`). Beide krijgen
     `companyName: string` in de return (+ -type).
   - `update`-args + patch: `companyName: v.optional(v.string())` (trim; leeg = wissen →
     terug naar org-default).
3. **Render-helpers** (in sync gehouden):
   - `convex/templateRender.ts`: `leadTemplateVars(lead, company: string)` — `company`-param
     i.p.v. de hardcoded string.
   - `src/lib/templates.ts`: idem; `renderTemplateForChannel` geeft de company door.
4. **Callers passen de resolved company door:**
   - Backend afscheidsmail (`convex/contacts.ts`): `companyName` uit `getEffectiveSettings`
     → `leadTemplateVars(lead, companyName)`.
   - Frontend compose (`message-compose.tsx`) + template-preview
     (`crm.settings_.templates.tsx`): lezen `crmSettings.get().companyName` → doorgeven.
5. **UI:** "Bedrijfsnaam (voor `{{company}}` in e-mails)"-veld op de templates-settings-pagina
   (`crm.settings_.templates.tsx`), met de org-naam als placeholder.

## Gedragseffect

Voor StayCool (org.name = "Staycool Airconditioning") functioneel ongewijzigd. Nieuwe
tenants krijgen automatisch hun eigen org-naam in `{{company}}`, of een eigen override.

## Testing

- **Unit:** kleine test dat `leadTemplateVars(lead, "Acme")` → `renderTemplate("{{company}}")`
  = "Acme" (backend-twin). Bestaande templateRender-tests aanpassen aan de nieuwe signatuur.
- **Build-gates:** vitest · `convex dev --once` · build · tsc (geen nieuwe fouten).
- **Reversibele CLI-smoke:** `convex/__debug.ts` internalQuery/mutation die een throwaway
  org (naam "Acme BV") + workspace maakt en `getEffectiveSettings` aanroept → assert
  `companyName === "Acme BV"` (org-default); zet daarna `crmSettings.companyName = "Acme
  Cooling"` → assert override wint; ruimt op. Daarna debug-file weg.
- **UI-smoke (browser, reversibel):** op de templates-pagina companyName zetten →
  preview/`{{company}}` toont de waarde; wissen → terug naar org-naam-placeholder.

## Risico's

- Laag/additief. Signatuur-wijziging van `leadTemplateVars` raakt alle callers (geteld:
  backend afscheidsmail + frontend compose + preview + intern renderTemplateForChannel) —
  allemaal in dit plan meegenomen. Default = org.name → bestaand gedrag voor StayCool
  ongewijzigd.

# Messages — Reply-templates in de inbox-compose — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** de bestaande email-templates bereikbaar maken vanuit de Messages-inbox-compose (`ReplyForm` in `src/routes/crm.messages.tsx`), zodat collega's veelvoorkomende antwoorden niet elke keer overtypen. Tweede slice van de Messages-parity (na inbox-completeness). GEEN merge/prod zonder Marvins go.

## Doel
Eén gat dichten: de inbox-compose is nu vrije tekst. Voeg een **template-picker** toe die een bestaande template rendert (variabelen ingevuld op de contact van het gesprek) en de compose-velden vult — platte tekst voor SMS/WhatsApp, subject + platte-tekst-body voor e-mail.

## Huidige situatie (geverifieerd)
- **Templates bestaan al en zijn instelbaar:** `emailTemplates`-tabel (`name`, `subject`, `body` (HTML), `description`, `isSystem`) + beheer-UI op `/crm/settings/templates`. Query `api.emailTemplates.list({ workspaceId })` → `Doc<'emailTemplates'>[]` gesorteerd op naam (membership-checked).
- **Helpers bestaan al** in `src/lib/templates.ts`: `renderTemplate(template, vars)` (regex `{{path}}`-substitutie, ontbrekend → lege string), `htmlToPlainText(html)`, `leadTemplateVars({ firstName, lastName, email, phone, city, company })` → `{ contact: {...}, company: 'Staycool Airconditioning' }`.
- **De inbox-compose (`ReplyForm`)** krijgt de volledige `contact: Doc<'contacts'>` mee, heeft state `channel` (`'email'|'sms'|'whatsapp'`), `subject`, `body`, `sending`, en verstuurt via `api.messaging.send` (`{ contactId, channel, body, subject? }`). E-mail toont een subject-`Input`; alle kanalen een body-`textarea`. **Geen** template-gebruik in deze component (vrije tekst).
- **E-mail vanuit de inbox is platte tekst:** `ReplyForm` zet nooit `htmlBody` op `send` — alleen `body`. Dus de picker hoeft geen HTML te behouden.
- **Contact-velden matchen `leadTemplateVars` 1-op-1:** `contacts` heeft `firstName/lastName/email/phone/city/company` (allemaal `v.optional(v.string())`).
- **UI-primitives:** `src/components/ui/dropdown-menu.tsx` exporteert de shadcn-set (`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, …). lucide-icons worden al per-import gebruikt.
- **Test-infra:** `vitest.config.ts` globt **alleen** `convex/**/*.test.ts` (env: node). Een pure-function-test in `src/` draait dus nu niet mee — moet worden toegevoegd.

## Gewenste situatie

### 1. Pure render-helper (testbaar, geïsoleerd)
Nieuwe pure functie in `src/lib/templates.ts`:

```ts
renderTemplateForChannel(
  template: { subject: string; body: string },
  contact: { firstName?…; lastName?…; email?…; phone?…; city?…; company?… },
  channel: 'email' | 'sms' | 'whatsapp',
): { body: string; subject?: string }
```

Logica: bouw vars met `leadTemplateVars`; `body = htmlToPlainText(renderTemplate(template.body, vars))`; voor `channel === 'email'` ook `subject = renderTemplate(template.subject, vars)`, anders geen `subject`. Geen DOM/React → unit-testbaar onder node-env.

### 2. Template-picker in `ReplyForm` (UI)
- **Query:** `const templates = useQuery(api.emailTemplates.list, { workspaceId: contact.workspaceId })`.
- **Trigger:** een `DropdownMenu` met een kleine knop ("Template", met een lucide-icoon, zelfde stijl als de kanaal-knoppen) **in de kanaal-rij**, ná de drie kanaal-knoppen en vóór de `ml-auto` recipient-span.
- **Loading** (`templates === undefined`): trigger disabled.
- **Leeg** (`templates.length === 0`): dropdown toont één disabled item dat naar `/crm/settings/templates` linkt ("Nog geen templates — maak ze in Instellingen").
- **Gevuld:** elke template als `DropdownMenuItem` (op `name`); klik → `handlePick(tpl)`.

### 3. Invoeg-gedrag (overschrijven met bevestiging bij bestaande tekst)
`handlePick(tpl)`:
- Bereken `hasContent = body.trim().length > 0 || (channel === 'email' && subject.trim().length > 0)`.
- `applyTemplate(tpl)` = `const r = renderTemplateForChannel(tpl, contact, channel); setBody(r.body); if (r.subject !== undefined) setSubject(r.subject)`.
- `!hasContent` → meteen `applyTemplate(tpl)` + `toast.success('Template "<naam>" ingevoegd')`.
- `hasContent` → **geen native dialog**; `toast('Bestaande tekst overschrijven met "<naam>"?', { action: { label: 'Overschrijven', onClick: () => applyTemplate(tpl) } })`. Annuleren = toast wegklikken/laten verlopen.

### 4. Kanaal-wissel ná invoegen
De picker rendert op het **op-dat-moment** gekozen kanaal. Wisselt de gebruiker daarna van kanaal, dan blijft de ingevoegde tekst staan (geen automatische her-render) — consistent met hoe `subject`/`body` nu al blijven staan bij kanaal-wissel. Subject-veld is alleen zichtbaar bij e-mail (bestaand gedrag); een gerenderd subject dat "verborgen" raakt bij wissel naar SMS wordt simpelweg niet meegestuurd (bestaand `send`-gedrag).

## Data-flow
```
klik template-item → handlePick(tpl)
  hasContent? nee → applyTemplate → setBody/setSubject + toast "ingevoegd"
            ja  → toast met "Overschrijven"-actie → (klik) applyTemplate
applyTemplate → renderTemplateForChannel(tpl, contact, channel)
  channel sms/wa  → { body: plain-text }            → setBody
  channel email   → { body: plain-text, subject }   → setBody + setSubject
→ gebruiker tweakt → bestaande Verstuur-flow (api.messaging.send) ongewijzigd
```

## Wijzigingen (overzicht)
- `vitest.config.ts`: `include` uitbreiden met `src/**/*.test.ts` (pure-function tests; node-env blijft).
- `src/lib/templates.ts`: + `renderTemplateForChannel`.
- `src/lib/templates.test.ts`: nieuw — unit-tests voor `renderTemplateForChannel`.
- `src/routes/crm.messages.tsx`: imports (DropdownMenu-set, template-icoon, `renderTemplateForChannel`); in `ReplyForm` de query + `applyTemplate`/`handlePick` + de DropdownMenu-UI.

Geen schema-wijziging, geen Convex-wijziging, geen nieuwe mutation/query (hergebruik `emailTemplates.list`).

## Edge cases
- **Geen contact-velden ingevuld:** `renderTemplate` vervangt onbekende `{{...}}` door lege string (bestaand gedrag) — geen "undefined" in de tekst.
- **Template met lege body/subject:** `update`-mutation verbiedt dat al; de picker hoeft het niet af te vangen.
- **Workspace zonder templates:** dropdown-empty-state met link naar Instellingen (geen doodlopende disabled knop).
- **`htmlBody` blijft ongebruikt:** e-mail vanuit de inbox blijft platte tekst (bestaand gedrag) — rich-HTML-compose is out of scope.
- **Lange template-lijst:** `DropdownMenuContent` met `max-h-64 overflow-y-auto`.

## Out of scope (bewust)
- De brittle hardcoded template-namen in de lead-dialog-views (`"Niet Bereikt"`, `"Buiten Werkgebied"`, `"Afscheidsmail (Deal Verloren)"`) die breken bij hernoemen — los staand van de inbox, aparte follow-up.
- Nieuwe template-aanmaak/bewerk-UI (bestaat al op `/crm/settings/templates`).
- Aparte "snelantwoorden"-tabel / kanaal-tagging van templates (overwogen, afgewezen — YAGNI; kan later via hybride-model).
- Rich-text/HTML-e-mail vanuit de inbox, cursor-positie-invoegen, per-kanaal template-filtering, AI-conversatie (latere slices).

## Verificatie
1. `npx vitest run` groen (incl. de nieuwe `src/lib/templates.test.ts`).
2. `npx convex dev --once` schoon + `npm run build` (`✓ built`) + geen nieuwe tsc-fouten in gewijzigde bestanden.
3. Dev-smoke (browser, ingelogd op `localhost:5173/crm/messages`): open een gesprek → kanaal WhatsApp → Template-knop → kies template → body krijgt platte tekst met ingevulde naam, geen subject; kanaal e-mail → kies template → subject + body gevuld; bij al-getypte tekst → "Overschrijven"-toast i.p.v. stil overschrijven; workspace-empty-state toont link naar Instellingen (indien testbaar).

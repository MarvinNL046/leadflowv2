# Auto-afscheidsmail bij 3-strike — Design

**Datum:** 2026-06-07
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** optioneel automatisch de "Afscheidsmail (Deal Verloren)"-template e-mailen wanneer een lead bij de 3e mislukte belpoging onbereikbaar wordt. Maakt de lead-flow compleet. **Opt-in, default UIT** (outward-action). Normale merge-route na Marvins go.

## Doel
Marvin bespaart handmatig werk: cold leads (3-strike) krijgen automatisch een nette afscheidsmail. Volledig opt-in.

## Huidige situatie (geverifieerd)
- `recordCallNoAnswer` (`convex/contacts.ts`): laadt `settings` (getEffectiveSettings). Bij `isFinalStrike` (`newCount >= maxCallAttempts`): zet `unreachable=true`, opp → Lost, schedulet `internal.workflowEngine.triggerLeadUnreachable`. `contact` is de **pre-patch** waarde → `contact.unreachable` = oude waarde (transitie-detectie mogelijk).
- `messaging.sendInternal` (internalAction): `{contactId, channel, body, subject?, htmlBody?}` → email via `sendViaResend({subject, text: body, html: htmlBody})`. htmlBody wordt dus als HTML verstuurd.
- `emailTemplates`: "Afscheidsmail (Deal Verloren)"-template bestaat (per workspace, by name). Geen backend template-render (`src/lib/templates.ts` is frontend-only).
- `crmSettings` heeft al `customerCallbackDays`/`callbackPresets` etc. (zelfde plumbing-patroon voor een nieuwe setting).

## Gewenste situatie

### 1. Setting
`crmSettings.sendEmailOnUnreachable: v.optional(v.boolean())` (default false). Toegevoegd aan `DEFAULT_SETTINGS`, `get`, `update`, `getEffectiveSettings`.

### 2. Pure render-helpers (backend-twin, testbaar)
`convex/templateRender.ts` — kopie van de 3 helpers uit `src/lib/templates.ts` (Convex kan niet uit `src/` importeren):
- `renderTemplate(template, vars)` (regex `{{path}}`-substitutie).
- `htmlToPlainText(html)`.
- `leadTemplateVars(lead)` → `{contact:{...}, company:'Staycool Airconditioning'}`.

### 3. Backend — final-strike send
In `recordCallNoAnswer`, ín het bestaande `if (isFinalStrike)`-blok (ná de `triggerLeadUnreachable`-schedule), als `settings.sendEmailOnUnreachable && !contact.unreachable && contact.email`:
- haal de "Afscheidsmail (Deal Verloren)"-template (emailTemplates by_workspace, case-insensitive find); **niet gevonden → skip** (geen crash).
- `vars = leadTemplateVars(contact)`; `subject = renderTemplate(tmpl.subject, vars)`; `html = renderTemplate(tmpl.body, vars)`.
- `ctx.scheduler.runAfter(0, internal.messaging.sendInternal, { contactId, channel:"email", subject, body: htmlToPlainText(html), htmlBody: html })`.
- Gate `!contact.unreachable` = alleen bij de **transitie** naar onbereikbaar → geen dubbele mail.

### 4. UI
`/crm/settings/lead-flow`: een toggle "Auto-afscheidsmail bij 3e mislukte belpoging" → `sendEmailOnUnreachable` (state + load + save + resetToDefaults).

## Data-flow
```
3e "Niet bereikt" → recordCallNoAnswer → isFinalStrike
   unreachable=true · opp→Lost · triggerLeadUnreachable
   if sendEmailOnUnreachable && !was-unreachable && email:
      template → render(subject/html) → scheduler → sendInternal(email) → Resend
```

## Wijzigingen (overzicht)
- `convex/templateRender.ts` (+ `.test.ts`) — render-helpers.
- `convex/schema.ts` — crmSettings.sendEmailOnUnreachable.
- `convex/crmSettings.ts` — DEFAULT_SETTINGS/get/update/getEffectiveSettings.
- `convex/contacts.ts` — recordCallNoAnswer final-strike e-mail + imports.
- `src/routes/crm.settings_.lead-flow.tsx` — toggle.

## Edge cases
- **Default uit:** geen gedragswijziging tot Marvin 'm aanzet.
- **Geen e-mail op contact:** skip (geen send).
- **Template ontbreekt:** skip (geen crash).
- **Transitie-gate:** alleen bij de eerste keer onbereikbaar → geen dubbele mail bij een eventuele her-call.
- **Async:** scheduler.runAfter(0, …) → de mutation blijft snel; de send draait in een aparte action (zoals triggerLeadUnreachable).
- **Risico:** outward-action, maar opt-in/default-uit + gegate; geen schema-migratie.

## Out of scope (bewust)
- SMS/WhatsApp-afscheidsbericht, keuze van een andere template, undo, per-stage afscheid.

## Verificatie
1. `npx vitest run` groen (incl. templateRender-tests).
2. `npx convex dev --once` schoon; `npm run build` + geen nieuwe tsc-fouten in gewijzigde bestanden.
3. Dev-smoke: toggle AAN in lead-flow-settings; op een **test-contact mét test-e-mailadres** 3× "Niet bereikt" → bij de 3e: een `messages`-row (channel email, status) + `npx convex logs` toont de sendInternal-run (geen echte persoon mailen). Toggle UIT → geen mail bij 3-strike.

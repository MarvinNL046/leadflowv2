# AI-reactie als Workflow-node — consolidatie AI-agent ↔ Workflows (Design)

**Datum:** 2026-06-05
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** de standalone AI lead-response agent omvormen tot één samenhangend geheel met de Workflows-builder. GEEN prod-deploy/merge zonder Marvins go.

## Doel

Eén plek per concept i.p.v. twee plekken die hetzelfde doen. De AI-eerste-reactie wordt een **node** in de workflow-builder ("AI-reactie"); de AI-**instellingen** (key/context/guardrails) blijven workspace-breed in Settings. Zo verdwijnt het dubbel-versturen-risico en kan AI op élke trigger worden ingezet (nieuwe lead, opp verloren, follow-up due, …).

## Huidige situatie

- **Standalone agent** (`convex/aiLeadResponse.ts`): `handleNewLead` (internalAction) wordt direct getriggerd vanuit `convex/metaProcessor.ts` via `scheduler.runAfter(0, internal.aiLeadResponse.handleNewLead, …)` bij lead-intake. Bevat de hele orchestratie: config-check → dedup → quiet-hours → dagcap → `pickChannel` → `buildPrompt` → `callAnthropic` → suggest (record `pending`) of auto (`messaging.sendInternal` + record `sent`/`failed`).
- **Config** (`aiLeadResponseConfigs`, één per workspace): `enabled`, `mode`, `channelOrder`, `bookingUrl`, `model`, `anthropicApiKeyEncrypted`, `businessContext`, `tone`, `signature`, `whatsappTemplateName`, `quietHoursStart/End`, `dailyCap`.
- **Workflow-engine** (`convex/workflowEngine.ts`): `runNode` (internalAction) met een switch op `node.type` (`trigger`/`action`/`condition`/`delay`); `action` heeft een sub-switch op `subType` (`send_email`/`send_sms`/`send_whatsapp` → `messaging.sendInternal`). Geen AI-node. Triggers (`triggerContactCreated` etc.) matchen actieve workflows op `triggerConfig.type` en starten een `workflowExecutions`-run.
- **Workflow-data:** tabellen `workflows` (status, triggerConfig), `workflowNodes` (`type`, `subType`, `config: any`), `workflowEdges`. Node-config zit in `workflowNodes.config`.
- **Builder-UI** (`src/components/crm/new-workflow-dialog.tsx`): lineaire builder met `NODE_TEMPLATES` (delay, send_email, send_sms, send_whatsapp). Mutations `workflows.createLinear` / `workflows.replaceContent`.
- **Suggest-UI:** lead-kaart-concept-block (op main) + de net-gebouwde Concepten-tab/sidebar-badge (branch `feat/crm-ui-lead-card-concepten`) lezen `aiSuggestedResponses` (status `pending`). Blijft ongewijzigd werken.
- **Belangrijk:** de agent draait nu **dormant** (`enabled=false`/`mode=suggest`, geen config-rij op prod) → er is **geen live gedrag om te behouden**; schone overgang mogelijk.

## Gewenste situatie

### Laag 1 — "AI-instellingen" (workspace-breed, in Settings)

`/crm/settings/ai-agent` → hernoemd naar **AI-instellingen**. Houdt de KERN: `anthropicApiKeyEncrypted`, `businessContext`, `tone`, `signature`, `model`, + guardrails `quietHoursStart/End`, `dailyCap`, dedup-venster (impliciet 24u). Dit is het "brein + de veiligheidsrails", één per workspace.

**Verhuist WEG uit de config-tabel** (naar node-niveau): `mode`, `channelOrder`, `bookingUrl`, `whatsappTemplateName`. Het veld `enabled` vervalt (de workflow-status active/paused bepaalt of AI vuurt).

### Laag 2 — "AI-reactie"-node (per node, in de builder)

Nieuw node-`subType: "ai_response"` (onder `type: "action"`). Node-`config`:
- `mode`: `"suggest" | "auto"`
- `channelOrder`: `Channel[]` (of leeg = workspace-default — voor nu: expliciet per node)
- `bookingUrl`: string (doel-link)
- `whatsappTemplateName?`: string
- `goal?`: korte instructie/intentie (optioneel; vult de prompt aan)

### Engine

Nieuwe case in `runNode` (`workflowEngine.ts`): `subType === "ai_response"` → roept de herbruikbare interne functie **`runAiResponse(ctx, { contactId, workspaceId, nodeConfig })`** aan. Deze functie wordt geëxtraheerd uit het huidige `handleNewLead`: leest AI-instellingen (key/context/tone/model/guardrails) workspace-breed + de node-config (mode/kanaal/doel), draait guardrails (dedup/quiet-hours/dagcap), `buildPrompt`, `callAnthropic`, en suggest (`pending`-record) of auto (`sendInternal` + `sent`/`failed`). Logt naar `workflowExecutionLogs` (zoals andere nodes).

### Migratie van de standalone trigger

- Verwijder de directe `scheduler.runAfter(0, internal.aiLeadResponse.handleNewLead, …)` uit `metaProcessor.ts`. Lead-intake roept al `triggerContactCreated` aan → de workflow-engine pakt het op.
- `handleNewLead` zelf vervalt als publiek trigger-pad; de orchestratie-kern leeft voort als `runAiResponse` (door de node aangeroepen).
- Een **"AI eerste reactie op nieuwe lead"**-workflow (trigger `contact_created` → AI-reactie-node, mode `suggest`) levert exact dezelfde functie als de oude standalone agent.

### Builder-UI

`new-workflow-dialog.tsx`: voeg "AI-reactie" toe aan `NODE_TEMPLATES` met config-UI (mode-select, kanaalvolgorde, bookingUrl, optioneel goal). `createLinear`/`replaceContent` slaan de node-config op in `workflowNodes.config`.

### Starter-knop

In AI-instellingen een knop **"Maak 'AI eerste reactie'-workflow"** → mutation die een kant-en-klare workflow aanmaakt (trigger `contact_created` → AI-reactie-node, mode `suggest`, default kanaal/bookingUrl). Zodat Marvin niet from-scratch hoeft te bouwen.

## Data-flow (na consolidatie)

```
lead-intake (metaProcessor / website-form)
   └─► triggerContactCreated(workspaceId, contactId)
          └─► workflow-engine: match actieve workflows op trigger
                 └─► runNode(...) → subType "ai_response"
                        └─► runAiResponse(ctx, {contactId, workspaceId, nodeConfig})
                               • AI-instellingen (workspace): key/context/tone/model/guardrails
                               • nodeConfig: mode/channelOrder/bookingUrl/goal
                               • guardrails → buildPrompt → callAnthropic
                               • suggest → aiSuggestedResponses(pending)  → Concepten-tab + lead-card
                               • auto    → messaging.sendInternal + record(sent/failed)
```

## Schema-wijzigingen

- `aiLeadResponseConfigs`: verwijder/deprecate `mode`, `channelOrder`, `bookingUrl`, `whatsappTemplateName`, `enabled` (verhuizen naar node-config). Behoud key/context/tone/signature/model/guardrails. (Velden optioneel maken i.p.v. hard verwijderen om bestaande dev-rijen niet te breken; nieuwe code leest ze niet meer.)
- `workflowNodes.config` (al `any`/flexibel): bevat voor `ai_response`-nodes `{ mode, channelOrder, bookingUrl, whatsappTemplateName?, goal? }`. Geen schema-migratie nodig (config is vrij veld).
- Geen wijziging aan `aiSuggestedResponses`.

## Migratie & backward-compat

- Geen live prod-gedrag (agent dormant) → geen data-migratie nodig.
- Dev: bestaande `aiLeadResponseConfigs`-rij blijft geldig (verhuisde velden worden genegeerd).
- De `pendingForContact`/`pendingConceptContactIds`/`sendSuggestion`/`dismissSuggestion`-paden blijven ongewijzigd (suggest-UI werkt door).

## Edge cases

- **Geen AI-instellingen / geen key:** `runAiResponse` stopt vroeg + logt "AI niet geconfigureerd" naar de execution-log (geen crash, workflow gaat door naar volgende node).
- **Lead zonder kanaal-match** (`pickChannel` null): log + skip, geen crash.
- **Meerdere workflows met een AI-node op dezelfde trigger:** dedup (24u, excl. failed) voorkomt dubbele berichten naar hetzelfde contact.
- **Node-config mist mode/kanaal:** val terug op veilige defaults (mode `suggest`, channelOrder `["sms","email"]`).
- **Guardrails:** quiet-hours-defer in auto-mode werkt via de bestaande scheduler-helpers (Amsterdam-wandklok).

## Out of scope

- Visuele drag-drop canvas voor de builder (blijft de lineaire builder).
- Andere node-types of trigger-types toevoegen.
- Merge/prod-deploy (pas na Marvins go).
- Wijziging aan de Concepten-tab/lead-card (werkstroom B, aparte branch).

## Verificatie

1. `npx convex dev --once` schoon (nieuwe engine-case + `runAiResponse` + starter-mutation + config-wijziging).
2. `npm run build` + geen nieuwe `tsc`-fouten in gewijzigde files.
3. Unit-tests: de pure helpers (`pickChannel`/quiet-hours/`buildPrompt`) blijven groen; voeg waar zinvol een test toe voor nieuwe pure node-config-normalisatie (bv. `resolveNodeConfig(defaults, nodeConfig)`).
4. Dev-smoke (browser, ingelogd): maak via de starter-knop een "AI eerste reactie"-workflow → vuur een test-lead met uniek e-mail → AI-node draait → suggest-concept verschijnt in de Concepten-tab + lead-kaart. Auto-mode: bericht verstuurd + in `/crm/messages`.
5. Bevestig dat de oude directe trigger weg is (geen dubbele AI-reactie).

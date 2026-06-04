# AI Lead-Response Agent — ochtend-verificatie (Marvin)

> Branch: `feat/ai-lead-response-agent` (11 commits, niet gemerged, niet naar prod gedeployed — bewust).
> Status: volledig gebouwd + unit-getest + dev-deployed. Taak 8 (echte e2e met jouw Anthropic-key) is bewust voor jou gelaten — dat vereist je key + een live test-lead.

## Wat dit doet
Bij een nieuwe Meta-lead genereert de agent automatisch een eerste reactiebericht (welkom + bevestiging + uitnodiging om zelf een afspraak te boeken via `afspraken.staycoolairco.nl`). **GEEN prijzen** in het bericht (jouw regel — motiveert tot contact). Twee modi:
- **suggest** (default): concept verschijnt op de lead-kaart met *Verstuur* / *Negeer* knoppen. Mens beslist.
- **auto**: stuurt direct via het eerste beschikbare kanaal (WhatsApp-template → SMS → e-mail, instelbaar).

**Default staat alles UIT** (`enabled=false`, `mode=suggest`) — er gaat niets de deur uit tot jij het aanzet en een key invult.

## Guardrails (ingebouwd)
- **Dedup 24u**: max 1 AI-reactie per contact per 24u. Een *mislukte* verzending blokkeert géén nieuwe poging (review-fix).
- **Quiet hours** (default 21:00–08:00 Amsterdam): in auto-modus wordt verzending uitgesteld tot het venster voorbij is. Wandklok-correct (niet server-UTC).
- **Dagcap** (default 200): totaal-plafond AI-verzendingen/dag, alleen afgedwongen in auto-modus.
- **Anthropic-key**: encrypted-at-rest (AES-256-GCM, `ENCRYPTION_KEY`), nooit teruggegeven aan de client, nooit gelogd.
- **Membership-check** op elke publieke functie (geen cross-workspace lek).
- Faalt de agent? De lead-intake gaat gewoon door (alles in try/catch).

---

## Verificatie-stappen (volg op volgorde)

### 1. Branch reviewen
```bash
cd ~/Projecten/leadflowv2
git checkout feat/ai-lead-response-agent
git log --oneline main..HEAD      # 11 commits
git diff main..HEAD --stat
```
Of open de PR op GitHub als je liever in de UI kijkt.

### 2. Key + context invullen + test-generatie
- Start dev: `npm run dev` + `npx convex dev` (apart terminal).
- Open **`/crm/settings/ai-agent`**.
- Vul in:
  - **Anthropic API key** (`sk-ant-...`) — veld toont daarna alleen `••• gezet`, nooit de waarde.
  - **Business context** — bv. "StayCool Airco, airco-installatie & onderhoud Limburg. Vaste monteur, F-gas/STEK-gecertificeerd."
  - Eventueel toon/signature aanpassen.
- Klik **"Test bericht genereren"** → er moet binnen ~2s een concept-bericht verschijnen. **Check: geen prijzen, bevat de boekingslink, max ~120 woorden, klinkt als StayCool.**
- ⚠️ Lukt dit niet → kijk in de Convex-logs (`npx convex logs`). Meest waarschijnlijke oorzaak: key fout of `ENCRYPTION_KEY` niet op dev gezet (`npx convex env get ENCRYPTION_KEY`).

### 3. Suggest-modus live testen
- Zet **mode = suggest**, **enabled = aan**, sla op.
- Vuur een Meta-test-lead af **met een UNIEK e-mailadres** (NIET `test@meta.com` — die wordt door dedup/bestaand-contact gevangen). Gebruik bv. `test+$(datum)@jouwdomein.nl`.
- Open de lead in **`/crm`** (Contacts/kanban). Er moet een **AI-concept-blok** op de lead-kaart staan (Bot-icoon, kanaal, body, *Verstuur* / *Negeer*).

### 4. Verstuur testen
- Klik **Verstuur** op het concept → bericht moet daadwerkelijk verstuurd worden via het gekozen kanaal en verschijnen in **`/crm/messages`** bij dat contact.
- Concept-blok moet verdwijnen (status → sent).

### 5. (Optioneel) auto-modus + guardrails
- Zet **mode = auto**. Vuur een nieuwe lead (uniek e-mail) → bericht moet **zonder tussenkomst** verstuurd worden (buiten quiet-hours).
- Test quiet-hours: stel `quietHoursStart`/`End` zo dat NU binnen het venster valt → lead moet uitgesteld worden (check Convex-logs: "uitgesteld tot ...").
- Zet daarna terug naar **mode = suggest** als je nog niet volledig auto wilt.

### 6. Mergen naar prod
Pas als 2–4 (en evt. 5) goed zijn:
```bash
git checkout main
git merge feat/ai-lead-response-agent
git push          # Vercel deployt frontend automatisch
npx convex deploy --prod   # Convex backend naar prod (vibrant-wildebeest-329)
```
**Daarna op prod nog:** `ENCRYPTION_KEY` staat al op prod (van I1). Zet de Anthropic-key opnieuw via de prod-settings-pagina (dev-key geldt niet op prod). Begin op prod met **mode = suggest** tot je vertrouwen hebt.

---

## Bekende edges (geen blockers, voor later)
- **Quiet-hours dubbele-send race** (alleen auto): twee intakes voor hetzelfde contact tijdens quiet-hours kunnen beide schedulen. Praktisch irrelevant zolang auto uit staat. Fix-idee: `status:"scheduled"` placeholder-record vóór het schedulen.
- **Schaal**: `recentlyResponded`/`countAutoSentToday` doen `collect()` + in-memory filter. Prima voor honderden leads/dag; bij veel meer een `by_workspace_created`-index toevoegen.
- **Channel-selector** valideert niet op dubbele kanalen (`[sms, sms, email]`); backend pakt gewoon de eerste match, dus functioneel ok.
- **DEFAULT_AI_CONFIG** staat zowel in `aiAgentConfig.ts` als gespiegeld in de settings-UI — bij wijzigen beide bijwerken (of later exporteren/importeren).

## Bestanden (oriëntatie)
- `convex/aiLeadResponse.ts` — orchestrator (`handleNewLead`), preview, suggest-queries/mutations/actions.
- `convex/aiLeadResponse/helpers.ts` (+ `.test.ts`) — pure functies (kanaalkeuze, quiet-hours, prompt-bouw, tijd-helpers). 14 tests.
- `convex/aiAgentConfig.ts` — config CRUD (key-encryptie, get geeft alleen `hasApiKey`).
- `convex/metaProcessor.ts` — trigger: `scheduler.runAfter(0, handleNewLead, …)` na lead-verwerking.
- `convex/schema.ts` — tabellen `aiLeadResponseConfigs` + `aiSuggestedResponses`.
- `src/routes/crm.settings_.ai-agent.tsx` — settings-pagina. `src/components/crm/lead-card.tsx` — suggest-UI.
- Spec: `docs/superpowers/specs/2026-06-04-ai-lead-response-agent-design.md` · Plan: `docs/superpowers/plans/2026-06-04-ai-lead-response-agent.md`

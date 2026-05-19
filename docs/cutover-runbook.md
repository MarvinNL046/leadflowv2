# LeadFlow v1 → v2 Cutover Runbook

**Status:** draft per 2026-05-19. Aanvul tijdens dry-run.
**Owner:** Marvin Smit (info@staycoolairco.nl)
**Doel:** clean schakel van v1 (wetryleadflow.com, Stack Auth + Neon) naar v2 (TanStack Start + Convex) zonder lead-verlies.

---

## 0. Pre-cutover checklist (T-1 dag, doe avond ervoor)

### Infrastructure
- [ ] Convex **productie**-deployment gemaakt (`npx convex deploy --prod`)
- [ ] Convex prod-URL bekend en in `.env.production` gezet
- [ ] Vercel project linked + `VITE_CONVEX_URL` → prod-URL
- [ ] Custom domain in Vercel klaar (bv `app.wetryleadflow.com` of nieuwe URL)
- [ ] DNS-TTL voor cutover-domain verlaagd naar 5 min (zodat propagation snel gaat)

### Convex prod env vars (set via dashboard of `npx convex env set`)
- [ ] `META_APP_ID` (zelfde als v1 — we hergebruiken één Meta App, alleen redirect-URI verschuift)
- [ ] `META_APP_SECRET`
- [ ] `META_VERIFY_TOKEN` — KIES NIEUW (anders luistert v1 nog mee op v1's verify-endpoint)
- [ ] `VOIDFIX_API_KEY`
- [ ] `RESEND_API_KEY` (voor outbound transactional email)
- [ ] `SITE_URL` → prod-URL (gebruikt in OAuth-callback)
- [ ] `JWT_PRIVATE_KEY` + `JWKS` (al gegenereerd voor v2 dev — kopieer over)

### Code-readiness
- [ ] `convex/migration.ts` ETL-mutations staan nog publiek (acceptabel tot cutover)
- [ ] Geen pending v2-features die nog niet getest zijn
- [ ] CI groen op main-branch

### Data-baseline (T-1 avond)
- [ ] Snapshot van v1 Neon DB (Neon Console → branch maken als safety-net)
- [ ] Full ETL-sync uitvoeren: `npx tsx scripts/sync-all.ts` (alle 14 scripts in volgorde, idempotent)
- [ ] Verifieer record-counts in v2 (zie sectie 5 voor counts)

### Auth-bootstrap
- [ ] Marvin logt 1× in op v2-prod via `/login` (magic-link op info@staycoolairco.nl)
- [ ] Confirmer dat super-admin badge zichtbaar is in sidebar
- [ ] Confirmeer dat workspace + default pipeline geseed zijn

---

## 1. T-0 cutover (kies een rustig moment — bv. zaterdagavond)

### T-0:00 — Freeze v1
- [ ] In v1 admin: **disable webhook routes** (Meta + website) zodat geen nieuwe leads in v1 landen
- [ ] Slack/WhatsApp: "v1 staat op freeze tot V2-go" naar team
- [ ] Note exacte tijd voor delta-sync window

### T-0:05 — Final delta-sync
```bash
cd ~/claudeProjecten/leadflow-v2
DRY_RUN=1 npx tsx scripts/sync-all.ts   # eerst dry-run voor zekerheid
npx tsx scripts/sync-all.ts             # echte run
```
Idempotent — bestaande rows worden gepatcht met laatste v1-state.

### T-0:15 — Spot-check v2-data
- [ ] `/crm/contacts` toont alle gemigreerde contacten
- [ ] `/crm/pipelines` toont opps in correcte stages
- [ ] Een willekeurig contact openen → notes + custom fields zichtbaar
- [ ] `/crm/messages` toont WhatsApp/SMS history

### T-0:20 — Switchover
- [ ] **Meta App**: Facebook for Developers → App → WhatsApp Webhook / Lead Ads → Callback URL wijzigen naar `https://<v2-prod-url>/auth/meta/callback` (en `/api/meta/webhook` voor leads)
- [ ] **Website lead-API**: in v2 settings nieuwe api-key genereren, oude v1-key in staycoolairco.nl contact-form vervangen
- [ ] **DNS**: cutover-domain wijzigen naar Vercel v2 (of het zelfde domain via Vercel hosting overnemen)
- [ ] **WhatsApp via Voidfix**: bij Voidfix dashboard webhook URL wijzigen naar v2 (als die op v1-URL pointed)

### T-0:30 — Re-enable inkomende leads
- [ ] Test inkomende **Meta lead** via Meta's lead-ads testing tool — moet in v2 kanban verschijnen onder "Nieuwe lead"
- [ ] Test inkomende **website lead** via staycoolairco.nl contact-form
- [ ] Test inkomende **WhatsApp message** — verschijnt in v2 messages-tab
- [ ] Test outbound **SMS/WhatsApp** vanuit lead-card

---

## 2. T+1 dag — Monitoring

### Eerste 24u
- [ ] Check Convex logs voor errors (Convex dashboard → Logs)
- [ ] Check Vercel deployment logs
- [ ] Check Meta App webhook delivery rate (Facebook for Developers → Recent Webhook Failures)
- [ ] Check dat geen lead in v1 is binnengekomen (v1 DB-query op contacts.created_at > T-0)

### Performance baseline
- [ ] Kanban load-time onder 2s
- [ ] Settings-pagina's responsive
- [ ] Workflows tab toont 5 workflows

---

## 3. ETL cleanup (T+1 dag, NA 24u stabiel draaien)

```bash
cd ~/claudeProjecten/leadflow-v2
git rm convex/migration.ts
git rm scripts/migrate-*.ts
git rm scripts/_inspect-neon-schemas.ts
git rm scripts/sync-all.ts
git rm scripts/test-inbound-webhooks.ts  # alleen als niet meer nodig
git commit -m "chore: remove migration scaffolding after successful cutover"
npx convex deploy --prod
```

**Reason:** publieke bulk-insert mutations zonder auth-check zijn een productie-risico. Cleanup-tag staat in `convex/migration.ts` header.

Optioneel: laat schema's `legacyId` velden + indexes staan voor audit-trail (kleine overhead, geen functionele impact).

---

## 4. Rollback-plan

### Tot stap "Switchover" (T-0:20)
**Geen impact.** v1 staat nog op zijn eigen URL en draait door. Reset = freeze opheffen op v1 en de cutover-poging opnieuw plannen.

### Na "Switchover" maar binnen 30 min
1. DNS terug naar v1-URL
2. Meta App callback URL terug naar v1
3. WhatsApp/Voidfix webhook terug naar v1
4. V2 staat in een "stille" state — geen schade. Convex-data blijft beschikbaar voor volgende cutover-poging (idempotent).

### Na 4+ uur productie op v2
Roll-back is dan kostbaar:
- Leads die binnenkwamen op v2 moeten handmatig naar v1 worden gekopieerd (omgekeerde ETL)
- Beslis: doorgaan met bugfixes op v2, of accepteer data-verlies en ga terug naar v1
- Heroverweeg eerst: is de bug in v2 echt zo erg dat rollback nodig is?

---

## 5. Verwachte record-counts in v2 na sync

| Tabel | V2-count (na sync 2026-05-19) | Bron |
|---|---|---|
| contacts | 5980 | v1 contacts ws=12 |
| opportunities | 417 | v1 opps ws=12, deleted_at IS NULL |
| opportunityStageHistory | 1071 | v1 history voor ws=12 opps |
| notes | 455 | v1 notes ws=12, COALESCE op contact_id/opp.contact_id |
| customFieldDefinitions | 8 | v1 cf-defs ws=12 |
| customFieldValues | 969 | v1 cf-values voor ws=12 contacts |
| leadAttribution | 440 | v1 lead-attribution voor migrated contacts |
| metaLeadRaw | 360 | v1 meta-lead-raw |
| messages | 1750 | v1 message_log (SMS/WhatsApp/Messenger) |
| emailTemplates | 4 | v1 templates ws=12 |
| workflows | 5 | 1 active "Snelle Response", 4 drafts |
| workflowNodes | 65 | |
| workflowEdges | 71 | |
| notifications | 0 | Alle v1-rows hadden user_id=null = system events; fresh start na cutover |

**NIET gemigreerd** (Marvin's keuze): email_threads/email_messages/email_log/email_connections (Gmail-flow blijft buiten v2), workflow_executions/logs (audit-trail, kunnen blank starten), v1 users (geen 1:1 met Convex Auth).

---

## 6. Bekend issues / risico's

### Stage-namen
v1 had 5 v1-only stages (`Nieuw`, `1x/2x/3x Gebeld`, `Afspraak ingepland`) die via `STAGE_RENAME_MAP` in `scripts/migrate-opportunities.ts` + `migrate-stage-history.ts` naar v2's 5-stage flow zijn gemapt. Granulariteit van x-Gebeld blijft behouden via `contacts.callCount`.

### Duplicate workflows
v1 had 2 records "Ultimate Sales Automation" (legacyId 8 en 10). Beide zijn gemigreerd; Marvin haalt duplicate handmatig weg in v2 workflows-tab post-cutover.

### Meta verify-token
Tot cutover gebruikt v1 zijn huidige verify-token. Op cutover-dag moet v2 een NIEUWE verify-token krijgen (anders luistert v1 nog mee als webhook getriggerd wordt op een endpoint die per ongeluk allebei serveert).

### Voidfix WhatsApp sessie
Sessie staat op v2 dev-environment. Voor prod: nieuwe QR-koppeling vanuit v2 prod-instance. v1's sessie blijft voorlopig draaien als safety-net.

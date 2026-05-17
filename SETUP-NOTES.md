# wetryleadflowV2

LeadFlow v2 — rebuild op TanStack Start + Convex DB.

**Status:** scaffold pending. Migration-docs in `docs/v1-migration/` zijn ready.

## Stack

- **Frontend framework**: TanStack Start
- **Router**: TanStack Router (file-based)
- **Data fetching**: TanStack Query (non-Convex) + Convex `useQuery` (real-time, primary)
- **Backend**: Convex DB
- **Styling**: Tailwind CSS
- **UI components**: shadcn/ui
- **Auth**: TBD (@convex-dev/auth of Clerk — niet Stack Auth zoals v1)
- **Deploy**: Vercel staging op `v2.wetryleadflow.com`, cutover later

## Setup-checklist (run in deze folder, niet in v1)

```bash
# 1. TanStack Start scaffold (interactive — beantwoordt setup-vragen)
npm create @tanstack/start@latest . -- --tailwind
# Bij prompt: kies TypeScript, kies router-mode, kies installer (npm/pnpm)

# 2. Convex linken (interactive — login + nieuw project)
npx convex dev
# Krijgt eigen Convex deployment, schrijft convex/_generated/, schrijft .env.local
# DOET NIET: connect aan productie-Convex tot je daar klaar voor bent

# 3. Schema overzetten uit migration-doc
cp docs/v1-migration/convex-schema.ts convex/schema.ts
# Pas aan waar je extra fields/tables wilt, draai opnieuw convex dev om te valideren

# 4. shadcn initializen
npx shadcn@latest init
# Bij prompt: kies default style, neutral base color, src/components

# 5. shadcn components uit v1 overnemen (optioneel — versnelt UI bouw)
cp -r ../wetryleadflow/src/components/ui/* src/components/ui/

# 6. Git + GitHub remote
git init && git add . && git commit -m "chore: TanStack Start + Convex scaffold"
gh repo create wetryleadflowV2 --private --source=. --remote=origin --push

# 7. Vercel project linken
npx vercel link
# Apart project van v1 — kies "create new project"
# Voeg env vars toe: CONVEX_DEPLOYMENT, CONVEX_URL (van convex dev output)

# 8. Open nieuwe Claude Code sessie in deze folder voor v2 development
cd C:\Users\M_Smi\claudeProjecten\wetryleadflowV2
claude  # of via Cursor / IDE
```

## Volgorde van porten (zie docs/v1-migration/feature-usage-audit.md)

Per priority:
1. **Auth + multi-tenant**: users, orgs, workspaces, memberships
2. **CRM core**: contacts, opportunities, pipelines + stages, notes, custom_fields
3. **Messaging**: messages (unified) + threads
4. **Outbound channels**: Voidfix SMS/WA + Resend wrappers
5. **Meta integration**: webhook + processor + lead_attribution
6. **Workflows**: engine + executors voor minimaal Snelle Response flow
7. **Notifications + push**
8. **Marketplace** (schema + lean UI)
9. **Homepage** (user-facing marketing pages)

## Wat NIET porten (per audit-beslissing 2026-05-17)

- Mia AI Control Room (workflow auto-SMS doet hetzelfde simpler)
- Invoicing (gebruikt Moneybird extern)
- Email campaigns (0 usage in v1)
- Calendar (gebruikt Google Calendar direct)
- Landing pages (geen activity sinds feb 2026)
- Support tickets, Google Business, Twilio legacy, oude conversation_ai

## v1 reference

V1 repo blijft draaien voor Staycool tot cutover:
- Local: `~/claudeProjecten/wetryleadflow/`
- GitHub: `github.com/MarvinNL046/wetryleadflow`
- Productie: `https://wetryleadflow.com`

Voor "hoe doet v1 dit?"-vragen tijdens v2 build: open Claude Code sessie in
v1-folder en vraag daar. v2-CC werkt in deze folder, blijft v2-context.

## Cutover-plan

Zie `docs/v1-migration/etl-skeleton.ts` voor de full cutover-procedure
(read-only mode → ETL → DNS-flip → 30d v1-archief).

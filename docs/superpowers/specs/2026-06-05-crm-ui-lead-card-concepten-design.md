# /crm UI: lead-kaart acties + concept-zichtbaarheid — Design

**Datum:** 2026-06-05
**Status:** goedgekeurd (verbaal) — klaar voor implementatieplan
**Scope:** twee samenhangende UI-verbeteringen op het /crm-dashboard van leadflowv2. GEEN backend-gedragswijziging aan de AI-agent zelf; GEEN merge/prod-deploy zonder Marvins go.

## Doel

1. **Lead-kaart acties opschonen** — de huidige 5 even-zware, elk-anders-gekleurde knoppen (+ copy) vervangen door één primaire actie + een rustig uitkomst-menu.
2. **Concept-zichtbaarheid** — collega's moeten zien dat er een AI-concept klaarstaat om goedgekeurd te worden, ook als ze niet toevallig naar die ene lead-kaart kijken.

## Huidige situatie

- **`src/components/crm/lead-card.tsx`** — action-row (regels ~286-369) met: `Bel` (groen, primair, `openQuickAction('main')`), `Opgenomen` (paars, `setAnsweredOpen(true)`), `Niet bereikt` (amber, `openQuickAction('not_answered')`), `Ongeldig` (rood, `openQuickAction('invalid_number')`), `Buiten gebied` (oranje, `openQuickAction('outside_area')`), `Copy` (icoon, `handleCopy`). Vijf semantische kleuren naast elkaar = visuele ruis. Boven de action-row toont de kaart al een **AI-concept-blok** (regels ~234-284) met Verstuur/Negeer wanneer `pendingForContact` een resultaat geeft — dit blijft ongewijzigd.
- **`src/routes/crm.index.tsx`** — dashboard met segmented control **Alle / Vervolg / Nieuw** (`grid-cols-3`, elk met live teller-badge) boven de lead-lijst. `LeadsList` berekent buckets `newOnly` (callCount 0) en `followUp` (1-2× gebeld). Leads komen uit `api.contacts.listIncomingLeads`.
- **`src/components/crm/sidebar.tsx`** — statische `NAV`-array: Dashboard (`/crm`), Contacts, Pipelines, Messages, Workflows + footer Instellingen. Gerenderd op élke CRM-pagina (desktop aside + mobile sheet via `SidebarContent`).
- **`convex/aiLeadResponse.ts`** — heeft al `pendingForContact` (per contact) + tabel `aiSuggestedResponses` met index `by_workspace_status` (workspaceId, status). Status `pending` = wachtend concept.
- **`src/components/ui/dropdown-menu.tsx`** — shadcn dropdown-menu component is aanwezig.

## Gewenste situatie

### A. Lead-kaart action-row (presentatie-refactor)

Nieuwe rij (zelfde plek, regels ~286-369):

```
[ 📞 Bel ]   [ Uitkomst markeren ▾ ]   [⧉]
```

- **`Bel`** — primair, blauw (StayCool-accent), behoudt handler `openQuickAction('main')` + `disabled={!lead.phone}` + title.
- **`Uitkomst markeren ▾`** — neutrale outline-knop als `DropdownMenuTrigger asChild`. `DropdownMenuContent` met 4 items (in deze volgorde):
  1. `Opgenomen` (CheckCircle2, groen accent op icoon) → `setAnsweredOpen(true)`
  2. `Niet bereikt` (PhoneMissed) → `openQuickAction('not_answered')`
  3. `Ongeldig nummer` (AlertTriangle) → `openQuickAction('invalid_number')`
  4. `Buiten gebied` (MapPinOff) → `openQuickAction('outside_area')`
- **`Copy`** — icoon-knop, ongewijzigd (`handleCopy`).
- Geen enkele andere kleur dan de Bel-accentkleur; menu-items zijn neutraal met kleine semantische icoon-tint.
- **Geen** wijziging aan de onderliggende handlers, `LeadDialog`, `AnsweredDialog` of het AI-concept-blok. Puur de presentatie van de knoppenrij.

### B. Concept-zichtbaarheid

**B1. Backend-query** — nieuwe publieke query in `convex/aiLeadResponse.ts`:
`pendingConceptContactIds({ workspaceId })` → `string[]` (de unieke `contactId`'s met een `aiSuggestedResponses`-rij met status `"pending"` in deze workspace).
- Gebruikt index `by_workspace_status` (`eq(workspaceId).eq(status,"pending")`), collect, map naar `contactId`, dedupe.
- Membership-checked (zelfde patroon als `pendingForContact`/`getDetail`: `getAuthUserId` → workspace → `memberships.by_user_org`). Geeft **`[]`** terug bij niet-ingelogd / geen lidmaatschap (graceful — mag de UI nooit laten crashen).

**B2. "Concepten"-tab** op `/crm` (`crm.index.tsx`):
- Segmented control wordt `grid-cols-4`: **Alle / Vervolg / Nieuw / Concepten**.
- `LeadsList` krijgt de `pendingContactIds` (Set) en berekent bucket `conceptLeads = leads.filter(l => pendingSet.has(l._id))`.
- Tab-teller-badge = `pendingContactIds.length`. Badge krijgt **accent-blauw** als > 0 (i.p.v. de neutrale `bg-white`), zodat hij opvalt; neutraal bij 0.
- Label "Concepten" — op smal scherm `text-xs`/truncate zodat 4 tabs passen.

**B3. Sidebar-badge** op het Dashboard-nav-item (`sidebar.tsx`):
- `SidebarContent` haalt workspaceId op (`api.userProfiles.myTenants`, zelfde patroon als `crm.index`) + `pendingConceptContactIds`.
- Bij het `'/crm'`-nav-item: klein blauw teller-badge rechts van het label wanneer count > 0. Zichtbaar vanaf élke CRM-pagina.
- Convex dedupet identieke client-queries, dus de extra query op de altijd-gemounte sidebar is goedkoop.

## Data-flow

```
aiSuggestedResponses (status=pending)
        │  by_workspace_status index
        ▼
pendingConceptContactIds(workspaceId)  ──► string[]  (membership-checked)
        │                                   │
        ▼                                   ▼
crm.index LeadsList                    sidebar SidebarContent
  • Set(ids) → conceptLeads bucket       • badge count op "Dashboard"
  • tab-badge = ids.length
```

Alles reactief: stuurt de AI-agent een nieuw concept (status `pending`), dan tellen de tab- én sidebar-badge automatisch op; bij Verstuur/Negeer (status → sent/dismissed) zakt de teller vanzelf.

## Edge cases

- **Geen workspace / niet ingelogd:** query geeft `[]`, tabs/badges tonen 0, geen crash.
- **Pending concept voor een contact dat niet in `listIncomingLeads` zit:** in de praktijk niet mogelijk (concepten ontstaan bij lead-intake terwijl het contact nieuw/incoming is). Mocht het tóch: de sidebar/tab-teller (`ids.length`) kan dan hoger zijn dan het aantal zichtbare kaarten in de Concepten-tab. Geaccepteerd; documenteren in code-comment.
- **Lead zonder telefoon:** `Bel` blijft `disabled` (ongewijzigd); het uitkomst-menu blijft bruikbaar.
- **0 concepten:** "Concepten"-tab blijft zichtbaar met neutrale badge `0` (voorspelbaar, niet verbergen).

## Out of scope

- Consolidatie AI-agent ↔ Workflows (apart ontwerp, werkstroom C).
- Wijziging aan het AI-concept-blok zelf, de dialogen of de AI-agent-logica.
- Merge naar main / prod-deploy (pas na Marvins go).

## Verificatie

Deze wijzigingen zijn grotendeels presentatie + één triviale query — geen nieuwe pure-functie-logica die unit-tests rechtvaardigt (codebase test alleen pure convex-helpers). Verificatie:
1. `npx convex dev --once` — convex typecheck + dev-deploy schoon (nieuwe query).
2. `npm run build` — frontend productie-build + tsc schoon.
3. Playwright-smoke op `/crm` (via playwright-tester agent): pagina laadt, 4 tabs zichtbaar, Bel-knop + "Uitkomst markeren"-menu klikbaar, menu toont 4 items, geen console-errors.
4. Handmatige check (ochtend): met `mode=suggest` + een test-concept → Concepten-tab toont de lead, sidebar-badge telt op, Verstuur laat teller zakken.

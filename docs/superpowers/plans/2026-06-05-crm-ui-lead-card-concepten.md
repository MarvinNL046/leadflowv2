# /crm UI: lead-kaart acties + concept-zichtbaarheid — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: gebruik superpowers:subagent-driven-development of executing-plans. Stappen gebruiken checkbox (`- [ ]`) syntax.

**Goal:** De lead-kaart action-row opschonen (1 primaire Bel + uitkomst-menu i.p.v. 5 gekleurde knoppen) en AI-concepten zichtbaar maken via een "Concepten"-tab + sidebar-badge.

**Architecture:** Eén nieuwe membership-checked Convex-query (`pendingConceptContactIds`) voedt zowel de Concepten-tab (`crm.index.tsx`) als de sidebar-badge (`sidebar.tsx`). De lead-kaart-refactor is puur presentatie (bestaande handlers blijven). Alles reactief via Convex.

**Tech Stack:** TanStack Start + React + Convex + shadcn (`dropdown-menu` al aanwezig) + Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-05-crm-ui-lead-card-concepten-design.md`

---

### Task 1: Backend-query `pendingConceptContactIds`

**Files:**
- Modify: `convex/aiLeadResponse.ts` (toevoegen direct ná `pendingForContact`, ~regel 329)

- [ ] **Stap 1: Voeg de query toe**

```ts
/** Alle contact-IDs met een wachtend AI-concept (status "pending") in deze
 *  workspace. Voedt de "Concepten"-tab + sidebar-badge. Membership-checked;
 *  geeft graceful [] bij niet-ingelogd/geen lidmaatschap (mag de UI nooit
 *  laten crashen). NB: in de praktijk ⊆ incoming leads (concepten ontstaan
 *  bij lead-intake), dus de count matcht de zichtbare kaarten. */
export const pendingConceptContactIds = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) return [];
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) return [];
    const rows = await ctx.db
      .query("aiSuggestedResponses")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "pending"),
      )
      .collect();
    return [...new Set(rows.map((r) => r.contactId as string))];
  },
});
```

- [ ] **Stap 2: Typecheck + dev-deploy**

Run: `npx convex dev --once`
Expected: `Convex functions ready!` zonder errors. (Geen unit-test: triviale query, niet zinvol te isoleren zonder convex-test harness; verificatie via deploy + UI.)

- [ ] **Stap 3: Commit**

```bash
git add convex/aiLeadResponse.ts
git commit -m "feat(crm-ui): query pendingConceptContactIds voor concept-zichtbaarheid"
```

---

### Task 2: Lead-kaart action-row refactor

**Files:**
- Modify: `src/components/crm/lead-card.tsx` (imports + action-row ~regel 286-369)

- [ ] **Stap 1: Voeg `ChevronDown` toe aan de lucide-import + importeer dropdown-menu**

Voeg `ChevronDown` toe aan de bestaande `lucide-react`-import. Voeg daarna deze import toe (bij de andere `#/components/ui`-imports):

```ts
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
```

- [ ] **Stap 2: Vervang de hele action-row (`{/* Action row — 5 acties + Copy */}` t/m de afsluitende `</div>`) door:**

```tsx
{/* Action row — primaire Bel + uitkomst-menu + copy */}
<div className="mt-4 flex items-center gap-2">
  {/* Bel — opent LeadDialog 'main' (tel:-link prominent + vervolg-acties). */}
  <Button
    type="button"
    onClick={() => openQuickAction('main')}
    disabled={!lead.phone}
    title={lead.phone ? `Bel ${lead.phone}` : 'Geen telefoonnummer'}
    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
  >
    <Phone className="h-4 w-4" />
    Bel
  </Button>

  {/* Uitkomst markeren — neutraal menu met de 4 dispositions. */}
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" className="shrink-0">
        Uitkomst markeren
        <ChevronDown className="h-4 w-4 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuItem onSelect={() => setAnsweredOpen(true)}>
        <CheckCircle2 className="text-emerald-600" />
        Opgenomen
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openQuickAction('not_answered')}>
        <PhoneMissed />
        Niet bereikt
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openQuickAction('invalid_number')}>
        <AlertTriangle />
        Ongeldig nummer
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openQuickAction('outside_area')}>
        <MapPinOff />
        Buiten gebied
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  {/* Copy */}
  <Button
    type="button"
    variant="outline"
    size="icon"
    onClick={handleCopy}
    title="Kopieer contactgegevens"
    className="shrink-0"
  >
    {copied ? (
      <Check className="h-4 w-4 text-emerald-600" />
    ) : (
      <Copy className="h-4 w-4" />
    )}
  </Button>
</div>
```

Let op: Bel houdt de bestaande **groene** accent (past bij het groene "Nieuwe leads"-thema; we verminderen alleen het aantal kleuren, niet het call-accent). Alle ongebruikt geworden imports laten staan — `Phone, PhoneMissed, CheckCircle2, AlertTriangle, MapPinOff, Copy, Check` worden allemaal nog gebruikt. `PhoneOff` blijft in gebruik in de badge-sectie.

**Implementatie-notitie:** als een dialoog niet correct opent/focust na een menu-klik (zeldzame Radix dropdown→dialog focus-race), defer dan de handler: `onSelect={(e) => { e.preventDefault(); setTimeout(() => openQuickAction('not_answered'), 0) }}`. Eerst de simpele variant proberen.

- [ ] **Stap 3: Build/typecheck**

Run: `npm run build`
Expected: `✓ built` zonder TS-fouten.

- [ ] **Stap 4: Commit**

```bash
git add src/components/crm/lead-card.tsx
git commit -m "feat(crm-ui): lead-kaart — Bel + uitkomst-menu i.p.v. 5 gekleurde knoppen"
```

---

### Task 3: "Concepten"-tab op het dashboard

**Files:**
- Modify: `src/routes/crm.index.tsx`

- [ ] **Stap 1: Importeer `cn` + breid de Tab-type uit**

Voeg toe aan imports: `import { cn } from '#/lib/utils.ts'`
Wijzig: `type Tab = 'all' | 'follow_up' | 'new'` → `type Tab = 'all' | 'follow_up' | 'new' | 'concepten'`

- [ ] **Stap 2: Haal pending-IDs op in `CrmDashboard` + geef door aan `LeadsList`**

Voeg ná de `leads`-query toe:

```ts
  const pendingIds = useQuery(
    api.aiLeadResponse.pendingConceptContactIds,
    workspaceId ? { workspaceId } : 'skip',
  )
```

Wijzig de render van `LeadsList`:
```tsx
        <LeadsList
          leads={leads as IncomingLead[]}
          pendingIds={pendingIds ?? []}
        />
```

- [ ] **Stap 3: Pas `LeadsList` aan (signature + bucket + filter + tab)**

Signature:
```tsx
function LeadsList({
  leads,
  pendingIds,
}: {
  leads: IncomingLead[]
  pendingIds: string[]
}) {
```

Voeg na de bestaande buckets toe:
```ts
  const pendingSet = new Set(pendingIds)
  const conceptLeads = leads.filter((l) => pendingSet.has(l._id))
```

Wijzig `filtered`:
```ts
  const filtered =
    tab === 'concepten'
      ? conceptLeads
      : tab === 'follow_up'
        ? followUp
        : tab === 'new'
          ? newOnly
          : leads
```

Wijzig de tabs-wrapper `grid-cols-3` → `grid-cols-4` en voeg ná de "Nieuw"-TabButton een 4e toe:
```tsx
        <TabButton
          active={tab === 'concepten'}
          onClick={() => {
            setTab('concepten')
            setVisibleCount(LEADS_PER_PAGE)
          }}
        >
          Concepten
          <Badge
            variant="secondary"
            className={cn(
              'ml-1',
              pendingIds.length > 0 ? 'bg-blue-600 text-white' : 'bg-white',
            )}
          >
            {pendingIds.length}
          </Badge>
        </TabButton>
```

- [ ] **Stap 4: Build/typecheck**

Run: `npm run build`
Expected: `✓ built`. Controleer dat 4 tabs passen; bij overflop op smal scherm: verklein `TabButton` padding `px-3` → `px-2.5`.

- [ ] **Stap 5: Commit**

```bash
git add src/routes/crm.index.tsx
git commit -m "feat(crm-ui): Concepten-tab op dashboard (live teller)"
```

---

### Task 4: Sidebar-badge op "Dashboard"

**Files:**
- Modify: `src/components/crm/sidebar.tsx`

- [ ] **Stap 1: Importeer convex + api**

```ts
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
```

- [ ] **Stap 2: Haal de count op in `SidebarContent` (bovenin, ná `useRouterState`)**

```ts
  const tenants = useQuery(api.userProfiles.myTenants)
  const workspaceId =
    tenants?.find((t) => t.workspace !== null)?.workspace?.id
  const pendingIds = useQuery(
    api.aiLeadResponse.pendingConceptContactIds,
    workspaceId ? { workspaceId } : 'skip',
  )
  const pendingCount = pendingIds?.length ?? 0
```

- [ ] **Stap 3: Render een badge op het Dashboard-item**

In de `NAV.map(...)`-render, ná `{item.label}` binnen de `<Link>`:
```tsx
              {item.to === '/crm' && pendingCount > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
                  {pendingCount}
                </span>
              )}
```

- [ ] **Stap 4: Build/typecheck**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Stap 5: Commit**

```bash
git add src/components/crm/sidebar.tsx
git commit -m "feat(crm-ui): sidebar-badge 'concepten wachten' op Dashboard"
```

---

### Task 5: Eindverificatie

- [ ] **Stap 1: Convex dev-deploy schoon**

Run: `npx convex dev --once`
Expected: `Convex functions ready!`

- [ ] **Stap 2: Frontend productie-build schoon**

Run: `npm run build`
Expected: `✓ built`, geen TS-fouten.

- [ ] **Stap 3: Handmatige/Playwright-smoke (ochtend-review)**

`/crm` vereist login → authed smoke is handmatig (geen creds voor automated agent):
- `/crm` laadt; 4 tabs zichtbaar (Alle/Vervolg/Nieuw/Concepten).
- "Bel" + "Uitkomst markeren ▾"; menu toont 4 items; elk opent de juiste dialoog.
- Met `mode=suggest` + test-concept: Concepten-tab toont de lead, tab- + sidebar-badge tellen op (blauw), Verstuur laat de teller zakken.
- Geen console-errors.

**KLAAR =** taken 1-4 geïmplementeerd + gecommit, build + convex-deploy schoon, branch gepusht. GEEN merge/prod zonder Marvins go.

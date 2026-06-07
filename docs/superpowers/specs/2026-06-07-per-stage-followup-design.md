# Per-stage retry-interval — Design

**Status:** goedgekeurd (Marvin, 2026-06-07)

## Probleem

De "volgende belpoging over N dagen" na "Niet bereikt" gebruikt één workspace-brede
`crmSettings.defaultFollowUpDays`. Verschillende stages verdienen verschillende cadans:
een verse "Nieuw"-lead wil je snel chasen (1 dag), een "Offerte"-lead langzamer (5 dagen).

`recordCallNoAnswer` is contact-level en kijkt nu (bij niet-final-strike) naar géén enkele
stage — het patcht alleen `contact.nextFollowUpAt = now + defaultFollowUpDays`.

De LeadDialog (die `recordCallNoAnswer` aanroept) rendert op dashboard-lead-cards **én** op
de contact-detailpagina ("Bel Nu"), dus "Niet bereikt" kan op een lead in elke stage —
per-stage cadans is dus betekenisvol.

## Doel

Maak het retry-interval instelbaar per pipeline-stage. Niet ingesteld op een stage =
workspace-`defaultFollowUpDays` = huidig gedrag (backwards compatible).

## Welke stage bepaalt het interval (kernbeslissing)

`recordCallNoAnswer` is contact-level; een contact kan meerdere opps hebben. Regel: **de
verst-gevorderde open (niet-won/niet-lost) opp** bepaalt het interval — "waar de lead in de
funnel staat". Geen open opp → `defaultFollowUpDays`. Gekozen stage zonder `followUpDays` →
`defaultFollowUpDays`. Voor het gewone geval (één open opp) eenduidig.

## Architectuur

1. **Schema:** `pipelineStages.followUpDays: v.optional(v.number())` (1–60; afwezig =
   workspace-default).
2. **Pure helper** `convex/followUpInterval.ts`:
   ```ts
   export function resolveFollowUpDays(
     openStages: Array<{ order: number; followUpDays?: number | null }>,
     defaultDays: number,
   ): number {
     if (openStages.length === 0) return defaultDays;
     const furthest = [...openStages].sort((a, b) => b.order - a.order)[0];
     return furthest.followUpDays ?? defaultDays;
   }
   ```
   Geen Convex-imports → unit-testbaar.
3. **Mutation** `setStageFollowUpDays({ stageId, days })` in `convex/pipelines.ts`
   (`days: v.union(v.number(), v.null())`; `null` = wissen → default; getal 1–60 anders;
   membership-check). Spiegelt `setStageNoResurface`.
4. **`recordCallNoAnswer`** (niet-final-strike-tak): laad de open opps van het contact
   (`by_contact`, filter niet-won/niet-lost via hun stage), bouw `openStages`
   (`{order, followUpDays}`), `const days = resolveFollowUpDays(openStages,
   settings.defaultFollowUpDays)`; gebruik `days` voor `nextFollowUpAt` (`now + days*DAG`)
   én de note-tekst ("Volgende belpoging over {days} dagen"). De final-strike-tak en de
   `followUpReminderDays`-workflow-reminder blijven ongewijzigd (workspace-breed).
5. **UI:** klein `followUpDays`-veld per stage-rij in `crm.settings_.pipeline.tsx` (naast
   kleur/rol/Vasthouden); leeg = placeholder "standaard (`{defaultFollowUpDays}` dagen)".

## Niet-doelen (YAGNI)

- `recordCallAnswered`-callback-timing blijft via `customerCallbackDays`/presets
  (al instelbaar sinds de callback-timing-slice).
- `followUpReminderDays` (aparte workflow-reminder) blijft workspace-breed.
- Geen opp-level `nextFollowUpAt`-refactor; de bekende contact/opp-tension blijft.

## Testing

- **Unit:** `convex/followUpInterval.test.ts` voor `resolveFollowUpDays`: geen open opp →
  default; één opp zonder override → default; één opp mét override → override; meerdere
  opps → hoogste-order wint; ongesorteerde input → sorteert.
- **Build-gates:** vitest · `convex dev --once` · build · tsc (geen nieuwe fouten in
  changed files).
- **UI-smoke (browser, reversibel):** zet op een stage `followUpDays` → Opslaan → herlaad,
  veld persisteert; wis → terug naar placeholder. (Config-mutatie, geen lead-data.)
- **Integratie-smoke (CLI, reversibel, non-destructief):** tijdelijke `convex/__debug.ts`
  internalMutation die een throwaway contact + opp in een stage met `followUpDays=1` maakt,
  de open-opps + stages laadt en de échte `resolveFollowUpDays` aanroept → assert het
  verwachte interval (1, niet de default); test ook "stage zonder override → default" en
  "geen open opp → default"; ruimt alles op. Daarna `__debug.ts` verwijderen. (Vermijdt het
  muteren van echte dev-contacten via de UI-call-flow.)

## Risico's

- Laag/additief. Default-pad (geen stage-override) = ongewijzigd gedrag. De extra
  opps+stages-load in `recordCallNoAnswer` (niet-final-strike) zijn een paar reads per call
  — verwaarloosbaar. Final-strike-tak ongemoeid.

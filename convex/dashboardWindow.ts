/**
 * Pure helper voor de recency-filter van het speed-to-lead-dashboard
 * (listIncomingLeads). Geen Convex-imports → unit-testbaar onder node-env.
 *
 * Regels:
 *   - windowCutoff === null  → geen venster (caller gaf geen dueBefore mee) → tonen
 *   - dueFollowup === true    → due/verlopen follow-up = expliciet "bel deze persoon"
 *                               → áltijd tonen, ongeacht leeftijd
 *   - anders                  → alleen tonen als de lead-activiteit binnen het
 *                               venster valt (leadCreatedAt >= windowCutoff)
 */
export function isWithinDashboardWindow(
  leadCreatedAt: number,
  dueFollowup: boolean,
  windowCutoff: number | null,
): boolean {
  if (windowCutoff === null) return true;
  if (dueFollowup) return true;
  return leadCreatedAt >= windowCutoff;
}

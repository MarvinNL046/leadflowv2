/**
 * Beslist of een lead op het speed-to-lead-dashboard (listIncomingLeads) hoort.
 * Pure → unit-testbaar. Volgorde:
 *   1. verlopen follow-up → tonen (de "komt na N dagen terug"-trigger).
 *   2. geen opp → verbergen (import zonder deal).
 *   3. toekomstige (nog niet due) follow-up → verbergen tot due
 *      (de "1x gebeld → verdwijnt"-flow).
 *   4. anders → tonen als er een opp in de eerste actieve stage staat.
 */
export function leadDashboardDecision(args: {
  nextFollowUpAt: number | null | undefined;
  dueBefore: number | null | undefined;
  hasAnyOpp: boolean;
  hasFirstStageOpp: boolean;
}): { keep: boolean; dueFollowup: boolean } {
  const { nextFollowUpAt, dueBefore, hasAnyOpp, hasFirstStageOpp } = args;
  if (
    dueBefore != null &&
    nextFollowUpAt != null &&
    nextFollowUpAt <= dueBefore
  ) {
    return { keep: true, dueFollowup: true };
  }
  if (!hasAnyOpp) return { keep: false, dueFollowup: false };
  if (dueBefore != null && nextFollowUpAt != null) {
    // nextFollowUpAt > dueBefore → toekomstige follow-up → verbergen
    return { keep: false, dueFollowup: false };
  }
  return { keep: hasFirstStageOpp, dueFollowup: false };
}

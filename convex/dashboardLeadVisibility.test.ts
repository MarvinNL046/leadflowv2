import { describe, it, expect } from "vitest";
import { leadDashboardDecision } from "./dashboardLeadVisibility";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const due = NOW + DAY; // einde-vandaag-achtige dueBefore

describe("leadDashboardDecision", () => {
  it("verlopen follow-up → tonen + dueFollowup, ongeacht opp", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: NOW - DAY,
        dueBefore: due,
        hasAnyOpp: false,
        hasFirstStageOpp: false,
      }),
    ).toEqual({ keep: true, dueFollowup: true });
  });
  it("toekomstige follow-up → verbergen (bug 2-kern)", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: NOW + 2 * DAY,
        dueBefore: due,
        hasAnyOpp: true,
        hasFirstStageOpp: true,
      }),
    ).toEqual({ keep: false, dueFollowup: false });
  });
  it("geen follow-up + opp in eerste stage → tonen", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: null,
        dueBefore: due,
        hasAnyOpp: true,
        hasFirstStageOpp: true,
      }),
    ).toEqual({ keep: true, dueFollowup: false });
  });
  it("geen follow-up + opp maar niet in eerste stage → verbergen", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: null,
        dueBefore: due,
        hasAnyOpp: true,
        hasFirstStageOpp: false,
      }),
    ).toEqual({ keep: false, dueFollowup: false });
  });
  it("geen opp → verbergen", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: null,
        dueBefore: due,
        hasAnyOpp: false,
        hasFirstStageOpp: false,
      }),
    ).toEqual({ keep: false, dueFollowup: false });
  });
  it("dueBefore null → val terug op eerste-stage-opp", () => {
    expect(
      leadDashboardDecision({
        nextFollowUpAt: NOW + 2 * DAY,
        dueBefore: null,
        hasAnyOpp: true,
        hasFirstStageOpp: true,
      }),
    ).toEqual({ keep: true, dueFollowup: false });
  });
});

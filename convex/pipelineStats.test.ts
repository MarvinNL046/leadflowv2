import { describe, it, expect } from "vitest";
import { computePipelineStats } from "./pipelineStats";

const stages = [
  { _id: "s_new", isWonStage: false, isLostStage: false },
  { _id: "s_appt", isWonStage: false, isLostStage: false },
  { _id: "s_won", isWonStage: true, isLostStage: false },
  { _id: "s_lost", isWonStage: false, isLostStage: true },
];

describe("computePipelineStats", () => {
  it("classificeert open/won/lost + win-rate", () => {
    const opps = [
      { stageId: "s_new" },
      { stageId: "s_appt" },
      { stageId: "s_won" },
      { stageId: "s_won" },
      { stageId: "s_lost" },
    ];
    const r = computePipelineStats(stages, opps);
    expect(r.openCount).toBe(2);
    expect(r.wonCount).toBe(2);
    expect(r.lostCount).toBe(1);
    expect(r.totalCount).toBe(5);
    expect(r.winRate).toBe(67); // round(2/3*100)
  });
  it("geen opps → alles 0, win-rate null", () => {
    const r = computePipelineStats(stages, []);
    expect(r).toEqual({
      openCount: 0,
      wonCount: 0,
      lostCount: 0,
      totalCount: 0,
      winRate: null,
    });
  });
  it("alleen open opps → win-rate null", () => {
    const r = computePipelineStats(stages, [
      { stageId: "s_new" },
      { stageId: "s_appt" },
    ]);
    expect(r.winRate).toBeNull();
    expect(r.openCount).toBe(2);
  });
  it("alles gewonnen → win-rate 100", () => {
    const r = computePipelineStats(stages, [
      { stageId: "s_won" },
      { stageId: "s_won" },
    ]);
    expect(r.winRate).toBe(100);
  });
  it("opp in onbekende stage telt als open", () => {
    const r = computePipelineStats(stages, [{ stageId: "s_ghost" }]);
    expect(r.openCount).toBe(1);
  });
  it("stage met isWonStage EN isLostStage → telt als won", () => {
    const weird = [{ _id: "s_x", isWonStage: true, isLostStage: true }];
    const r = computePipelineStats(weird, [{ stageId: "s_x" }]);
    expect(r.wonCount).toBe(1);
    expect(r.lostCount).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { shouldResurfaceOpp } from "./followupLogic";

const opts = {
  firstStageId: "first",
  closedStageIds: new Set(["won", "lost"]),
  noResurfaceStageIds: new Set(["appt"]),
};

describe("shouldResurfaceOpp", () => {
  it("first-stage → false (al in Nieuw)", () => {
    expect(shouldResurfaceOpp("first", opts)).toBe(false);
  });
  it("won/lost → false", () => {
    expect(shouldResurfaceOpp("won", opts)).toBe(false);
    expect(shouldResurfaceOpp("lost", opts)).toBe(false);
  });
  it("noResurface-stage → false", () => {
    expect(shouldResurfaceOpp("appt", opts)).toBe(false);
  });
  it("stage die closed ÉN noResurface is → false", () => {
    const o2 = { ...opts, noResurfaceStageIds: new Set(["won", "appt"]) };
    expect(shouldResurfaceOpp("won", o2)).toBe(false);
  });
  it("normale stage → true", () => {
    expect(shouldResurfaceOpp("called", opts)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { resolveFollowUpDays } from "./followUpInterval";

describe("resolveFollowUpDays", () => {
  it("geen open opp → default", () => {
    expect(resolveFollowUpDays([], 2)).toBe(2);
  });
  it("één open opp zonder override → default", () => {
    expect(resolveFollowUpDays([{ order: 0 }], 2)).toBe(2);
  });
  it("één open opp mét override → override", () => {
    expect(resolveFollowUpDays([{ order: 0, followUpDays: 5 }], 2)).toBe(5);
  });
  it("meerdere opps → hoogste-order stage wint", () => {
    expect(
      resolveFollowUpDays(
        [
          { order: 0, followUpDays: 1 },
          { order: 2, followUpDays: 7 },
          { order: 1, followUpDays: 3 },
        ],
        2,
      ),
    ).toBe(7);
  });
  it("hoogste-order zonder override → default (negeert lagere override)", () => {
    expect(
      resolveFollowUpDays([{ order: 0, followUpDays: 1 }, { order: 2 }], 2),
    ).toBe(2);
  });
});

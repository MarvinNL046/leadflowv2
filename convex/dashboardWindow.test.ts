import { describe, it, expect } from "vitest";
import { isWithinDashboardWindow } from "./dashboardWindow";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000; // vaste referentie, geen Date.now()
const cutoff = NOW - 90 * DAY;

describe("isWithinDashboardWindow", () => {
  it("geen venster (cutoff null) → altijd zichtbaar", () => {
    expect(isWithinDashboardWindow(NOW - 999 * DAY, false, null)).toBe(true);
  });
  it("due follow-up → altijd zichtbaar, ongeacht leeftijd", () => {
    expect(isWithinDashboardWindow(NOW - 999 * DAY, true, cutoff)).toBe(true);
  });
  it("recente lead binnen venster → zichtbaar", () => {
    expect(isWithinDashboardWindow(NOW - 10 * DAY, false, cutoff)).toBe(true);
  });
  it("oude lead buiten venster, geen follow-up → verborgen", () => {
    expect(isWithinDashboardWindow(NOW - 100 * DAY, false, cutoff)).toBe(false);
  });
  it("grens (leadCreatedAt == cutoff) → zichtbaar (>=)", () => {
    expect(isWithinDashboardWindow(cutoff, false, cutoff)).toBe(true);
  });
});

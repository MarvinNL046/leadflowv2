import { describe, it, expect } from "vitest";
import { validateCallbackPresets } from "./crmSettingsLogic";

describe("validateCallbackPresets", () => {
  it("geldige lijst → null", () => {
    expect(
      validateCallbackPresets([
        { days: 1, label: "Morgen" },
        { days: 7, label: "Week" },
      ]),
    ).toBeNull();
  });
  it("lege lijst → null (UI valt terug op default)", () => {
    expect(validateCallbackPresets([])).toBeNull();
  });
  it(">8 items → fout", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      days: i + 1,
      label: "x",
    }));
    expect(validateCallbackPresets(many)).toMatch(/8/);
  });
  it("days 0 of >365 → fout", () => {
    expect(validateCallbackPresets([{ days: 0, label: "x" }])).not.toBeNull();
    expect(validateCallbackPresets([{ days: 400, label: "x" }])).not.toBeNull();
  });
  it("niet-geheel days → fout", () => {
    expect(validateCallbackPresets([{ days: 1.5, label: "x" }])).not.toBeNull();
  });
  it("leeg label → fout", () => {
    expect(validateCallbackPresets([{ days: 1, label: "  " }])).not.toBeNull();
  });
  it("dubbele days → fout", () => {
    expect(
      validateCallbackPresets([
        { days: 3, label: "a" },
        { days: 3, label: "b" },
      ]),
    ).toMatch(/3/);
  });
});

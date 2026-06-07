import { describe, it, expect } from "vitest";
import { slugifyKey, validateDefinition } from "./customFieldsLogic";

describe("slugifyKey", () => {
  it("normaliseert naar snake_case", () => {
    expect(slugifyKey("Type woning")).toBe("type_woning");
    expect(slugifyKey("Budget (€)")).toBe("budget");
    expect(slugifyKey("  Meerdere   spaties ")).toBe("meerdere_spaties");
  });
  it("strip diacrieten", () => {
    expect(slugifyKey("José veld")).toBe("jose_veld");
  });
});

describe("validateDefinition", () => {
  it("geldig text-veld → null", () => {
    expect(
      validateDefinition({ label: "Type woning", fieldType: "text" }),
    ).toBeNull();
  });
  it("leeg label → fout", () => {
    expect(validateDefinition({ label: "  ", fieldType: "text" })).not.toBeNull();
  });
  it("select zonder opties → fout", () => {
    expect(
      validateDefinition({ label: "X", fieldType: "select", selectOptions: [] }),
    ).not.toBeNull();
  });
  it("select met opties → null", () => {
    expect(
      validateDefinition({
        label: "X",
        fieldType: "select",
        selectOptions: ["a", "b"],
      }),
    ).toBeNull();
  });
});

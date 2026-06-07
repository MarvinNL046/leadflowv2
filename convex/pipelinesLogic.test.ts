import { describe, it, expect } from "vitest";
import { validatePipelineName } from "./pipelinesLogic";

describe("validatePipelineName", () => {
  it("geldige naam → getrimde value", () => {
    expect(validatePipelineName("  Sales  ")).toEqual({ value: "Sales" });
  });
  it("lege naam → error", () => {
    expect(validatePipelineName("")).toEqual({
      error: "Naam mag niet leeg zijn",
    });
  });
  it("alleen whitespace → error", () => {
    expect(validatePipelineName("   ")).toEqual({
      error: "Naam mag niet leeg zijn",
    });
  });
  it("> 80 tekens → error", () => {
    expect(validatePipelineName("x".repeat(81))).toEqual({
      error: "Naam mag max 80 tekens zijn",
    });
  });
  it("exact 80 tekens → ok", () => {
    const name = "x".repeat(80);
    expect(validatePipelineName(name)).toEqual({ value: name });
  });
});

import { describe, it, expect } from "vitest";
import { validatePipelineName, pickFirstActiveStage } from "./pipelinesLogic";

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

describe("pickFirstActiveStage", () => {
  const mk = (
    order: number,
    isWonStage: boolean,
    isLostStage: boolean,
    name: string,
  ) => ({ order, isWonStage, isLostStage, name });

  it("lege lijst → undefined", () => {
    expect(pickFirstActiveStage([])).toBeUndefined();
  });
  it("alleen closed stages → undefined", () => {
    const stages = [
      mk(0, true, false, "Gewonnen"),
      mk(1, false, true, "Verloren"),
    ];
    expect(pickFirstActiveStage(stages)).toBeUndefined();
  });
  it("normaal → laagste-order actieve stage", () => {
    const stages = [
      mk(0, false, false, "Lead"),
      mk(1, false, false, "Contact"),
      mk(2, true, false, "Gewonnen"),
    ];
    expect(pickFirstActiveStage(stages)?.name).toBe("Lead");
  });
  it("closed op order 0 → sla over, pak eerste actieve", () => {
    const stages = [
      mk(0, false, true, "Verloren"),
      mk(1, false, false, "Lead"),
      mk(2, false, false, "Contact"),
    ];
    expect(pickFirstActiveStage(stages)?.name).toBe("Lead");
  });
  it("ongesorteerde input → sorteert op order", () => {
    const stages = [
      mk(2, false, false, "Voorstel"),
      mk(0, false, false, "Lead"),
      mk(1, false, false, "Contact"),
    ];
    expect(pickFirstActiveStage(stages)?.name).toBe("Lead");
  });
});

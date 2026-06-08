import { describe, it, expect } from "vitest";
import { pickCallAttemptStage } from "./callAttemptStage";

const mk = (name: string) => ({ name });
const stages = [
  mk("Nieuw"),
  mk("1x Gebeld"),
  mk("2x Gebeld"),
  mk("3x Gebeld"),
  mk("Afspraak Ingepland"),
];

describe("pickCallAttemptStage", () => {
  it("attempt 1 → '1x Gebeld'", () => {
    expect(pickCallAttemptStage(stages, 1)?.name).toBe("1x Gebeld");
  });
  it("attempt 2 → '2x Gebeld'", () => {
    expect(pickCallAttemptStage(stages, 2)?.name).toBe("2x Gebeld");
  });
  it("case/whitespace-ongevoelig", () => {
    expect(pickCallAttemptStage([mk("  1X   GEBELD ")], 1)?.name).toBe(
      "  1X   GEBELD ",
    );
  });
  it("geen match → undefined (graceful: opp blijft, Fix A verbergt)", () => {
    expect(
      pickCallAttemptStage([mk("Lead"), mk("Contact")], 1),
    ).toBeUndefined();
  });
  it("geen false-positive op '11x Gebeld' voor attempt 1", () => {
    expect(pickCallAttemptStage([mk("11x Gebeld")], 1)).toBeUndefined();
  });
});

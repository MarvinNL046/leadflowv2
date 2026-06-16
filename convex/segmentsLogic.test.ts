import { describe, it, expect } from "vitest";
import {
  contactMatchesRules,
  isMailable,
  dedupeByEmail,
  type MatchableContact,
} from "./segmentsLogic";

const base: MatchableContact = {
  emailMarketingStatus: undefined,
  email: "a@x.nl",
  tags: ["klant"],
  city: "Maastricht",
  province: "Limburg",
  callCount: 0,
  createdAt: 1_000,
  stageId: "stage_won",
  source: "meta",
  custom: {},
};

describe("isMailable", () => {
  it("subscribed (afwezig) + email = mailbaar", () => {
    expect(isMailable({ emailMarketingStatus: undefined, email: "a@x.nl" })).toBe(true);
  });
  it("unsubscribed = niet mailbaar", () => {
    expect(isMailable({ emailMarketingStatus: "unsubscribed", email: "a@x.nl" })).toBe(false);
  });
  it("cleaned = niet mailbaar", () => {
    expect(isMailable({ emailMarketingStatus: "cleaned", email: "a@x.nl" })).toBe(false);
  });
  it("geen email = niet mailbaar", () => {
    expect(isMailable({ emailMarketingStatus: undefined, email: undefined })).toBe(false);
  });
});

describe("contactMatchesRules", () => {
  it("match all: alle condities waar", () => {
    const rules = {
      match: "all" as const,
      conditions: [
        { field: "tags", op: "contains", value: "klant" },
        { field: "city", op: "eq", value: "Maastricht" },
      ],
    };
    expect(contactMatchesRules(base, rules)).toBe(true);
  });
  it("match all: één conditie onwaar → false", () => {
    const rules = {
      match: "all" as const,
      conditions: [
        { field: "tags", op: "contains", value: "klant" },
        { field: "city", op: "eq", value: "Heerlen" },
      ],
    };
    expect(contactMatchesRules(base, rules)).toBe(false);
  });
  it("match any: minstens één waar → true", () => {
    const rules = {
      match: "any" as const,
      conditions: [
        { field: "city", op: "eq", value: "Heerlen" },
        { field: "source", op: "eq", value: "meta" },
      ],
    };
    expect(contactMatchesRules(base, rules)).toBe(true);
  });
  it("callCount gt", () => {
    const rules = { match: "all" as const, conditions: [{ field: "callCount", op: "gt", value: 0 }] };
    expect(contactMatchesRules(base, rules)).toBe(false);
    expect(contactMatchesRules({ ...base, callCount: 3 }, rules)).toBe(true);
  });
  it("createdAt before", () => {
    const rules = { match: "all" as const, conditions: [{ field: "createdAt", op: "before", value: 2000 }] };
    expect(contactMatchesRules(base, rules)).toBe(true);
  });
  it("custom veld", () => {
    const rules = { match: "all" as const, conditions: [{ field: "custom:huistype", op: "eq", value: "vrijstaand" }] };
    expect(contactMatchesRules({ ...base, custom: { huistype: "vrijstaand" } }, rules)).toBe(true);
  });
  it("lege condities → iedereen matcht", () => {
    expect(contactMatchesRules(base, { match: "all", conditions: [] })).toBe(true);
  });
});

describe("dedupeByEmail", () => {
  it("houdt eerste per (lowercased) email, dropt rest + lege emails", () => {
    const rows = [
      { id: "1", email: "A@x.nl" },
      { id: "2", email: "a@x.nl" },
      { id: "3", email: undefined },
      { id: "4", email: "b@x.nl" },
    ];
    expect(dedupeByEmail(rows).map((r) => r.id)).toEqual(["1", "4"]);
  });
});

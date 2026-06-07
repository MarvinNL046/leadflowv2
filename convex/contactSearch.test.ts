import { describe, it, expect } from "vitest";
import {
  normalizeForSearch,
  contactMatchesSearch,
  contactMatchesFilters,
  compareContacts,
} from "./contactSearch";

const base = {
  _creationTime: 1000,
  firstName: "Jan",
  lastName: "Jansen",
  email: "jan@example.nl",
  phone: "0612345678",
  company: "Acme",
  city: "Maastricht",
};

describe("normalizeForSearch", () => {
  it("lowercased + diacrieten gestript", () => {
    expect(normalizeForSearch("José")).toBe("jose");
    expect(normalizeForSearch("MÜNCHEN")).toBe("munchen");
  });
});

describe("contactMatchesSearch", () => {
  it("matcht op voornaam, email, telefoon, plaats", () => {
    expect(contactMatchesSearch(base, normalizeForSearch("jan"))).toBe(true);
    expect(contactMatchesSearch(base, normalizeForSearch("example"))).toBe(true);
    expect(contactMatchesSearch(base, normalizeForSearch("0612"))).toBe(true);
    expect(contactMatchesSearch(base, normalizeForSearch("maastricht"))).toBe(true);
  });
  it("matcht op bedrijf", () => {
    expect(contactMatchesSearch(base, normalizeForSearch("acme"))).toBe(true);
  });
  it("lege term → true", () => {
    expect(contactMatchesSearch(base, "")).toBe(true);
  });
  it("accent-ongevoelig", () => {
    expect(
      contactMatchesSearch({ ...base, city: "München" }, normalizeForSearch("munchen")),
    ).toBe(true);
  });
  it("geen match → false", () => {
    expect(contactMatchesSearch(base, normalizeForSearch("rotterdam"))).toBe(false);
  });
});

describe("contactMatchesFilters", () => {
  it("hasEmail sluit contacten zonder email uit", () => {
    expect(contactMatchesFilters(base, { hasEmail: true })).toBe(true);
    expect(
      contactMatchesFilters({ ...base, email: undefined }, { hasEmail: true }),
    ).toBe(false);
  });
  it("hasPhone sluit contacten zonder telefoon uit", () => {
    expect(
      contactMatchesFilters({ ...base, phone: undefined }, { hasPhone: true }),
    ).toBe(false);
  });
  it("city = exacte match", () => {
    expect(contactMatchesFilters(base, { city: "Maastricht" })).toBe(true);
    expect(contactMatchesFilters(base, { city: "Heerlen" })).toBe(false);
  });
  it("city-filter sluit contact zonder plaats uit", () => {
    expect(
      contactMatchesFilters({ ...base, city: undefined }, { city: "Maastricht" }),
    ).toBe(false);
  });
  it("lege filters → true", () => {
    expect(contactMatchesFilters(base, {})).toBe(true);
  });
  it("combinatie: alle moeten kloppen", () => {
    expect(
      contactMatchesFilters(base, { hasEmail: true, hasPhone: true, city: "Maastricht" }),
    ).toBe(true);
    expect(
      contactMatchesFilters(base, { hasEmail: true, city: "Heerlen" }),
    ).toBe(false);
  });
});

describe("compareContacts", () => {
  const a = { ...base, _creationTime: 100, firstName: "Anna", lastName: "" };
  const b = { ...base, _creationTime: 200, firstName: "Bob", lastName: "" };
  it("newest = nieuwste eerst", () => {
    expect(compareContacts(a, b, "newest")).toBeGreaterThan(0);
    expect([a, b].sort((x, y) => compareContacts(x, y, "newest"))[0]).toBe(b);
  });
  it("oldest = oudste eerst", () => {
    expect([a, b].sort((x, y) => compareContacts(x, y, "oldest"))[0]).toBe(a);
  });
  it("name_asc = A→Z", () => {
    expect([b, a].sort((x, y) => compareContacts(x, y, "name_asc"))[0]).toBe(a);
  });
  it("name_desc = Z→A", () => {
    expect([a, b].sort((x, y) => compareContacts(x, y, "name_desc"))[0]).toBe(b);
  });
  it("naamloos contact valt terug op email", () => {
    const noName = { ...base, firstName: undefined, lastName: undefined, email: "zzz@x.nl" };
    expect(typeof compareContacts(noName, a, "name_asc")).toBe("number");
  });
});

describe("search + filter gecombineerd", () => {
  it("beide criteria moeten matchen", () => {
    const list = [
      base,
      { ...base, email: undefined }, // matcht zoek maar valt af op hasEmail
      { ...base, city: "Heerlen" }, // matcht zoek maar valt af op city
    ];
    const out = list.filter(
      (c) =>
        contactMatchesSearch(c, normalizeForSearch("jan")) &&
        contactMatchesFilters(c, { hasEmail: true, city: "Maastricht" }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(base);
  });
});

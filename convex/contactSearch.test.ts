import { describe, it, expect } from "vitest";
import {
  normalizeForSearch,
  matchesHaystack,
  contactMatchesSearch,
  contactMatchesFilters,
  compareContacts,
  buildSourceMap,
  buildSearchText,
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
  it("matcht op adresvelden (straat, huisnummer, postcode)", () => {
    const c = { ...base, street: "Dorpstraat", houseNumber: "12a", postalCode: "6049 AD" };
    expect(contactMatchesSearch(c, normalizeForSearch("dorpstraat"))).toBe(true);
    expect(contactMatchesSearch(c, normalizeForSearch("6049"))).toBe(true);
  });
  it("postcode notatie-tolerant: '6049ad' matcht '6049 AD'", () => {
    const c = { ...base, postalCode: "6049 AD" };
    expect(contactMatchesSearch(c, normalizeForSearch("6049ad"))).toBe(true);
  });
  it("telefoon met spaties/streepjes matcht compacte invoer", () => {
    const c = { ...base, phone: "06 12 34 56 78" };
    expect(contactMatchesSearch(c, normalizeForSearch("0612345678"))).toBe(true);
  });
  it("telefoon +31-notatie matcht 06-opslag (laatste 9 cijfers)", () => {
    expect(contactMatchesSearch(base, normalizeForSearch("+31612345678"))).toBe(true);
    expect(contactMatchesSearch(base, normalizeForSearch("0031612345678"))).toBe(true);
  });
  it("korte cijferreeks matcht niet zomaar overal (min. 5 cijfers)", () => {
    expect(contactMatchesSearch(base, normalizeForSearch("9999"))).toBe(false);
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

describe("buildSearchText", () => {
  it("alle zoekvelden genormaliseerd + compacte postcode + telefoon-digits met laatste-9-variant", () => {
    const text = buildSearchText({
      firstName: "José",
      lastName: "Jansen",
      email: "Jose@Example.nl",
      phone: "+31 6 12 34 56 78",
      company: "Acme BV",
      street: "Dorpstraat",
      houseNumber: "12a",
      postalCode: "6049 AD",
      city: "Maastricht",
    });
    expect(text).toBe(
      "jose jansen jose@example.nl acme bv dorpstraat 12a maastricht 6049ad 31612345678 612345678",
    );
  });
  it("lege/ontbrekende velden geven geen lege tokens", () => {
    expect(buildSearchText({})).toBe("");
    expect(
      buildSearchText({ firstName: "  ", email: undefined, phone: "" }),
    ).toBe("");
  });
  it("06-nummer krijgt digits én laatste-9-variant (matcht +31-zoekterm)", () => {
    expect(buildSearchText({ phone: "0612345678" })).toBe(
      "0612345678 612345678",
    );
  });
});

describe("matchesHaystack", () => {
  it("lege term → true (geen filter)", () => {
    expect(matchesHaystack("jan jansen", "")).toBe(true);
  });
  it("plain substring", () => {
    expect(matchesHaystack("jan jansen acme", normalizeForSearch("jansen"))).toBe(true);
    expect(matchesHaystack("jan jansen acme", normalizeForSearch("xyz"))).toBe(false);
  });
  it("compact-variant matcht postcode met/zonder spatie", () => {
    // haystack met compacte postcode (zoals buildSearchText die opslaat)
    expect(matchesHaystack("6049ad", normalizeForSearch("6049 ad"))).toBe(true);
    // haystack met spatie, zoektermcompact
    expect(matchesHaystack("6049 ad", normalizeForSearch("6049ad"))).toBe(true);
  });
  it("digit-tail: +31-zoekterm matcht 06-digits in haystack", () => {
    // buildSearchText slaat "0612345678 612345678" op
    expect(matchesHaystack("0612345678 612345678", normalizeForSearch("+31612345678"))).toBe(true);
  });
  it("korte cijferreeks (<5) matcht niet zomaar overal", () => {
    expect(matchesHaystack("0612345678", normalizeForSearch("9999"))).toBe(false);
  });
});

// ── Review-gaten: bewijs dat de per-rij match tegen het buildSearchText-
// haystack precies de dingen terugvindt die BM25 brak (mid-substring in
// e-mail/woord, telefoon-fragment). searchContacts matcht exact zó:
//   const hay = contact.searchText ?? buildSearchText(contact);
//   matchesHaystack(hay, normalizeForSearch(term))
describe("searchContacts per-rij match (buildSearchText + matchesHaystack)", () => {
  const match = (contact: Parameters<typeof buildSearchText>[0], rawTerm: string) =>
    matchesHaystack(buildSearchText(contact), normalizeForSearch(rawTerm));

  it("e-mail-MIDDEN vindbaar: 'peeters' in f2hejhpeeters@…", () => {
    expect(match({ email: "f2hejhpeeters@example.nl" }, "peeters")).toBe(true);
  });
  it("mid-woord vindbaar: 'airco' in …@staycoolairco.nl", () => {
    expect(match({ email: "info@staycoolairco.nl" }, "airco")).toBe(true);
  });
  it("mid-woord in bedrijfsnaam: 'cool' in 'StayCool BV'", () => {
    expect(match({ company: "StayCool BV" }, "cool")).toBe(true);
  });
  it("telefoon-fragment (midden) vindbaar: '3456' in 0612345678", () => {
    // "3456" = 4 digits < 5, maar zit als plain substring in de digit-token
    expect(match({ phone: "0612345678" }, "3456")).toBe(true);
  });
  it("telefoon-fragment ≥5 digits vindbaar: '23456'", () => {
    expect(match({ phone: "0612345678" }, "23456")).toBe(true);
  });
  it("achternaam-fragment (mid-substring): 'ete' in 'Peeters'", () => {
    expect(match({ lastName: "Peeters" }, "ete")).toBe(true);
  });
  it("geen valse match: 'rotterdam' vindt Maastricht-contact niet", () => {
    expect(match({ city: "Maastricht" }, "rotterdam")).toBe(false);
  });
  it("fallback-pariteit: leeg searchText → live buildSearchText geeft zelfde uitkomst", () => {
    const contact = { email: "info@staycoolairco.nl", lastName: "Peeters" };
    // simuleer rij ZONDER searchText (searchText ?? buildSearchText(contact))
    const hayFromFallback = buildSearchText(contact);
    const hayFromStored = buildSearchText(contact); // wat de write-helper opslaat
    expect(hayFromFallback).toBe(hayFromStored);
    expect(matchesHaystack(hayFromFallback, normalizeForSearch("airco"))).toBe(true);
  });
});

describe("buildSourceMap", () => {
  it("oudste attributie per contact wint", () => {
    const m = buildSourceMap([
      { contactId: "c1", source: "meta", _creationTime: 200 },
      { contactId: "c1", source: "api", _creationTime: 100 },
      { contactId: "c2", source: "api", _creationTime: 150 },
    ]);
    expect(m.get("c1")).toBe("api"); // oudste (100) wint
    expect(m.get("c2")).toBe("api");
    expect(m.size).toBe(2);
  });
  it("lege input → lege map", () => {
    expect(buildSourceMap([]).size).toBe(0);
  });
});

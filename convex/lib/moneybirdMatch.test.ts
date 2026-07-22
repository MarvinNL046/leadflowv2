import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  normalizePhone,
  phoneLast9,
  mapMoneybirdContact,
  resolveMatch,
  type MoneybirdContactDoc,
} from "./moneybirdMatch";

describe("normalizeEmail", () => {
  it("lowercased + trim", () => {
    expect(normalizeEmail("  Jan@Example.NL ")).toBe("jan@example.nl");
  });
  it("leeg / undefined → undefined", () => {
    expect(normalizeEmail("")).toBeUndefined();
    expect(normalizeEmail("   ")).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
    expect(normalizeEmail(undefined)).toBeUndefined();
  });
});

describe("normalizePhone", () => {
  it("strip naar [d+] (identiek aan createContactFromApp)", () => {
    expect(normalizePhone("06 12 34 56 78")).toBe("0612345678");
    expect(normalizePhone("+31 (0)6-1234 5678")).toBe("+310612345678");
  });
  it("leeg / undefined → undefined", () => {
    expect(normalizePhone("")).toBeUndefined();
    expect(normalizePhone(null)).toBeUndefined();
    expect(normalizePhone("abc")).toBeUndefined();
  });
});

describe("phoneLast9 (notatie-onafhankelijke sleutel)", () => {
  it("+31 / 0031 / 06 → dezelfde laatste-9", () => {
    expect(phoneLast9("+31612345678")).toBe("612345678");
    expect(phoneLast9("0031612345678")).toBe("612345678");
    expect(phoneLast9("0612345678")).toBe("612345678");
    expect(phoneLast9("06 12 34 56 78")).toBe("612345678");
  });
  it("< 9 cijfers → undefined (te kort om te matchen)", () => {
    expect(phoneLast9("12345")).toBeUndefined();
    expect(phoneLast9("063803905")).toBe("063803905"); // exact 9 → ok
    expect(phoneLast9("")).toBeUndefined();
    expect(phoneLast9(null)).toBeUndefined();
  });
});

describe("mapMoneybirdContact", () => {
  it("mapt Moneybird-velden → doc, lege strings worden undefined", () => {
    const doc = mapMoneybirdContact({
      id: 458485019658159363n as unknown as string,
      company_name: "",
      firstname: "Harry",
      lastname: "Meuffels",
      email: "Harrymeuffels@hotmail.com",
      phone: "",
      address1: "Aan de bogen",
      zipcode: "6118",
      city: "Nieuwstadt",
      country: "NL",
    });
    expect(doc).toEqual({
      moneybirdId: "458485019658159363",
      firstName: "Harry",
      lastName: "Meuffels",
      email: "Harrymeuffels@hotmail.com",
      street: "Aan de bogen",
      postalCode: "6118",
      city: "Nieuwstadt",
      country: "NL",
    });
    // company + phone waren "" → niet aanwezig
    expect(doc.company).toBeUndefined();
    expect(doc.phone).toBeUndefined();
  });
});

// ── Dedup-resolutie (kern) ────────────────────────────────────────────────
const emptyMaps = () => ({
  byExternalId: new Map<string, string>(),
  byEmail: new Map<string, string>(),
  byPhoneLast9: new Map<string, string>(),
});

describe("resolveMatch", () => {
  it("echt nieuw (geen enkele sleutel matcht) → null", () => {
    const doc: MoneybirdContactDoc = {
      moneybirdId: "1",
      email: "new@x.nl",
      phone: "0612345678",
    };
    expect(resolveMatch(doc, emptyMaps())).toBeNull();
  });

  it("e-mail-match (notatie-tolerant: hoofdletters/spaties)", () => {
    const maps = emptyMaps();
    maps.byEmail.set("jan@example.nl", "c_email");
    const doc: MoneybirdContactDoc = {
      moneybirdId: "1",
      email: "  JAN@Example.NL  ",
    };
    expect(resolveMatch(doc, maps)).toEqual({
      contactId: "c_email",
      reason: "email",
    });
  });

  it("telefoon-match op laatste-9 over +31/0031/06-notaties heen", () => {
    const maps = emptyMaps();
    // live contact opgeslagen als +31...
    maps.byPhoneLast9.set("612345678", "c_phone");
    // Moneybird heeft 06-notatie met spaties
    const doc: MoneybirdContactDoc = {
      moneybirdId: "1",
      phone: "06 12 34 56 78",
    };
    expect(resolveMatch(doc, maps)).toEqual({
      contactId: "c_phone",
      reason: "phone",
    });
  });

  it("e-mail wint van telefoon als beide matchen (volgorde als createContactFromApp)", () => {
    const maps = emptyMaps();
    maps.byEmail.set("jan@example.nl", "c_email");
    maps.byPhoneLast9.set("612345678", "c_phone");
    const doc: MoneybirdContactDoc = {
      moneybirdId: "1",
      email: "jan@example.nl",
      phone: "0612345678",
    };
    expect(resolveMatch(doc, maps)?.contactId).toBe("c_email");
  });

  it("externalId wint altijd (idempotente rerun-anchor)", () => {
    const maps = emptyMaps();
    maps.byExternalId.set("moneybird:1", "c_ext");
    maps.byEmail.set("jan@example.nl", "c_email");
    const doc: MoneybirdContactDoc = {
      moneybirdId: "1",
      email: "jan@example.nl",
    };
    expect(resolveMatch(doc, maps)).toEqual({
      contactId: "c_ext",
      reason: "externalId",
    });
  });

  it("naam-only doc (geen e-mail/telefoon) → altijd nieuw", () => {
    const maps = emptyMaps();
    maps.byEmail.set("iemand@x.nl", "c1");
    const doc: MoneybirdContactDoc = {
      moneybirdId: "1",
      firstName: "Fam.",
      lastName: "Putters",
    };
    expect(resolveMatch(doc, maps)).toBeNull();
  });

  it("te korte telefoon (<9 cijfers) matcht niet op phone", () => {
    const maps = emptyMaps();
    maps.byPhoneLast9.set("612345678", "c_phone");
    const doc: MoneybirdContactDoc = { moneybirdId: "1", phone: "12345" };
    expect(resolveMatch(doc, maps)).toBeNull();
  });
});

// ── Idempotentie van de backfill-beslissing (twee runs = één contact) ──────
// Simuleert exact de per-doc loop van backfillMoneybirdContact: resolve →
// create-of-merge → maps bijwerken. Bewijst dat een tweede pass over dezelfde
// docs 0 nieuwe contacten oplevert (alles hervonden via externalId).
type SimContact = {
  id: string;
  email?: string;
  phone?: string;
  externalId?: string;
};

function simulateBackfill(
  docs: MoneybirdContactDoc[],
  live: SimContact[],
): { created: number; matched: number; mapping: Record<string, string> } {
  const maps = emptyMaps();
  let seq = 0;
  const nextId = () => `c_new_${seq++}`;
  for (const c of live) {
    if (c.externalId) maps.byExternalId.set(c.externalId, c.id);
    const e = normalizeEmail(c.email);
    if (e && !maps.byEmail.has(e)) maps.byEmail.set(e, c.id);
    const l9 = phoneLast9(c.phone);
    if (l9 && !maps.byPhoneLast9.has(l9)) maps.byPhoneLast9.set(l9, c.id);
  }

  let created = 0;
  let matched = 0;
  const mapping: Record<string, string> = {};
  for (const doc of docs) {
    const externalId = `moneybird:${doc.moneybirdId}`;
    const match = resolveMatch(doc, maps);
    if (match) {
      matched++;
      mapping[doc.moneybirdId] = match.contactId;
      // externalId zetten als 'm ontbrak (net als de mutation) → rerun-anchor
      if (!maps.byExternalId.has(externalId))
        maps.byExternalId.set(externalId, match.contactId);
      continue;
    }
    const id = nextId();
    created++;
    mapping[doc.moneybirdId] = id;
    maps.byExternalId.set(externalId, id);
    const e = normalizeEmail(doc.email);
    if (e && !maps.byEmail.has(e)) maps.byEmail.set(e, id);
    const l9 = phoneLast9(doc.phone);
    if (l9 && !maps.byPhoneLast9.has(l9)) maps.byPhoneLast9.set(l9, id);
    // reflecteer de nieuwe row in de "live"-set voor de volgende run
    live.push({ id, email: doc.email, phone: doc.phone, externalId });
  }
  return { created, matched, mapping };
}

describe("backfill-idempotentie (twee runs = één contact)", () => {
  it("run 2 maakt 0 nieuwe contacten; mapping identiek", () => {
    const docs: MoneybirdContactDoc[] = [
      { moneybirdId: "1", email: "a@x.nl", phone: "0611111111" },
      { moneybirdId: "2", phone: "0622222222" }, // phone-only nieuw
      { moneybirdId: "3", firstName: "Fam.", lastName: "X" }, // naam-only nieuw
    ];
    const live: SimContact[] = [];

    const run1 = simulateBackfill(docs, live);
    expect(run1.created).toBe(3);
    expect(run1.matched).toBe(0);

    const run2 = simulateBackfill(docs, live);
    expect(run2.created).toBe(0); // alles hervonden → geen dubbelen
    expect(run2.matched).toBe(3);
    expect(run2.mapping).toEqual(run1.mapping);
  });

  it("bestaand live-contact (andere herkomst) wordt gematcht, niet gedupliceerd", () => {
    const docs: MoneybirdContactDoc[] = [
      // e-mail bestaat al live (hoofdletter-notatie) → match
      { moneybirdId: "10", email: "STAAND@x.nl", phone: "0699999999" },
      // telefoon bestaat al live als +31 → last-9 match
      { moneybirdId: "11", phone: "06 88 88 88 88" },
    ];
    const live: SimContact[] = [
      { id: "c_existing_email", email: "staand@x.nl" },
      { id: "c_existing_phone", phone: "+31688888888" },
    ];

    const run = simulateBackfill(docs, live);
    expect(run.created).toBe(0);
    expect(run.matched).toBe(2);
    expect(run.mapping["10"]).toBe("c_existing_email");
    expect(run.mapping["11"]).toBe("c_existing_phone");
  });

  it("twee docs in dezelfde run naar hetzelfde nieuwe telefoonnummer → één contact", () => {
    const docs: MoneybirdContactDoc[] = [
      { moneybirdId: "20", phone: "0612345678" },
      { moneybirdId: "21", phone: "+31612345678" }, // zelfde last-9
    ];
    const live: SimContact[] = [];
    const run = simulateBackfill(docs, live);
    expect(run.created).toBe(1); // tweede doc matcht de zojuist-gemaakte
    expect(run.matched).toBe(1);
    expect(run.mapping["20"]).toBe(run.mapping["21"]);
  });
});

import { describe, it, expect } from "vitest";
import { pickChannel, isWithinQuietHours, buildPrompt } from "./helpers";

describe("pickChannel", () => {
  const contact = { phone: "+31612345678", email: "a@b.nl" };
  it("kiest sms vóór email bij order [sms,email]", () => {
    expect(pickChannel(["sms", "email"], contact, null)).toBe("sms");
  });
  it("slaat whatsapp over zonder template, valt terug op sms", () => {
    expect(pickChannel(["whatsapp", "sms"], contact, null)).toBe("sms");
  });
  it("kiest whatsapp mét template", () => {
    expect(pickChannel(["whatsapp", "sms"], contact, "welkom_template")).toBe("whatsapp");
  });
  it("valt terug op email als geen phone", () => {
    expect(pickChannel(["sms", "email"], { email: "a@b.nl" }, null)).toBe("email");
  });
  it("geeft null als geen kanaal beschikbaar", () => {
    expect(pickChannel(["sms"], {}, null)).toBeNull();
  });
});

describe("isWithinQuietHours", () => {
  it("21-8: 23:00 is stil", () => {
    expect(isWithinQuietHours(23, 21, 8)).toBe(true);
  });
  it("21-8: 12:00 is niet stil", () => {
    expect(isWithinQuietHours(12, 21, 8)).toBe(false);
  });
  it("21-8: 7:00 is stil (over middernacht)", () => {
    expect(isWithinQuietHours(7, 21, 8)).toBe(true);
  });
});

describe("buildPrompt", () => {
  it("bevat naam, bookingUrl en verbiedt prijzen", () => {
    const p = buildPrompt({
      businessContext: "StayCool airco Limburg",
      tone: "vriendelijk",
      signature: "Groet, StayCool",
      bookingUrl: "https://afspraken.staycoolairco.nl/",
      contact: { firstName: "Pascal", city: "Reuver" },
      formAnswers: ["ruimte: hele woning"],
    });
    expect(p.system).toContain("https://afspraken.staycoolairco.nl/");
    expect(p.system.toLowerCase()).toContain("geen prijzen");
    expect(p.user).toContain("Pascal");
  });
});

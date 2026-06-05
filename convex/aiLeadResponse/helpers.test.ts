import { describe, it, expect } from "vitest";
import {
  pickChannel,
  isWithinQuietHours,
  buildPrompt,
  msSinceAmsterdamMidnight,
  msUntilAmsterdamHour,
  resolveAiNodeConfig,
} from "./helpers";

describe("resolveAiNodeConfig", () => {
  it("vult veilige defaults bij lege config", () => {
    const c = resolveAiNodeConfig({});
    expect(c.mode).toBe("suggest");
    expect(c.channelOrder).toEqual(["sms", "email"]);
    expect(c.bookingUrl).toContain("afspraken.staycoolairco.nl");
  });
  it("respecteert opgegeven node-config", () => {
    const c = resolveAiNodeConfig({
      mode: "auto",
      channelOrder: ["whatsapp", "sms"],
      bookingUrl: "https://x.nl/",
      goal: "kort opvolgen",
    });
    expect(c.mode).toBe("auto");
    expect(c.channelOrder).toEqual(["whatsapp", "sms"]);
    expect(c.goal).toBe("kort opvolgen");
  });
  it("valt terug op suggest bij onbekende mode", () => {
    expect(resolveAiNodeConfig({ mode: "xxx" }).mode).toBe("suggest");
  });
  it("negeert onbekende kanalen", () => {
    expect(resolveAiNodeConfig({ channelOrder: ["fax", "sms"] }).channelOrder).toEqual([
      "sms",
    ]);
  });
});

describe("msSinceAmsterdamMidnight", () => {
  it("08:30:00 → 8.5u in ms", () => {
    expect(msSinceAmsterdamMidnight(8, 30, 0)).toBe((8 * 3600 + 30 * 60) * 1000);
  });
  it("00:00:00 → 0", () => {
    expect(msSinceAmsterdamMidnight(0, 0, 0)).toBe(0);
  });
});

describe("msUntilAmsterdamHour", () => {
  it("nu 23:00, target 8 → 9u", () => {
    expect(msUntilAmsterdamHour(23, 0, 8)).toBe(9 * 3_600_000);
  });
  it("nu 7:30, target 8 → 30min", () => {
    expect(msUntilAmsterdamHour(7, 30, 8)).toBe(30 * 60_000);
  });
  it("nu precies 8:00, target 8 → volgende dag (24u)", () => {
    expect(msUntilAmsterdamHour(8, 0, 8)).toBe(24 * 3_600_000);
  });
});

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

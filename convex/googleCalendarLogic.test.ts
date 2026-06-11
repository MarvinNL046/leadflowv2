import { describe, expect, it } from "vitest";
import {
  buildAppointmentEvent,
  buildAppointmentLocation,
  buildAppointmentSummary,
} from "./googleCalendarLogic";

const contact = {
  name: "Wiersma Wiersma",
  phone: "0627224015",
  email: "k.wiersma@live.nl",
  city: "Roermond",
};

describe("buildAppointmentSummary", () => {
  it("volgt het afspraken-v2 format: Adviesgesprek {Stad} {Naam} {tel} {email}", () => {
    expect(buildAppointmentSummary(contact)).toBe(
      "Adviesgesprek Roermond Wiersma Wiersma 0627224015 k.wiersma@live.nl",
    );
  });

  it("laat lege/ontbrekende velden weg", () => {
    expect(buildAppointmentSummary({ name: "Jeroen", city: " " })).toBe(
      "Adviesgesprek Jeroen",
    );
  });
});

describe("buildAppointmentLocation", () => {
  it("bouwt straat + huisnummer + toevoeging, stad", () => {
    expect(
      buildAppointmentLocation({
        name: "x",
        street: "Hoofdstraat",
        houseNumber: "27",
        houseNumberAddition: "a",
        city: "Lottum",
      }),
    ).toBe("Hoofdstraat 27 a, Lottum");
  });

  it("valt terug op alleen stad", () => {
    expect(buildAppointmentLocation({ name: "x", city: "Geleen" })).toBe(
      "Geleen",
    );
  });

  it("null zonder adresgegevens", () => {
    expect(buildAppointmentLocation({ name: "x" })).toBeNull();
  });
});

describe("buildAppointmentEvent", () => {
  it("60-minuten event met gele kleur en Amsterdam-tijdzone", () => {
    const start = Date.UTC(2026, 5, 15, 8, 0); // 15 jun 2026 10:00 NL
    const event = buildAppointmentEvent(contact, start);
    expect(event.colorId).toBe("5");
    expect(event.start).toEqual({
      dateTime: new Date(start).toISOString(),
      timeZone: "Europe/Amsterdam",
    });
    expect(event.end).toEqual({
      dateTime: new Date(start + 60 * 60_000).toISOString(),
      timeZone: "Europe/Amsterdam",
    });
    expect(event.location).toBe("Roermond");
  });

  it("laat location weg zonder adres", () => {
    const event = buildAppointmentEvent({ name: "Jeroen" }, 0);
    expect("location" in event).toBe(false);
  });
});

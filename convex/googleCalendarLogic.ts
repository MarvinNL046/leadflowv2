/**
 * Pure builders voor het Google Calendar-event van een adviesgesprek.
 * Format is 1-op-1 overgenomen uit afspraken-v2 (lib/calendar.ts) zodat
 * events uit LeadFlow en het boekingssysteem identiek in de agenda staan.
 */

/** Gele kleur in Google Calendar = adviesgesprek (afspraken-v2 conventie). */
export const SALES_COLOR_ID = "5";
export const TIMEZONE = "Europe/Amsterdam";
/** Duur van een adviesgesprek in minuten (afspraken-v2 conventie). */
export const SLOT_DURATION_MIN = 60;

export interface AppointmentContact {
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  houseNumberAddition?: string | null;
}

/** "Adviesgesprek {Stad} {Naam} {tel} {email}" — lege velden vallen weg. */
export function buildAppointmentSummary(c: AppointmentContact): string {
  return ["Adviesgesprek", c.city, c.name, c.phone, c.email]
    .filter((x): x is string => !!x && x.trim() !== "")
    .join(" ");
}

/** "Straat 12a, Stad" — null als er geen adresdeel bekend is. */
export function buildAppointmentLocation(
  c: AppointmentContact,
): string | null {
  const streetPart = [c.street, c.houseNumber, c.houseNumberAddition]
    .filter((x): x is string => !!x && x.trim() !== "")
    .join(" ");
  const parts = [streetPart, c.city?.trim()].filter((x) => !!x);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Volledige event-body voor de Calendar API insert. */
export function buildAppointmentEvent(
  c: AppointmentContact,
  startMs: number,
): Record<string, unknown> {
  const end = startMs + SLOT_DURATION_MIN * 60_000;
  const location = buildAppointmentLocation(c);
  return {
    summary: buildAppointmentSummary(c),
    colorId: SALES_COLOR_ID,
    ...(location ? { location } : {}),
    description: `Adviesgesprek nieuwe airco (via LeadFlow).\nKlant: ${c.name}\nTel: ${c.phone ?? "—"}\nE-mail: ${c.email ?? "—"}`,
    start: { dateTime: new Date(startMs).toISOString(), timeZone: TIMEZONE },
    end: { dateTime: new Date(end).toISOString(), timeZone: TIMEZONE },
  };
}

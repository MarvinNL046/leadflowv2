export type Channel = "whatsapp" | "sms" | "email";

export function pickChannel(
  order: Channel[],
  contact: { phone?: string; email?: string },
  whatsappTemplateName: string | null,
): Channel | null {
  for (const ch of order) {
    if (ch === "whatsapp" && whatsappTemplateName && contact.phone) return "whatsapp";
    if (ch === "sms" && contact.phone) return "sms";
    if (ch === "email" && contact.email) return "email";
  }
  return null;
}

/** uur 0-23. Quiet-venster mag over middernacht lopen (start > end). */
export function isWithinQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Tijd-helpers werken op de Amsterdamse wandklok-onderdelen (uit
 * Intl.DateTimeFormat met timeZone Europe/Amsterdam) i.p.v. op de
 * server-lokale tijd (Convex draait UTC → setHours zou scheef zijn).
 * Ze berekenen een delta in wandklok-termen die je optelt bij de echte
 * epoch (Date.now()). Een DST-overgang binnen het venster is een zeldzame
 * ±1u-edge en acceptabel.
 */
export function msSinceAmsterdamMidnight(hour: number, minute: number, second: number): number {
  return hour * 3_600_000 + minute * 60_000 + second * 1_000;
}

/** ms vanaf nu tot het eerstvolgende Amsterdamse `targetHour`:00. */
export function msUntilAmsterdamHour(hour: number, minute: number, targetHour: number): number {
  let hours = targetHour - hour;
  if (hours <= 0) hours += 24;
  return hours * 3_600_000 - minute * 60_000;
}

export function buildPrompt(opts: {
  businessContext?: string;
  tone?: string;
  signature?: string;
  bookingUrl: string;
  contact: { firstName?: string; lastName?: string; city?: string };
  formAnswers: string[];
}): { system: string; user: string } {
  const naam = [opts.contact.firstName, opts.contact.lastName].filter(Boolean).join(" ") || "daar";
  const system = [
    opts.businessContext ?? "Wij zijn een installatiebedrijf.",
    `Toon: ${opts.tone ?? "vriendelijk, professioneel, kort, Nederlands"}.`,
    "Schrijf het EERSTE reactiebericht op een nieuwe lead.",
    "Verwelkom de lead, bevestig kort hun aanvraag, en nodig uit om zelf een",
    `vrijblijvende afspraak in te plannen via deze link: ${opts.bookingUrl}`,
    "Regels: GEEN prijzen noemen. Maximaal ~120 woorden. Geen opsommingstekens.",
    opts.signature ? `Sluit af met: ${opts.signature}` : "",
  ].filter(Boolean).join("\n");
  const user = [
    `Naam: ${naam}`,
    opts.contact.city ? `Plaats: ${opts.contact.city}` : "",
    opts.formAnswers.length ? `Aanvraag-details:\n- ${opts.formAnswers.join("\n- ")}` : "",
  ].filter(Boolean).join("\n");
  return { system, user };
}

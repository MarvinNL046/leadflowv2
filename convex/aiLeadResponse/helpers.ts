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

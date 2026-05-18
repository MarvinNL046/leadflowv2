/**
 * Phone-normalisatie naar E.164 format (+31...).
 *
 * Voorbeelden:
 *   "0648169416"          → "+31648169416"  (NL-format)
 *   "+31648169416"        → "+31648169416"  (already E.164)
 *   "31648169416"         → "+31648169416"  (E.164 zonder +)
 *   "0031648169416"       → "+31648169416"  (oud-internationaal)
 *   "+31 6 48 16 94 16"   → "+31648169416"  (spaties weg)
 *   "06-48169416"         → "+31648169416"  (streepjes weg)
 *   "+1 555 123 4567"     → "+15551234567"  (US zonder NL-bias)
 *
 * Returnt undefined als input geen valide telefoon lijkt (< 8 digits).
 * Default-country = NL (uitgaande van Staycool's setup). Internationale
 * nummers met '+' prefix worden ongewijzigd doorgegeven.
 */
export function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;

  // Strip alles behalve digits + leading '+'
  let cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.length === 0) return undefined;

  // Plus-prefix → al internationaal, behoud
  if (cleaned.startsWith("+")) {
    return cleaned.length >= 9 ? cleaned : undefined;
  }

  // 00-prefix (oude internationale notatie) → vervang door +
  if (cleaned.startsWith("00")) {
    const rest = cleaned.slice(2);
    return rest.length >= 7 ? `+${rest}` : undefined;
  }

  // Leading 0 → NL-format, vervang met +31
  if (cleaned.startsWith("0")) {
    const rest = cleaned.slice(1);
    return rest.length >= 7 ? `+31${rest}` : undefined;
  }

  // Geen prefix maar lang genoeg → assume E.164 zonder +
  if (cleaned.length >= 9) {
    return `+${cleaned}`;
  }

  // Te kort om een phone te zijn
  return undefined;
}

/**
 * Email-normalisatie: lowercase + trim. Returnt undefined bij leeg.
 */
export function normalizeEmail(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.toLowerCase().trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Pure helpers voor de Contacts-zoek/filter/sorteer-query. Geen Convex-context
 * → unit-testbaar onder `convex/**\/*.test.ts`.
 */

type ContactLike = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  city?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
};

export type ContactSort = "newest" | "oldest" | "name_asc" | "name_desc";

/** Lowercase + diacrieten strippen (accent-ongevoelig zoeken). */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Substring-match van een (reeds genormaliseerde) term tegen een REEDS
 * genormaliseerde haystack-string. Notatie-tolerant: spaties/streepjes tellen
 * niet mee (postcode "6049 AD" matcht "6049ad", telefoon "06 12 34 56 78"
 * matcht "0612345678"), en telefoonnummers matchen over +31/0031↔06-notaties
 * heen (laatste 9 cijfers).
 *
 * Dit is de kern van de zoeklogica; searchContacts geeft hier per rij het
 * gedenormaliseerde `searchText`-veld (of live buildSearchText-fallback) aan
 * door, zodat de haystack niet per toetsaanslag opnieuw genormaliseerd wordt.
 */
export function matchesHaystack(
  haystackNormalized: string,
  termNormalized: string,
): boolean {
  if (!termNormalized) return true;
  if (haystackNormalized.includes(termNormalized)) return true;

  const compact = (s: string) => s.replace(/[\s-]/g, "");
  if (compact(haystackNormalized).includes(compact(termNormalized))) return true;

  const termDigits = termNormalized.replace(/\D/g, "");
  if (termDigits.length >= 5) {
    const hayDigits = haystackNormalized.replace(/\D/g, "");
    if (hayDigits.includes(termDigits)) return true;
    const tail = termDigits.slice(-9);
    if (tail.length === 9 && hayDigits.includes(tail)) return true;
  }
  return false;
}

/** Substring-match van een (reeds genormaliseerde) term over de tekstvelden.
 * Bouwt de haystack live uit de contactvelden en delegeert naar
 * matchesHaystack. Gebruikt door de cross-app read-API (contactsRead.ts);
 * searchContacts matcht tegen het gedenormaliseerde searchText-veld. Veel
 * klanten staan als "Fam. Achternaam" in de CRM — zoeken op e-mail, telefoon
 * of postcode+huisnummer is dan de snelste route. */
export function contactMatchesSearch(
  contact: ContactLike,
  termNormalized: string,
): boolean {
  if (!termNormalized) return true;
  const haystack = normalizeForSearch(
    [
      contact.firstName,
      contact.lastName,
      contact.email,
      contact.phone,
      contact.company,
      contact.city,
      contact.street,
      contact.houseNumber,
      contact.postalCode,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return matchesHaystack(haystack, termNormalized);
}

/**
 * Gedenormaliseerd zoekveld voor snelle per-rij substring-matching in
 * searchContacts (spatie-gescheiden, reeds genormaliseerde tokens). Zelfde
 * notatie-tolerantie als contactMatchesSearch: compacte postcode ("6049 AD" →
 * "6049ad") en telefoon als digits ("+31 6 12 34 56 78" → "31612345678") plus
 * de laatste-9-variant ("612345678") zodat +31/0031/06-notaties elkaar vinden.
 *
 * Onderhoud: op ALLE schrijfpaden van contacts via de helpers in
 * lib/contactWrite.ts. Nieuw zoekveld? Hier toevoegen + backfill draaien
 * (contactsBackfill.backfillSearchTextAll).
 */
export function buildSearchText(contact: ContactLike): string {
  const tokens: string[] = [];
  const add = (value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) tokens.push(normalizeForSearch(trimmed));
  };
  add(contact.firstName);
  add(contact.lastName);
  add(contact.email);
  add(contact.company);
  add(contact.street);
  add(contact.houseNumber);
  add(contact.city);
  const postalCode = contact.postalCode?.trim();
  if (postalCode) {
    tokens.push(normalizeForSearch(postalCode).replace(/[\s-]/g, ""));
  }
  const phoneDigits = contact.phone?.replace(/\D/g, "") ?? "";
  if (phoneDigits) {
    tokens.push(phoneDigits);
    const tail = phoneDigits.slice(-9);
    if (tail.length === 9 && tail !== phoneDigits) tokens.push(tail);
  }
  return tokens.join(" ");
}

export function contactMatchesFilters(
  contact: ContactLike,
  filters: { hasEmail?: boolean; hasPhone?: boolean; city?: string },
): boolean {
  if (filters.hasEmail && !contact.email) return false;
  if (filters.hasPhone && !contact.phone) return false;
  if (filters.city && contact.city !== filters.city) return false;
  return true;
}

function nameKey(c: ContactLike): string {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return (full || c.email || c.phone || "").toLowerCase();
}

export function compareContacts(
  a: ContactLike & { _creationTime: number },
  b: ContactLike & { _creationTime: number },
  sort: ContactSort,
): number {
  switch (sort) {
    case "oldest":
      return a._creationTime - b._creationTime;
    case "name_asc":
      return nameKey(a).localeCompare(nameKey(b), "nl");
    case "name_desc":
      return nameKey(b).localeCompare(nameKey(a), "nl");
    case "newest":
    default:
      return b._creationTime - a._creationTime;
  }
}

/** Map contactId → bron (oudste attributie wint = oorspronkelijke bron). */
export function buildSourceMap(
  attributions: Array<{
    contactId: string;
    source: string;
    _creationTime: number;
  }>,
): Map<string, string> {
  const map = new Map<string, string>();
  // Sorteer oplopend op _creationTime; de map.has()-check zorgt dat alleen de
  // oudste bron per contactId blijft staan.
  for (const a of [...attributions].sort(
    (x, y) => x._creationTime - y._creationTime,
  )) {
    if (!map.has(a.contactId)) map.set(a.contactId, a.source);
  }
  return map;
}

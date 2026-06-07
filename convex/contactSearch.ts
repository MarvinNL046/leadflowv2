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
};

export type ContactSort = "newest" | "oldest" | "name_asc" | "name_desc";

/** Lowercase + diacrieten strippen (accent-ongevoelig zoeken). */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Substring-match van een (reeds genormaliseerde) term over de tekstvelden. */
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
    ]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(termNormalized);
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

/**
 * Pure helpers voor de Moneybird→leadflow backfill (fase A cutover-aanvulling,
 * 2026-07). Geen Convex-context → unit-testbaar onder `convex/**\/*.test.ts`.
 *
 * De dedup-strategie spiegelt de LIVE dedup uit contactsWrite.createContactFromApp
 * (e-mail eerst, dan telefoon) maar maakt de telefoon-match notatie-tolerant via
 * de laatste-9-cijfers, net als contactSearch.buildSearchText/matchesHaystack.
 * Dat is nodig omdat live contacten telefoons in wisselende notatie opslaan
 * (+31.., 0031.., 06..) terwijl Moneybird "06 12 34 56 78"-achtige strings heeft.
 */

/** Lowercase + trim — identiek aan de e-mail-normalisatie in createContactFromApp. */
export function normalizeEmail(email?: string | null): string | undefined {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

/**
 * Strip naar `[\d+]` — identiek aan de phone-normalisatie in
 * createContactFromApp (dit is wat op nieuwe inserts wordt opgeslagen).
 */
export function normalizePhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const stripped = phone.replace(/[^\d+]/g, "");
  return stripped ? stripped : undefined;
}

/**
 * Laatste 9 cijfers van een telefoonnummer (notatie-onafhankelijke sleutel).
 * +31 6 12 34 56 78 / 0031612345678 / 0612345678 → allemaal "612345678".
 * Retourneert undefined als er < 9 cijfers zijn (te kort om betrouwbaar te
 * matchen — dan valt de dedup terug op alleen e-mail).
 */
export function phoneLast9(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return undefined;
  return digits.slice(-9);
}

export type MoneybirdSourceContact = {
  id?: string | number;
  company_name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  phone?: string | null;
  address1?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
};

export type MoneybirdContactDoc = {
  moneybirdId: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
};

const str = (v?: string | null): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const t = String(v).trim();
  return t ? t : undefined;
};

/**
 * Map een ruwe Moneybird-contactrecord (of het embedded `document.contact`
 * object) naar de genormaliseerde doc die backfillMoneybirdContact verwacht.
 * Lege strings ("") worden undefined. E-mail/telefoon worden hier NIET
 * genormaliseerd — dat doet de mutation, zodat de opgeslagen waarde consistent
 * is met createContactFromApp.
 */
export function mapMoneybirdContact(
  raw: MoneybirdSourceContact,
): MoneybirdContactDoc {
  return {
    moneybirdId: String(raw.id),
    firstName: str(raw.firstname),
    lastName: str(raw.lastname),
    company: str(raw.company_name),
    email: str(raw.email),
    phone: str(raw.phone),
    street: str(raw.address1),
    postalCode: str(raw.zipcode),
    city: str(raw.city),
    country: str(raw.country),
  };
}

export type MatchReason = "email" | "phone" | "externalId" | null;

/**
 * Bepaal of een Moneybird-doc matcht met een reeds-bestaand contact, gegeven
 * lookup-maps die de caller uit de LIVE workspace heeft opgebouwd:
 *  - byExternalId: `moneybird:<id>` → contactId (idempotency-key, wint altijd)
 *  - byEmail:      genormaliseerde e-mail → contactId
 *  - byPhoneLast9: laatste-9-cijfers → contactId
 *
 * Volgorde spiegelt createContactFromApp: externalId (idempotent rerun) → e-mail
 * → telefoon. Retourneert het contactId + de reden, of null als echt nieuw.
 */
export function resolveMatch(
  doc: MoneybirdContactDoc,
  maps: {
    byExternalId: Map<string, string>;
    byEmail: Map<string, string>;
    byPhoneLast9: Map<string, string>;
  },
): { contactId: string; reason: Exclude<MatchReason, null> } | null {
  const ext = maps.byExternalId.get(`moneybird:${doc.moneybirdId}`);
  if (ext) return { contactId: ext, reason: "externalId" };

  const email = normalizeEmail(doc.email);
  if (email) {
    const hit = maps.byEmail.get(email);
    if (hit) return { contactId: hit, reason: "email" };
  }

  const last9 = phoneLast9(doc.phone);
  if (last9) {
    const hit = maps.byPhoneLast9.get(last9);
    if (hit) return { contactId: hit, reason: "phone" };
  }

  return null;
}

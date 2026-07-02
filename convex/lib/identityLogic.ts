/**
 * Pure logica voor de Clerk-identiteits-resolutie.
 * Geen Convex-imports zodat dit hermetisch testbaar is (identityLogic.test.ts).
 */

/**
 * Kies uit users-rijen met hetzelfde e-mailadres de rij die aan de
 * bestaande CRM-data hangt: de rij mét een userProfile wint. Rijen die al
 * aan een ándere Clerk-user gelinkt zijn doen nooit mee. Zo landt een
 * eerste Clerk-login op de échte user (met org/membership/historie) en
 * nooit op een los duplicaat.
 */
export function pickLinkableUser<UserId extends string>(
  candidates: ReadonlyArray<{ _id: UserId; clerkUserId?: string }>,
  userIdsWithProfile: ReadonlySet<string>,
): UserId | null {
  const unlinked = candidates.filter((c) => c.clerkUserId === undefined);
  const withProfile = unlinked.find((c) => userIdsWithProfile.has(c._id));
  return withProfile ? withProfile._id : null;
}

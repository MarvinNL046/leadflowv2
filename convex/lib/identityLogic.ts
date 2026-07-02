/**
 * Pure logica voor de Convex Auth → Clerk identiteits-brug.
 * Geen Convex-imports zodat dit hermetisch testbaar is (identityLogic.test.ts).
 */

/**
 * Convex Auth zet een composiet subject "<userId>|<sessionId>" in het JWT;
 * Clerk-subjects zijn "user_..." zonder pipe. Hiermee routeren we
 * deterministisch tussen beide auth-paden tijdens de migratie.
 */
export function isConvexAuthSubject(subject: string): boolean {
  return subject.includes("|");
}

/**
 * Kies uit users-rijen met hetzelfde e-mailadres de rij die aan de
 * bestaande CRM-data hangt: de rij mét een userProfile wint. Rijen die al
 * aan een ándere Clerk-user gelinkt zijn doen nooit mee. Zo landt Marvin's
 * eerste Clerk-login op de échte user (met org/membership/historie) en
 * nooit op het losse duplicaat dat Convex Auth ooit aanmaakte.
 */
export function pickLinkableUser<UserId extends string>(
  candidates: ReadonlyArray<{ _id: UserId; clerkUserId?: string }>,
  userIdsWithProfile: ReadonlySet<string>,
): UserId | null {
  const unlinked = candidates.filter((c) => c.clerkUserId === undefined);
  const withProfile = unlinked.find((c) => userIdsWithProfile.has(c._id));
  return withProfile ? withProfile._id : null;
}

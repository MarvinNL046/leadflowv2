import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isConvexAuthSubject, pickLinkableUser } from "./identityLogic";

/**
 * Identiteits-brug tijdens de Convex Auth → Clerk migratie.
 *
 * auth.config.ts accepteert tijdelijk BEIDE issuers (Convex Auth self-issued
 * + de gedeelde wetry-Clerk-instance). Deze helper resolvet welk token er
 * binnenkomt en geeft altijd hetzelfde terug als het oude
 * `getAuthUserId(ctx)`: een `Id<"users">` of null. Daardoor hoeven de
 * call-sites (41 stuks in 21 files) alleen de import + functienaam te
 * wisselen — nul gedragsverandering verder.
 *
 * Na de cutover (Convex Auth eruit) blijft alleen het Clerk-pad over en
 * kan de brug versimpeld worden.
 */
export async function getUserId(ctx: QueryCtx): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  if (isConvexAuthSubject(identity.subject)) {
    // Convex Auth-token: library resolvet "<userId>|<sessionId>".
    return await getAuthUserId(ctx);
  }

  // Clerk-token: lookup via de gespiegelde users-rij.
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  return user?._id ?? null;
}

/**
 * Mutation-variant die de users-rij ook AANMAAKT of LINKT (eerste
 * Clerk-login). Aan te roepen vanuit getOrCreateUserProfile zodat het
 * bestaande client-flow (login → getOrCreateUserProfile) ongewijzigd
 * blijft.
 *
 * Link-regels (zelf-migrerend, geen handmatige cutover-stap nodig):
 *  1. Bestaat er al een users-rij met dit Clerk-subject → die.
 *  2. Anders: match op e-mail, maar ALLEEN als Clerk het adres geverifieerd
 *     heeft (de gedeelde instance heeft open sign-up; zonder deze check kan
 *     een vreemde met een onbevestigd adres een bestaand account kapen) —
 *     en alleen naar de rij mét userProfile (pickLinkableUser), zodat het
 *     bekende e-mail-duplicaat in prod nooit het linkdoel wordt.
 *  3. Anders: nieuwe users-rij (vers Clerk-account zonder CRM-historie).
 */
export async function ensureUserId(
  ctx: MutationCtx,
): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  if (isConvexAuthSubject(identity.subject)) {
    // Convex Auth beheert z'n eigen users-rijen; niets te ensuren.
    return await getAuthUserId(ctx);
  }

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (existing !== null) return existing._id;

  const email = identity.email;
  if (email !== undefined && identity.emailVerified === true) {
    const candidates = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .collect();
    const withProfile = new Set<string>();
    for (const candidate of candidates) {
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", candidate._id))
        .unique();
      if (profile !== null) withProfile.add(candidate._id);
    }
    const target = pickLinkableUser(candidates, withProfile);
    if (target !== null) {
      await ctx.db.patch(target, { clerkUserId: identity.subject });
      return target;
    }
  }

  return await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    email,
    emailVerificationTime:
      identity.emailVerified === true ? Date.now() : undefined,
    name: identity.name,
    image: identity.pictureUrl,
  });
}

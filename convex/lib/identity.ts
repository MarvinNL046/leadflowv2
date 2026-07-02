import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { pickLinkableUser } from "./identityLogic";

/**
 * Identiteits-resolutie: Clerk (gedeelde wetry-instance) → users-rij.
 *
 * `identity.subject` is het Clerk user-id ("user_..."); de users-tabel
 * spiegelt dat via `clerkUserId` (index by_clerk_user). Alle call-sites
 * gebruiken deze helper i.p.v. direct ctx.auth, zodat het contract
 * (Id<"users"> of null) op één plek woont.
 *
 * (De Convex Auth-brugfase is per 2026-07 opgeruimd — dit is het
 * Clerk-only eindstation.)
 */
export async function getUserId(ctx: QueryCtx): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  return user?._id ?? null;
}

/**
 * Mutation-variant die de users-rij ook AANMAAKT of LINKT (eerste
 * Clerk-login). Aangeroepen vanuit getOrCreateUserProfile zodat het
 * client-flow (login → getOrCreateUserProfile) simpel blijft.
 *
 * Link-regels:
 *  1. Bestaat er al een users-rij met dit Clerk-subject → die.
 *  2. Anders: match op e-mail, maar ALLEEN als Clerk het adres geverifieerd
 *     heeft (de gedeelde instance heeft open sign-up; zonder deze check kan
 *     een vreemde met een onbevestigd adres een bestaand account kapen) —
 *     en alleen naar de rij mét userProfile (pickLinkableUser).
 *  3. Anders: nieuwe users-rij (vers account zonder CRM-historie).
 */
export async function ensureUserId(
  ctx: MutationCtx,
): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

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

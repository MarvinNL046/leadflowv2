import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Haalt de app-level userProfile voor de huidig ingelogde gebruiker op,
 * of maakt 'm aan als die nog niet bestaat (eerste sign-in).
 *
 * Convex Auth's `authTables.users` houdt de identity (email, name, etc.)
 * bij; `userProfiles` houdt LeadFlow-specifieke velden (locale,
 * isSuperAdmin, lastLoginAt) bij in een aparte tabel met FK.
 *
 * Roep aan vanaf de client direct na een succesvolle sign-in. Idempotent.
 *
 * Super-admin bootstrap: marvinsmit1988@gmail.com én info@staycoolairco.nl
 * krijgen automatisch isSuperAdmin=true (Marvin's persoonlijke +
 * Staycool's bedrijfs-mailbox). Voor andere users start `false` —
 * bewuste opt-in vereist (later via admin-UI of handmatige Convex
 * dashboard SQL).
 */
const SUPER_ADMIN_EMAILS = new Set([
  "marvinsmit1988@gmail.com",
  "info@staycoolairco.nl",
]);
export const getOrCreateUserProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Convex Auth-side user-id zit op identity.subject (string die ook
    // matched met de _id van de row in `users` table).
    const userId = identity.subject as any;

    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      // Bump lastLoginAt op elke aanroep — goedkope analytics
      await ctx.db.patch(existing._id, { lastLoginAt: Date.now() });
      return existing;
    }

    // Eerste login: maak profile aan
    const isSuperAdmin = SUPER_ADMIN_EMAILS.has(identity.email ?? "");
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      firstName: undefined,
      lastName: undefined,
      locale: "nl",
      isSuperAdmin,
      lastLoginAt: Date.now(),
    });

    return await ctx.db.get(profileId);
  },
});

/**
 * Read-only helper voor de current user's profile. Returned null als
 * niet ingelogd of als profile nog niet aangemaakt is (front-end roept
 * dan eerst getOrCreateUserProfile aan).
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject as any;
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

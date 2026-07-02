import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getSuperAdminEmails } from "./lib/env";
import { ensureUserId, getUserId } from "./lib/identity";

/**
 * Haalt de app-level userProfile voor de huidig ingelogde gebruiker op,
 * of maakt 'm aan als die nog niet bestaat (eerste sign-in).
 *
 * De users-tabel spiegelt de Clerk-identity (email, name, etc.);
 * `userProfiles` houdt LeadFlow-specifieke velden (locale,
 * isSuperAdmin, lastLoginAt) bij in een aparte tabel met FK.
 *
 * Roep aan vanaf de client direct na een succesvolle sign-in. Idempotent.
 *
 * Super-admin bootstrap: marvinsmit1988@gmail.com én info@staycoolairco.nl
 * krijgen automatisch isSuperAdmin=true (Marvin's persoonlijke +
 * Staycool's bedrijfs-mailbox). Voor andere users start `false` —
 * bewuste opt-in vereist (later via admin-UI of invite-flow).
 *
 * Multi-tenant bootstrap: voor super-admins zorgt deze mutation óók dat
 * de Staycool-org + default workspace + owner-membership bestaan. Eerste
 * super-admin maakt de tenant aan; volgende super-admins joinen als
 * owner van dezelfde tenant. Non-super-admins krijgen géén auto-tenant
 * (wachten op invite of admin-toewijzing later).
 *
 * BELANGRIJK: gebruik de helpers uit lib/identity.ts (getUserId /
 * ensureUserId), NIET `identity.subject` direct — de resolutie naar een
 * plain Id<"users"> woont op één plek. ensureUserId maakt of linkt bij
 * een eerste Clerk-login ook de users-rij (e-mail-match alleen op
 * geverifieerd adres, en alleen naar de rij mét profile).
 */
// Super-admin e-mails uit env (SUPER_ADMIN_EMAILS, comma-gescheiden);
// fallback op de bekende set zodat het nooit stilvalt.
const SUPER_ADMIN_EMAILS = getSuperAdminEmails();

const STAYCOOL_ORG_SLUG = "staycool";
const STAYCOOL_ORG_NAME = "Staycool Airconditioning";
const DEFAULT_WORKSPACE_NAME = "Default";

export const getOrCreateUserProfile = mutation({
  args: {},
  handler: async (ctx) => {
    // ensureUserId i.p.v. getUserId: maakt/linkt de users-rij bij een
    // eerste Clerk-login (idempotent, no-op onder Convex Auth).
    const userId = await ensureUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      // Bump lastLoginAt op elke aanroep — goedkope analytics
      await ctx.db.patch(existing._id, { lastLoginAt: Date.now() });
      // Bootstrap kan al gedaan zijn; ensure idempotent voor super-admins
      // die de eerste keer inloggen ná een schema-reset.
      if (existing.isSuperAdmin) {
        await ensureStaycoolTenant(ctx, userId);
      }
      return existing;
    }

    // Eerste login: maak profile aan. Email komt uit de users-rij (door
    // ensureUserId net gespiegeld vanuit de Clerk-identity).
    const authUser = await ctx.db.get(userId);
    const email = authUser?.email ?? "";
    // Lowercase vóór de match: getSuperAdminEmails() lowercased de
    // env-entries al; Clerk kan e-mails met hoofdletters aanleveren.
    // GEVERIFIEERD-gate: super-admin (en dus de Staycool-tenant) alleen
    // voor rijen met bevestigd e-mailadres — de gedeelde Clerk-instance
    // heeft open sign-up, dus een onbevestigde rij met een super-admin-
    // adres mag nooit tenant-toegang opleveren.
    const isSuperAdmin =
      authUser?.emailVerificationTime !== undefined &&
      SUPER_ADMIN_EMAILS.has(email.toLowerCase());

    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      firstName: undefined,
      lastName: undefined,
      locale: "nl",
      isSuperAdmin,
      lastLoginAt: Date.now(),
    });

    // Super-admins krijgen meteen toegang tot de Staycool-tenant.
    if (isSuperAdmin) {
      await ensureStaycoolTenant(ctx, userId);
    }

    return await ctx.db.get(profileId);
  },
});

/**
 * Idempotent helper: zorgt dat de Staycool-org + default workspace +
 * owner-membership voor `userId` bestaan. Wordt aangeroepen vanuit
 * getOrCreateUserProfile voor super-admins. Veilig om vaker te
 * draaien — checkt bestaan voor elke insert.
 *
 * Niet als losse mutation geëxposed om accidentele tenant-creation door
 * non-super-admins te voorkomen.
 */
async function ensureStaycoolTenant(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  // 1. Find or create Staycool org via slug
  let org = await ctx.db
    .query("orgs")
    .withIndex("by_slug", (q) => q.eq("slug", STAYCOOL_ORG_SLUG))
    .unique();

  if (!org) {
    const orgId = await ctx.db.insert("orgs", {
      name: STAYCOOL_ORG_NAME,
      slug: STAYCOOL_ORG_SLUG,
      ownerId: userId,
    });
    org = await ctx.db.get(orgId);
  }
  if (!org) return;

  // 2. Find or create default workspace under org
  let workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_org", (q) => q.eq("orgId", org!._id))
    .filter((q) => q.eq(q.field("isDefault"), true))
    .first();

  if (!workspace) {
    const workspaceId = await ctx.db.insert("workspaces", {
      orgId: org._id,
      name: DEFAULT_WORKSPACE_NAME,
      isDefault: true,
    });
    workspace = await ctx.db.get(workspaceId);
  }
  if (!workspace) return;

  // 3. Find or create owner-membership voor deze user
  const existingMembership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", org!._id)
    )
    .first();

  if (!existingMembership) {
    await ctx.db.insert("memberships", {
      userId,
      orgId: org._id,
      workspaceId: workspace._id,
      role: "owner",
    });
  }
}

/**
 * Interne resolver voor actions (die hebben geen ctx.db en kunnen de
 * Clerk-lookup uit lib/identity.ts dus niet zelf doen). Gebruikt door
 * metaOauth.startOauth via ctx.runQuery.
 */
export const currentUserId = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"users"> | null> => {
    return await getUserId(ctx);
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
    const userId = await getUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

/**
 * Returnt alle orgs + workspaces waar deze user member van is. Voor de
 * home page om "je bent member van Staycool / Default" te tonen, en
 * voor straks: org-switcher in de header.
 */
export const myTenants = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId))
      .collect();

    return Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.orgId);
        const workspace = m.workspaceId
          ? await ctx.db.get(m.workspaceId)
          : null;
        return {
          membershipId: m._id,
          role: m.role,
          org: org ? { id: org._id, name: org.name, slug: org.slug } : null,
          workspace: workspace
            ? { id: workspace._id, name: workspace.name }
            : null,
        };
      })
    );
  },
});

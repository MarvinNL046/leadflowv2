import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Contacts queries + mutations voor het CRM core.
 *
 * Multi-tenant guard: elke query/mutation valideert dat de current user
 * lid is van de target workspace via memberships. Geen leak tussen
 * workspaces ook al kent een lekkende client een workspaceId.
 */

/**
 * Helper: assert dat de current user member is van de gegeven workspace.
 * Returnt de user-id voor downstream gebruik. Throws op niet-auth of
 * non-member.
 */
async function requireWorkspaceMembership(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Workspace bestaat?
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  // User member van deze org?
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();

  if (!membership) {
    throw new Error("Not a member of this workspace");
  }

  return userId;
}

/**
 * List contacts voor een workspace, nieuwste eerst. Geen filter/paginering
 * in v1 — limit 100 voor de demo. Voor productie: cursor-paginering en
 * tags/search filters later.
 */
export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    return await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(100);
  },
});

/**
 * Aantal contacts in een workspace — voor list-header counter.
 * Goedkoper dan list().length op grote datasets.
 */
export const count = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const rows = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();
    return rows.length;
  },
});

/**
 * Incoming leads voor het dashboard. Returnt contacts die werk vergen,
 * met source-attribution voor weergave per lead-card.
 *
 * v1-pattern: drie tabs (all / follow_up / new) — hier de raw data,
 * frontend doet de tab-filtering.
 *
 * Verrijking per lead:
 *  - latest leadAttribution row (source + meta_form_name)
 *  - laatst toegevoegde note (latestNote string)
 *  - opportunity stages (voor follow-up classificatie later)
 */
export const listIncomingLeads = query({
  args: {
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const limit = Math.min(args.limit ?? 50, 200);

    const rawContacts = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(limit * 2);  // overshoot zodat na filter nog ~limit overblijft

    // Filter: skip outside-area markeerde contacts uit het dashboard
    const contacts = rawContacts
      .filter((c) => !c.outsideArea)
      .slice(0, limit);

    // Per contact: laad attribution + latest note in parallel
    const enriched = await Promise.all(
      contacts.map(async (c) => {
        const attribution = await ctx.db
          .query("leadAttribution")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .order("desc")
          .first();

        const latestNote = await ctx.db
          .query("notes")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .order("desc")
          .first();

        return {
          ...c,
          leadSource: attribution?.source ?? null,
          metaFormId: attribution?.metaFormId ?? null,
          latestNote: latestNote?.body ?? null,
          leadCreatedAt: attribution?._creationTime ?? c._creationTime,
        };
      }),
    );

    return enriched;
  },
});

/**
 * Per-contact action mutations voor call-flow vanaf het dashboard.
 * Alle vier vereisen workspace-membership voor de contact's workspace.
 */
async function requireMembershipForContact(
  ctx: any,
  contactId: Id<"contacts">,
): Promise<{ contact: any; userId: Id<"users"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const contact = await ctx.db.get(contactId);
  if (!contact) throw new Error("Contact not found");

  const workspace = await ctx.db.get(contact.workspaceId);
  if (!workspace) throw new Error("Workspace not found");

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q: any) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();
  if (!membership) throw new Error("Not a member of this workspace");

  return { contact, userId };
}

/**
 * Markeer dat er gebeld is + uitkomst. Bumpt callCount, set lastCallAt,
 * set lastCallResult. Gebruikt door call-flow modal op /crm dashboard.
 */
export const recordCall = mutation({
  args: {
    contactId: v.id("contacts"),
    result: v.union(
      v.literal("answered"),
      v.literal("not_answered"),
      v.literal("invalid"),
    ),
  },
  handler: async (ctx, args) => {
    const { contact } = await requireMembershipForContact(ctx, args.contactId);
    await ctx.db.patch(args.contactId, {
      callCount: (contact.callCount ?? 0) + 1,
      lastCallAt: Date.now(),
      lastCallResult: args.result,
    });
  },
});

/**
 * Markeer een lead als "buiten werkgebied" (Limburg only voor Staycool).
 * Verbergt 'm uit het Nieuwe-leads dashboard zonder te deleten — blijft
 * vindbaar in Contacts voor audit.
 */
export const markOutsideArea = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    await requireMembershipForContact(ctx, args.contactId);
    await ctx.db.patch(args.contactId, { outsideArea: true });
  },
});

/**
 * Maak een nieuwe contact aan. Minimaal: workspace + 1 van
 * {firstName, lastName, email, phone}. Geen volledige dedup-check (komt
 * later in v2 wanneer Meta-leads + website-leads geïmporteerd worden).
 */
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    // Validatie: minstens 1 identifier veld
    const hasIdentifier = [
      args.firstName,
      args.lastName,
      args.email,
      args.phone,
    ].some((v) => typeof v === "string" && v.trim().length > 0);

    if (!hasIdentifier) {
      throw new Error(
        "Minstens één van firstName, lastName, email of phone is verplicht",
      );
    }

    const contactId = await ctx.db.insert("contacts", {
      workspaceId: args.workspaceId,
      firstName: args.firstName?.trim() || undefined,
      lastName: args.lastName?.trim() || undefined,
      email: args.email?.trim().toLowerCase() || undefined,
      phone: args.phone?.trim() || undefined,
      company: args.company?.trim() || undefined,
      city: args.city?.trim() || undefined,
      callCount: 0,
    });

    return await ctx.db.get(contactId);
  },
});

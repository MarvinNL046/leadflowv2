import { v } from "convex/values";
import { getUserId } from "./lib/identity";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Notes voor contacts — vrije-tekst memos, vooral voor Meta-leads waar de
 * processor de niet-gemapte form-antwoorden als note opslaat (zie
 * convex/metaProcessor.ts).
 */

async function requireMembershipForContact(
  ctx: QueryCtx | MutationCtx,
  contactId: Id<"contacts">,
): Promise<{ workspaceId: Id<"workspaces">; userId: Id<"users"> }> {
  const userId = await getUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const contact = await ctx.db.get(contactId);
  if (!contact) throw new Error("Contact not found");

  const workspace = await ctx.db.get(contact.workspaceId);
  if (!workspace) throw new Error("Workspace not found");

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();
  if (!membership) throw new Error("Not a member of this workspace");

  return { workspaceId: contact.workspaceId, userId };
}

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    await requireMembershipForContact(ctx, args.contactId);
    return await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .take(50);
  },
});

export const create = mutation({
  args: {
    contactId: v.id("contacts"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspaceId, userId } = await requireMembershipForContact(
      ctx,
      args.contactId,
    );

    const body = args.body.trim();
    if (body.length === 0) throw new Error("Notitie mag niet leeg zijn");

    return await ctx.db.insert("notes", {
      workspaceId,
      contactId: args.contactId,
      body,
      createdById: userId,
    });
  },
});

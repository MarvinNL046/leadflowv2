import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function requireWorkspaceMembership(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();
  if (!membership) throw new Error("Not a member of this workspace");
}

/**
 * Definitions + bijbehorende waardes voor één contact, gesorteerd op
 * sortOrder. Returns [{ definition, value }, ...] zodat de UI ook
 * lege velden kan tonen ("—") in plaats van alleen ingevulde waardes.
 */
export const listForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return null;
    await requireWorkspaceMembership(ctx, contact.workspaceId);

    const defs = await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_workspace_entity", (q) =>
        q.eq("workspaceId", contact.workspaceId).eq("entityType", "contact"),
      )
      .collect();

    const values = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "contact").eq("entityId", args.contactId),
      )
      .collect();

    const valueByDef = new Map(values.map((v) => [v.definitionId, v.value]));

    return defs
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({ definition: d, value: valueByDef.get(d._id) ?? null }));
  },
});

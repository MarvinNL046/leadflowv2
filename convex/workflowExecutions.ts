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
 * Workflow-uitvoeringen voor één contact, met workflow-naam inline.
 * Gesorteerd op startedAt desc. Voor de contact-detail "Workflow history"
 * sectie.
 */
export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await requireWorkspaceMembership(ctx, contact.workspaceId);

    const executions = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "contact").eq("entityId", args.contactId),
      )
      .order("desc")
      .take(50);

    const enriched = await Promise.all(
      executions.map(async (exec) => {
        const workflow = await ctx.db.get(exec.workflowId);
        return {
          _id: exec._id,
          workflowName: workflow?.name ?? "Onbekend",
          status: exec.status,
          currentNodeId: exec.currentNodeId,
          startedAt: exec.startedAt,
          completedAt: exec.completedAt,
        };
      }),
    );
    return enriched;
  },
});

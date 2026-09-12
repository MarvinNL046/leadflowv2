import {requireWorkspacePermission, type CompanyPermission} from './lib/permissions';
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function requireWorkspaceMembership(ctx: QueryCtx, workspaceId: Id<"workspaces">, permission: CompanyPermission = 'crm') {
  return (await requireWorkspacePermission(ctx, workspaceId, permission)).userId;
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

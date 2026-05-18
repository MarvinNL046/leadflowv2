import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Workflow dashboard-queries — public, met workspace-membership-guard.
 * Geen mutaties yet (visual builder komt later, workflows worden via
 * seed-script of migration.ts-mutations aangemaakt).
 */

async function requireWorkspaceMembership(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<Id<"users">> {
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
  return userId;
}

/**
 * Workflows-overview voor dashboard. Returnt per workflow:
 *  - meta (naam, status, beschrijving, counts)
 *  - recent 10 executions met contact-naam join
 *
 * 1 query voor de hele lijst — keeps roundtrips laag.
 */
export const listForDashboard = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(50);

    const enriched = await Promise.all(
      workflows.map(async (wf) => {
        const executions = await ctx.db
          .query("workflowExecutions")
          .withIndex("by_workflow", (q) => q.eq("workflowId", wf._id))
          .order("desc")
          .take(10);

        const execsWithContact = await Promise.all(
          executions.map(async (e) => {
            let contactName = "Onbekend";
            if (e.entityType === "contact") {
              const c = await ctx.db.get(e.entityId as Id<"contacts">);
              if (c) {
                contactName =
                  [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                  c.email ||
                  c.phone ||
                  "Onbekend";
              }
            }
            return {
              _id: e._id,
              _creationTime: e._creationTime,
              status: e.status,
              currentNodeId: e.currentNodeId,
              startedAt: e.startedAt,
              completedAt: e.completedAt,
              pausedUntil: e.pausedUntil,
              entityType: e.entityType,
              entityId: e.entityId,
              contactName,
            };
          }),
        );

        return {
          _id: wf._id,
          name: wf.name,
          description: wf.description,
          status: wf.status,
          totalExecutions: wf.totalExecutions,
          successfulExecutions: wf.successfulExecutions,
          failedExecutions: wf.failedExecutions,
          lastExecutedAt: wf.lastExecutedAt,
          triggerTypes: wf.triggerConfig.map((t) => t.type),
          recentExecutions: execsWithContact,
        };
      }),
    );

    return enriched;
  },
});

/**
 * DEBUG — logs per execution voor verifieren wat per node lukte/faalde.
 * Public temporary; vervangen door per-execution detail-route later.
 */
export const debugExecutionLogs = query({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const wf = await ctx.db.get(args.workflowId);
    if (!wf) return null;
    await requireWorkspaceMembership(ctx, wf.workspaceId);

    const executions = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .order("desc")
      .take(5);

    return await Promise.all(
      executions.map(async (e) => {
        const logs = await ctx.db
          .query("workflowExecutionLogs")
          .withIndex("by_execution", (q) => q.eq("executionId", e._id))
          .collect();
        return {
          executionId: e._id,
          status: e.status,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          logs: logs.map((l) => ({
            nodeId: l.nodeId,
            nodeType: l.nodeType,
            status: l.status,
            error: l.error,
            output: l.output,
            durationMs: l.durationMs,
          })),
        };
      }),
    );
  },
});

/**
 * Detail van één workflow + recent executions + per-execution logs.
 * Voor toekomstige workflow-detail-page.
 */
export const getDetail = query({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const wf = await ctx.db.get(args.workflowId);
    if (!wf) return null;
    await requireWorkspaceMembership(ctx, wf.workspaceId);

    const nodes = await ctx.db
      .query("workflowNodes")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();
    const edges = await ctx.db
      .query("workflowEdges")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();

    return { workflow: wf, nodes, edges };
  },
});

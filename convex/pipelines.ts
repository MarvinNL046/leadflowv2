import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Pipelines + pipeline-stages voor het Kanban board op /crm/pipelines.
 *
 * V2 MVP-scope:
 * - Eén default pipeline per workspace ("Sales") met 5 stages
 * - Geen multi-pipeline UI yet — getDefault returnt de eerste
 * - Geen drag-drop herordening van stages — vaste set bij seed
 */

const DEFAULT_STAGES = [
  { name: "Lead", color: "#94a3b8", isWonStage: false, isLostStage: false },
  { name: "Contact", color: "#60a5fa", isWonStage: false, isLostStage: false },
  { name: "Voorstel", color: "#a78bfa", isWonStage: false, isLostStage: false },
  { name: "Gewonnen", color: "#34d399", isWonStage: true, isLostStage: false },
  { name: "Verloren", color: "#f87171", isWonStage: false, isLostStage: true },
];

async function requireWorkspaceMembership(
  ctx: QueryCtx | MutationCtx,
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
 * Default pipeline + stages voor een workspace. Returnt {pipeline, stages}
 * gesorteerd op stage-order. Auto-seed (idempotent) als nog niets bestaat.
 */
export const getDefault = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const pipeline = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!pipeline) return null;

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
      .collect();

    return { pipeline, stages };
  },
});

/**
 * Idempotent seed — maakt default pipeline + DEFAULT_STAGES voor deze
 * workspace als er nog geen default pipeline is. Veilig om meermaals te
 * draaien (no-op bij hit). Returnt pipelineId.
 */
export const seedDefault = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const existing = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (existing) return { pipelineId: existing._id, created: false };

    const pipelineId = await ctx.db.insert("pipelines", {
      workspaceId: args.workspaceId,
      name: "Sales",
      isDefault: true,
    });

    for (let i = 0; i < DEFAULT_STAGES.length; i++) {
      const s = DEFAULT_STAGES[i];
      await ctx.db.insert("pipelineStages", {
        pipelineId,
        name: s.name,
        order: i,
        color: s.color,
        isWonStage: s.isWonStage,
        isLostStage: s.isLostStage,
      });
    }

    return { pipelineId, created: true };
  },
});

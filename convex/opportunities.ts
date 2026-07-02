import { v } from "convex/values";
import { getUserId } from "./lib/identity";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { computePipelineStats } from "./pipelineStats";

/**
 * Opportunities = deals/sales-kansen, één-op-één gekoppeld aan een contact
 * en gestaged in een pipeline. Drag-drop tussen stages schrijft naar
 * opportunityStageHistory voor audit-trail.
 */

async function requireWorkspaceMembership(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<Id<"users">> {
  const userId = await getUserId(ctx);
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
 * Opportunities voor één contact, met stage-info inline. Voor de
 * contact-detail page — sales wil zien welke deals/leads er bij dit
 * contact horen en in welke stage ze staan.
 */
export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await requireWorkspaceMembership(ctx, contact.workspaceId);

    const opps = await ctx.db
      .query("opportunities")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();

    const enriched = await Promise.all(
      opps.map(async (opp) => {
        const stage = await ctx.db.get(opp.stageId);
        return {
          _id: opp._id,
          title: opp.title,
          value: opp.value,
          currency: opp.currency,
          closedAt: opp.closedAt,
          stageName: stage?.name ?? "Onbekend",
          stageColor: stage?.color,
          stageIsWon: stage?.isWonStage ?? false,
          stageIsLost: stage?.isLostStage ?? false,
        };
      }),
    );
    return enriched.sort((a, b) => {
      // Open opps eerst, dan won/lost achteraan
      const aOpen = !a.stageIsWon && !a.stageIsLost;
      const bOpen = !b.stageIsWon && !b.stageIsLost;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return 0;
    });
  },
});

/**
 * Opportunities voor één pipeline, met contact-info inline voor de Kanban.
 * Geen aparte query per card → minder roundtrips. Limit 200 (groot board).
 */
export const listForKanban = query({
  args: { pipelineId: v.id("pipelines") },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline) throw new Error("Pipeline not found");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    // Stages voor groepering
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) =>
        q.eq("pipelineId", args.pipelineId),
      )
      .collect();

    // Alle opps voor deze pipeline (via per-stage scan, met workspace filter)
    const allOpps: Array<Doc<"opportunities">> = [];
    for (const stage of stages) {
      const rows = await ctx.db
        .query("opportunities")
        .withIndex("by_workspace_stage", (q) =>
          q
            .eq("workspaceId", pipeline.workspaceId)
            .eq("stageId", stage._id),
        )
        .order("desc") // nieuwste leads bovenaan (speed-to-lead)
        .take(200);
      allOpps.push(...rows);
    }

    // Verrijk met contact-naam — parallel via Promise.all
    const enriched = await Promise.all(
      allOpps.map(async (opp) => {
        const contact = await ctx.db.get(opp.contactId);
        const displayName = contact
          ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
            contact.email ||
            contact.phone ||
            "Onbekend"
          : "Onbekend";
        return {
          _id: opp._id,
          _creationTime: opp._creationTime,
          stageId: opp.stageId,
          title: opp.title,
          value: opp.value,
          currency: opp.currency,
          contactId: opp.contactId,
          contactName: displayName,
          contactCity: contact?.city ?? null,
        };
      }),
    );

    return { pipeline, stages, opportunities: enriched };
  },
});

/**
 * Aggregaten voor de kanban-stats-balk: aantallen + win-rate over ÁLLE opps
 * van de pipeline (geen 200-cap zoals listForKanban). Geen €-waarde (value is
 * een uniforme placeholder).
 */
export const pipelineStats = query({
  args: { pipelineId: v.id("pipelines") },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline) throw new Error("Pipeline not found");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) =>
        q.eq("pipelineId", args.pipelineId),
      )
      .collect();

    const opps: Array<{ stageId: string }> = [];
    for (const stage of stages) {
      const rows = await ctx.db
        .query("opportunities")
        .withIndex("by_workspace_stage", (q) =>
          q.eq("workspaceId", pipeline.workspaceId).eq("stageId", stage._id),
        )
        .collect();
      for (const r of rows) opps.push({ stageId: r.stageId });
    }

    return computePipelineStats(stages, opps);
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    pipelineId: v.id("pipelines"),
    stageId: v.id("pipelineStages"),
    title: v.string(),
    value: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireWorkspaceMembership(ctx, args.workspaceId);

    const title = args.title.trim();
    if (title.length === 0) throw new Error("Titel mag niet leeg zijn");

    // Sanity: contact + pipeline + stage moeten in dezelfde workspace zitten
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.workspaceId !== args.workspaceId) {
      throw new Error("Contact hoort niet bij deze workspace");
    }
    const stage = await ctx.db.get(args.stageId);
    if (!stage || stage.pipelineId !== args.pipelineId) {
      throw new Error("Stage hoort niet bij deze pipeline");
    }

    const oppId = await ctx.db.insert("opportunities", {
      workspaceId: args.workspaceId,
      contactId: args.contactId,
      pipelineId: args.pipelineId,
      stageId: args.stageId,
      title,
      value: args.value,
      currency: args.value !== undefined ? "EUR" : undefined,
    });

    // History: initial stage entry voor audit
    await ctx.db.insert("opportunityStageHistory", {
      opportunityId: oppId,
      fromStageId: undefined,
      toStageId: args.stageId,
      changedById: userId,
    });

    return oppId;
  },
});

/**
 * Drag-drop tussen stages. Schrijft naar opportunityStageHistory zodat
 * later een activity-feed dit kan tonen. Idempotent: same-stage move is
 * een no-op (geen history-row).
 */
export const moveToStage = mutation({
  args: {
    opportunityId: v.id("opportunities"),
    toStageId: v.id("pipelineStages"),
  },
  handler: async (ctx, args) => {
    const opp = await ctx.db.get(args.opportunityId);
    if (!opp) throw new Error("Opportunity not found");
    const userId = await requireWorkspaceMembership(ctx, opp.workspaceId);

    if (opp.stageId === args.toStageId) return; // no-op

    const targetStage = await ctx.db.get(args.toStageId);
    if (!targetStage || targetStage.pipelineId !== opp.pipelineId) {
      throw new Error("Doel-stage hoort niet bij deze pipeline");
    }

    const fromStageId = opp.stageId;
    const updates: Partial<Doc<"opportunities">> = { stageId: args.toStageId };
    // Bij Gewonnen/Verloren: closedAt + closedReason setten als nog niet
    if (
      (targetStage.isWonStage || targetStage.isLostStage) &&
      !opp.closedAt
    ) {
      updates.closedAt = Date.now();
      updates.closedReason = targetStage.isWonStage ? "won" : "lost";
    }
    // Bij verplaatsen WEG van een closed-stage: closedAt resetten
    if (!targetStage.isWonStage && !targetStage.isLostStage && opp.closedAt) {
      updates.closedAt = undefined;
      updates.closedReason = undefined;
    }

    await ctx.db.patch(args.opportunityId, updates);
    // Afgehandelde / vastgehouden stage → stop de auto-resurface-klok op het
    // contact, anders sleept de follow-up-cron de opp later terug naar Nieuw.
    // (bug 1: handmatige kanban-sleep naar Gewonnen/Verloren/Vasthouden)
    if (
      targetStage.isWonStage ||
      targetStage.isLostStage ||
      targetStage.noResurface === true
    ) {
      await ctx.db.patch(opp.contactId, { nextFollowUpAt: undefined });
    }
    await ctx.db.insert("opportunityStageHistory", {
      opportunityId: args.opportunityId,
      fromStageId,
      toStageId: args.toStageId,
      changedById: userId,
    });

    // Heropen-logic: als opp uit Lost-stage komt en naar non-closed
    // stage gaat → reset contact.unreachable + outsideArea zodat lead
    // weer in dashboard verschijnt. Auto-note voor audit.
    const fromStage = await ctx.db.get(fromStageId);
    if (
      fromStage?.isLostStage &&
      !targetStage.isLostStage &&
      !targetStage.isWonStage
    ) {
      const contact = await ctx.db.get(opp.contactId);
      if (contact && (contact.unreachable || contact.outsideArea)) {
        await ctx.db.patch(opp.contactId, {
          unreachable: false,
          outsideArea: false,
        });
        await ctx.db.insert("notes", {
          workspaceId: opp.workspaceId,
          contactId: opp.contactId,
          body: `↩️ Lead heropend vanuit ${fromStage.name} naar ${targetStage.name} — komt terug in dashboard.`,
          createdById: userId,
        });
      }
    }

    // Trigger workflow-engine bij won/lost stage-changes
    if (targetStage.isWonStage) {
      await ctx.scheduler.runAfter(
        0,
        internal.workflowEngine.triggerOpportunityChanged,
        {
          workspaceId: opp.workspaceId,
          opportunityId: args.opportunityId,
          eventType: "opportunity_won",
        },
      );
    } else if (targetStage.isLostStage) {
      await ctx.scheduler.runAfter(
        0,
        internal.workflowEngine.triggerOpportunityChanged,
        {
          workspaceId: opp.workspaceId,
          opportunityId: args.opportunityId,
          eventType: "opportunity_lost",
        },
      );
    }
  },
});

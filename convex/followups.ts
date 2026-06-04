import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Follow-up-cron (port van v1's processFollowUps). Een lead waarvan de
 * geplande terugbel-datum (`contacts.nextFollowUpAt`) verstreken is, wordt
 * fysiek teruggezet naar de EERSTE pipeline-stage ("Nieuw") zodat 'ie weer
 * op het kanban-bord verschijnt voor het team. De callCount-historie blijft
 * op het contact staan (badge "1x/2x gebeld").
 *
 * Na het terugzetten wordt nextFollowUpAt geconsumeerd (→ undefined): de lead
 * staat dan weer in Nieuw (zichtbaar via opp-in-eerste-stage) en de cron pakt
 * 'm niet elke run opnieuw op. Bij de volgende "Niet bereikt" wordt opnieuw
 * een nextFollowUpAt + stage-move gezet.
 *
 * Won/Lost-opps blijven staan (worden niet teruggezet). Onbereikbare (3x) en
 * soft-deleted contacten worden overgeslagen (follow-up enkel geconsumeerd).
 *
 * Draait elk uur (zie convex/crons.ts). Bounded batch per workspace.
 */
export const processDueFollowups = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const BATCH = 300;
    let moved = 0;
    let cleared = 0;

    const workspaces = await ctx.db.query("workspaces").collect();
    for (const ws of workspaces) {
      const pipeline = await ctx.db
        .query("pipelines")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", ws._id))
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();
      if (!pipeline) continue;

      const stages = await ctx.db
        .query("pipelineStages")
        .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
        .collect();
      const firstStage = [...stages].sort((a, b) => a.order - b.order)[0];
      if (!firstStage) continue;
      const closedStageIds = new Set<Id<"pipelineStages">>(
        stages.filter((s) => s.isWonStage || s.isLostStage).map((s) => s._id),
      );

      // Due leads: nextFollowUpAt in [1, now]. De range >= 1 sluit de
      // (vele) contacten met nextFollowUpAt = undefined uit.
      const due = await ctx.db
        .query("contacts")
        .withIndex("by_workspace_nextFollowUp", (q) =>
          q
            .eq("workspaceId", ws._id)
            .gte("nextFollowUpAt", 1)
            .lte("nextFollowUpAt", now),
        )
        .take(BATCH);

      for (const c of due) {
        // Onbereikbaar/deleted → niet terugzetten, alleen follow-up consumeren.
        if (c.unreachable || c.deletedAt !== undefined) {
          await ctx.db.patch(c._id, { nextFollowUpAt: undefined });
          continue;
        }
        const opps = await ctx.db
          .query("opportunities")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .collect();
        for (const o of opps) {
          if (o.stageId === firstStage._id) continue; // al in Nieuw
          if (closedStageIds.has(o.stageId)) continue; // won/lost → laten staan
          await ctx.db.patch(o._id, { stageId: firstStage._id });
          await ctx.db.insert("opportunityStageHistory", {
            opportunityId: o._id,
            fromStageId: o.stageId,
            toStageId: firstStage._id,
          });
          moved++;
        }
        await ctx.db.patch(c._id, { nextFollowUpAt: undefined });
        cleared++;
      }
    }

    return { moved, cleared, at: now };
  },
});

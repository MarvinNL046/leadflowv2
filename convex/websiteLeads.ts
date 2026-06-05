import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Website-form lead-ingest. Spiegelt de contact/opp/note/trigger-logica van
 * metaProcessor.upsertContactFromMetaLead, maar voor een simpele website-form
 * (geen Meta-velden). Aangeroepen door de /webhooks/leads httpAction nadat die
 * de workspace heeft geresolved (single-tenant Staycool) + auth heeft gedaan.
 *
 * - dedup contact op email → phone binnen de workspace (merge lege velden)
 * - leadAttribution source "api" → 'Website'-badge in de UI
 * - verse opportunity in de eerste non-won/lost stage van de default-pipeline
 * - bericht + woonplaats als note
 * - triggerContactCreated → workflows + AI-reactie-node vuren
 */
export const ingestWebsiteLead = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
    message: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error(`Workspace ${args.workspaceId} bestaat niet`);

    const normalizedEmail = args.email?.toLowerCase().trim() || undefined;
    const normalizedPhone = args.phone
      ? args.phone.replace(/[^\d+]/g, "")
      : undefined;

    // Dedup: email-match eerst, dan phone-match — beide binnen workspace.
    let contact = normalizedEmail
      ? await ctx.db
          .query("contacts")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", workspace._id).eq("email", normalizedEmail),
          )
          .first()
      : null;
    if (!contact && normalizedPhone) {
      contact = await ctx.db
        .query("contacts")
        .withIndex("by_workspace_phone", (q) =>
          q.eq("workspaceId", workspace._id).eq("phone", normalizedPhone),
        )
        .first();
    }

    let contactId: Id<"contacts">;
    if (contact) {
      // Merge: alleen lege velden invullen, niet overschrijven.
      const merged: Record<string, string | undefined> = {};
      if (!contact.firstName && args.firstName) merged.firstName = args.firstName;
      if (!contact.lastName && args.lastName) merged.lastName = args.lastName;
      if (!contact.email && normalizedEmail) merged.email = normalizedEmail;
      if (!contact.phone && normalizedPhone) merged.phone = normalizedPhone;
      if (!contact.city && args.city) merged.city = args.city;
      if (Object.keys(merged).length > 0) {
        await ctx.db.patch(contact._id, merged);
      }
      contactId = contact._id;
    } else {
      contactId = await ctx.db.insert("contacts", {
        workspaceId: workspace._id,
        firstName: args.firstName,
        lastName: args.lastName,
        email: normalizedEmail,
        phone: normalizedPhone,
        city: args.city,
        callCount: 0,
      });
    }

    // Attribution → 'Website'-badge (source "api").
    await ctx.db.insert("leadAttribution", {
      contactId,
      source: "api",
      utmSource: args.source,
    });

    // Verse opportunity in de default-pipeline (eerste non-won/lost stage),
    // zodat de lead in de Kanban verschijnt — elke inzending = nieuwe deal.
    const pipeline = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (pipeline) {
      const stages = await ctx.db
        .query("pipelineStages")
        .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
        .collect();
      const stage = stages.find((s) => !s.isWonStage && !s.isLostStage) ?? null;
      if (stage) {
        const c = await ctx.db.get(contactId);
        const title =
          (c && [c.firstName, c.lastName].filter(Boolean).join(" ")) ||
          c?.email ||
          c?.phone ||
          "Nieuwe lead";
        const oppId = await ctx.db.insert("opportunities", {
          workspaceId: workspace._id,
          contactId,
          pipelineId: pipeline._id,
          stageId: stage._id,
          title,
        });
        await ctx.db.insert("opportunityStageHistory", {
          opportunityId: oppId,
          toStageId: stage._id,
        });
      }
    }

    // Bericht + woonplaats als note voor traceability.
    const noteLines = ["📋 Website-aanvraag"];
    if (args.message) noteLines.push(`• Bericht: ${args.message}`);
    if (args.city) noteLines.push(`• Woonplaats: ${args.city}`);
    if (noteLines.length > 1) {
      await ctx.db.insert("notes", {
        workspaceId: workspace._id,
        contactId,
        body: noteLines.join("\n"),
      });
    }

    // Workflows + AI-reactie-node vuren (speed-to-lead) bij elke inzending.
    await ctx.scheduler.runAfter(
      0,
      internal.workflowEngine.triggerContactCreated,
      { workspaceId: workspace._id, contactId },
    );

    return { contactId };
  },
});

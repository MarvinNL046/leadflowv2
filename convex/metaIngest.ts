import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Meta webhook ingest — interne mutations + queries die de HTTP action
 * (zie convex/http.ts) gebruikt voor raw lead storage.
 *
 * Idempotent op leadgenId via `by_leadgenId` index op metaLeadRaw.
 * Bij dup return we `{inserted: false}` zodat de webhook niet retried.
 *
 * Na succesvolle insert schedulen we de processor (action met Graph API
 * fetch). Convex scheduler vervangt v1's QStash.
 */

/** Internal versie van getStaycoolOrgId voor gebruik vanuit HTTP action. */
export const getStaycoolOrgIdInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "staycool"))
      .unique();
    return org?._id ?? null;
  },
});

export const insertMetaLeadRaw = internalMutation({
  args: {
    orgId: v.id("orgs"),
    leadgenId: v.string(),
    pageId: v.string(),
    formId: v.optional(v.string()),
    adId: v.optional(v.string()),
    adgroupId: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    payload: v.any(),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("metaLeadRaw")
      .withIndex("by_leadgenId", (q) => q.eq("leadgenId", args.leadgenId))
      .first();

    if (existing) {
      return { inserted: false, rawId: existing._id };
    }

    const rawId = await ctx.db.insert("metaLeadRaw", {
      orgId: args.orgId,
      leadgenId: args.leadgenId,
      pageId: args.pageId,
      formId: args.formId,
      adId: args.adId,
      adgroupId: args.adgroupId,
      campaignId: args.campaignId,
      payload: args.payload,
      status: "pending",
      retryCount: 0,
      fetchedAt: args.fetchedAt,
    });

    // Schedule processor — Convex scheduler vervangt QStash. runAfter(0)
    // = direct na deze mutation commit. Processor heeft eigen retry via
    // metaLeadRaw.retryCount + status.
    await ctx.scheduler.runAfter(
      0,
      internal.metaProcessor.processMetaLead,
      { rawId },
    );

    return { inserted: true, rawId };
  },
});

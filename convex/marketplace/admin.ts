import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, mutation, type QueryCtx } from "../_generated/server";
import { getUserId } from "../lib/identity";

const followUp = v.union(v.literal("new"), v.literal("contacted"), v.literal("done"));

export async function requireAdmin(ctx: QueryCtx) {
  const userId = await getUserId(ctx);
  if (!userId) throw new Error("Niet ingelogd");
  const profile = await ctx.db.query("userProfiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
  if (!profile?.isSuperAdmin) throw new Error("Alleen voor beheerders");
}

export const listSources = query({
  args: {},
  returns: v.array(v.object({id: v.id("marketplaceApiKeys"), name: v.string(), active: v.boolean(), lastUsedAt: v.union(v.number(), v.null())})),
  handler: async ctx => {
    await requireAdmin(ctx);
    const keys = await ctx.db.query("marketplaceApiKeys").take(200);
    return keys.map(k => ({id: k._id, name: k.name, active: k.isActive, lastUsedAt: k.lastUsedAt ?? null}));
  },
});

const leadView = v.object({
  id: v.id("marketplaceLeads"), createdAt: v.number(), name: v.string(),
  email: v.union(v.string(),v.null()), phone: v.union(v.string(),v.null()),
  city: v.union(v.string(),v.null()), postalCode: v.union(v.string(),v.null()),
  source: v.string(), niche: v.string(), status: v.string(), followUpStatus: followUp,
  notificationStatus: v.string(), phoneVerified: v.boolean(), emailVerified: v.boolean(),
  message: v.union(v.string(),v.null()),
});

export const listLeads = query({
  args: {paginationOpts: paginationOptsValidator, sourceId: v.optional(v.id("marketplaceApiKeys"))},
  returns: v.object({page: v.array(leadView), isDone: v.boolean(), continueCursor: v.string()}),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const base = args.sourceId
      ? ctx.db.query("marketplaceLeads").withIndex("by_api_key", q => q.eq("apiKeyId", args.sourceId))
      : ctx.db.query("marketplaceLeads");
    const result = await base.order("desc").paginate({...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 50)});
    const page = await Promise.all(result.page.map(async lead => {
      const key = lead.apiKeyId ? await ctx.db.get(lead.apiKeyId) : null;
      return {id: lead._id, createdAt: lead._creationTime,
        name: [lead.firstName,lead.lastName].filter(Boolean).join(" ") || "Naam onbekend",
        email: lead.email ?? null, phone: lead.phone ?? null, city: lead.city ?? null, postalCode: lead.postalCode ?? null,
        source: typeof lead.metadata?.source === "string" ? lead.metadata.source : key?.name ?? "Bron onbekend",
        niche: lead.niche, status: lead.status, followUpStatus: lead.followUpStatus ?? "new",
        notificationStatus: lead.notificationStatus ?? "unknown", phoneVerified: !!lead.phoneVerifiedAt,
        emailVerified: !!lead.emailVerifiedAt, message: lead.message ?? lead.projectDescription ?? null};
    }));
    return {page, isDone: result.isDone, continueCursor: result.continueCursor};
  },
});

export const setFollowUpStatus = mutation({
  args: {leadId: v.id("marketplaceLeads"), status: followUp},
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!await ctx.db.get(args.leadId)) throw new Error("Lead niet gevonden");
    await ctx.db.patch(args.leadId, {followUpStatus: args.status, followUpUpdatedAt: Date.now()});
    return null;
  },
});

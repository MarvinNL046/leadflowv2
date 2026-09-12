import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query, mutation, type QueryCtx } from "../_generated/server";
import { getUserId } from "../lib/identity";
import { coverageForLead, coverageValidator, loadCoverageBuyers } from './coverage';
import {marketplaceServiceType, nicheHasSubservices} from './types';

const followUp = v.union(v.literal("new"), v.literal("contacted"), v.literal("done"));

/** Historical import evidence only; never changes sale or verification status. */
export function importHistory(metadata: unknown, storedAt: number) {
  const m = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown> : {};
  const imported = m.v1Import === true;
  const raw = m.v1CreatedAt;
  const parsed = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw) ? Date.parse(raw) : NaN;
  const originalRequestedAt = imported && Number.isFinite(parsed) && parsed > 0 && parsed <= storedAt
    && new Date(parsed).toISOString() === raw ? parsed : null;
  return { imported, originalRequestedAt, importedPendingReview: imported && m.v1Status === 'pending_review' };
}

export async function requireAdmin(ctx: QueryCtx) {
  const userId = await getUserId(ctx);
  if (!userId) throw new Error("Niet ingelogd");
  const profile = await ctx.db.query("userProfiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
  if (!profile?.isSuperAdmin) throw new Error("Alleen voor beheerders");
  return userId;
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
  coverage: coverageValidator,
  serviceTypeRevision:v.number(), canEditServiceType:v.boolean(),
  latestServiceReview:v.union(v.null(),v.object({at:v.number(),note:v.string()})),
  serviceType: v.union(v.string(),v.null()), imported: v.boolean(), originalRequestedAt: v.union(v.number(),v.null()), importedPendingReview: v.boolean(),
  expiresAt:v.union(v.number(),v.null()), unclaimedAt:v.union(v.number(),v.null()), buyerMailsSent:v.number(), buyerMailsFailed:v.number(),
});

export const listLeads = query({
  args: {paginationOpts: paginationOptsValidator, sourceId: v.optional(v.id("marketplaceApiKeys")), attentionOnly:v.optional(v.boolean())},
  returns: v.object({page: v.array(leadView), isDone: v.boolean(), continueCursor: v.string()}),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const base = args.attentionOnly
      ? (args.sourceId ? ctx.db.query('marketplaceLeads').withIndex('by_api_key_unclaimedAt',q=>q.eq('apiKeyId',args.sourceId).gt('unclaimedAt',0))
        : ctx.db.query('marketplaceLeads').withIndex('by_unclaimedAt',q=>q.gt('unclaimedAt',0)))
      : args.sourceId
      ? ctx.db.query("marketplaceLeads").withIndex("by_api_key", q => q.eq("apiKeyId", args.sourceId))
      : ctx.db.query("marketplaceLeads");
    const result = await base.order("desc").paginate({...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 50)});
    const coverageBuyers = await loadCoverageBuyers(ctx);
    const page = await Promise.all(result.page.map(async lead => {
      const key = lead.apiKeyId ? await ctx.db.get(lead.apiKeyId) : null;
      const mails = await ctx.db.query('marketplaceBuyerNotifications').withIndex('by_lead_org',q=>q.eq('leadId',lead._id)).take(100);
      const purchases = await ctx.db.query('marketplacePurchases').withIndex('by_lead',q=>q.eq('leadId',lead._id)).take(101);
      const review=await ctx.db.query('marketplaceServiceReviews').withIndex('by_lead',q=>q.eq('leadId',lead._id)).order('desc').first();
      return {id: lead._id, createdAt: lead._creationTime,
        serviceTypeRevision:lead.serviceTypeRevision??0,
        canEditServiceType:nicheHasSubservices(lead.niche)&&purchases.length===0&&lead.status!=='sold_shared'&&lead.status!=='sold_exclusive',
        latestServiceReview:review?{at:review.reviewedAt,note:review.note}:null,
        coverage: coverageForLead(lead,coverageBuyers.buyers,coverageBuyers.complete,purchases),
        ...importHistory(lead.metadata, lead._creationTime), serviceType: lead.serviceType ?? null,
        name: [lead.firstName,lead.lastName].filter(Boolean).join(" ") || "Naam onbekend",
        email: lead.email ?? null, phone: lead.phone ?? null, city: lead.city ?? null, postalCode: lead.postalCode ?? null,
        source: typeof lead.metadata?.source === "string" ? lead.metadata.source : key?.name ?? "Bron onbekend",
        niche: lead.niche, status: lead.status, followUpStatus: lead.followUpStatus ?? "new",
        notificationStatus: lead.notificationStatus ?? "unknown", phoneVerified: !!lead.phoneVerifiedAt,
        emailVerified: !!lead.emailVerifiedAt, message: lead.message ?? lead.projectDescription ?? null,
        expiresAt:lead.expiresAt??null,unclaimedAt:lead.unclaimedAt??null,
        buyerMailsSent:mails.filter(m=>m.state==='sent').length,buyerMailsFailed:mails.filter(m=>m.state==='failed'&&m.attempts>=3).length};
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
    await ctx.db.patch(args.leadId, {followUpStatus: args.status, followUpUpdatedAt: Date.now(),...(args.status!=='new'?{unclaimedAt:undefined,followUpDueAt:undefined}:{})});
    return null;
  },
});

export const reviewServiceType = mutation({
  args:{leadId:v.id('marketplaceLeads'),serviceType:v.union(marketplaceServiceType,v.null()),
    expectedServiceType:v.union(marketplaceServiceType,v.null()),expectedRevision:v.number(),note:v.string()},
  returns:v.null(),
  handler:async(ctx,args)=>{
    const userId=await requireAdmin(ctx);
    const lead=await ctx.db.get(args.leadId);
    if(!lead) throw new ConvexError('Aanvraag niet gevonden.');
    if(!nicheHasSubservices(lead.niche)) throw new ConvexError('Dit vakgebied gebruikt geen installatie-, onderhoud- of reparatiekeuze.');
    const note=args.note.trim();
    if(note.length<3||note.length>500) throw new ConvexError('Vul een korte toelichting in (3 tot 500 tekens).');
    if(!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<0
      ||(lead.serviceTypeRevision??0)!==args.expectedRevision||(lead.serviceType??null)!==args.expectedServiceType)
      throw new ConvexError('Deze aanvraag is ondertussen gewijzigd. Herlaad het overzicht en controleer de actuele gegevens.');
    const purchased=await ctx.db.query('marketplacePurchases').withIndex('by_lead',q=>q.eq('leadId',lead._id)).first();
    if(purchased||lead.status==='sold_shared'||lead.status==='sold_exclusive') throw new ConvexError('Het type werk van een verkochte aanvraag kan niet worden gewijzigd.');
    const revision=(lead.serviceTypeRevision??0)+1;
    await ctx.db.insert('marketplaceServiceReviews',{leadId:lead._id,before:lead.serviceType??null,after:args.serviceType,reviewedBy:userId,reviewedAt:Date.now(),note,revision});
    await ctx.db.patch(lead._id,{serviceType:args.serviceType??undefined,serviceTypeRevision:revision});
    return null;
  },
});

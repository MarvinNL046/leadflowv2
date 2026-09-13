import {ConvexError,v,type Infer} from 'convex/values';
import {paginationOptsValidator} from 'convex/server';
import {internalMutation,mutation,query,type MutationCtx} from './_generated/server';
import {requireAdmin} from './marketplace/admin';
import {webhookChannel,webhookReason,webhookOccurrence} from './lib/webhookSignalTypes';

// Finite groups (3 channels x 7 reasons), no webhook payload or recipient data.
export async function recordSignal(ctx:MutationCtx,channel:Infer<typeof webhookChannel>,reason:Infer<typeof webhookReason>,externalMessageId?:string){
  const existing=await ctx.db.query('webhookSignals').withIndex('by_channel_reason',q=>q.eq('channel',channel).eq('reason',reason)).unique();
  const now=Date.now();
  const occurrence:Infer<typeof webhookOccurrence>={reference:crypto.randomUUID(),seenAt:now};
  // Only Resend UUIDs are retained. Never preserve arbitrary IDs (e.g. WhatsApp JIDs).
  if(channel==='email' && reason==='unmatched_receipt' && externalMessageId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(externalMessageId))occurrence.providerMessageId=externalMessageId;
  const recent=[occurrence,...(existing?.recent??[])].slice(0,5);
  if(existing)await ctx.db.patch(existing._id,{recent,count:existing.count+1,lastSeenAt:now,open:true});
  else await ctx.db.insert('webhookSignals',{recent,channel,reason,count:1,firstSeenAt:now,lastSeenAt:now,open:true});
}
export const record=internalMutation({
  args:{channel:webhookChannel,reason:webhookReason},returns:v.null(),
  handler:async(ctx,args)=>{await recordSignal(ctx,args.channel,args.reason);return null;},
});
const signalView=v.object({recent:v.array(webhookOccurrence),id:v.id('webhookSignals'),channel:webhookChannel,reason:webhookReason,count:v.number(),firstSeenAt:v.number(),lastSeenAt:v.number(),open:v.boolean(),reviewedCount:v.number(),lastReviewedAt:v.union(v.number(),v.null()),lastReviewNote:v.union(v.string(),v.null())});
export const list=query({
  args:{onlyOpen:v.boolean(),paginationOpts:paginationOptsValidator},
  returns:v.object({page:v.array(signalView),isDone:v.boolean(),continueCursor:v.string()}),
  handler:async(ctx,args)=>{
    await requireAdmin(ctx);
    const base=args.onlyOpen ? ctx.db.query('webhookSignals').withIndex('by_open_lastSeenAt',q=>q.eq('open',true)) : ctx.db.query('webhookSignals').withIndex('by_lastSeenAt');
    const result=await base.order('desc').paginate({...args.paginationOpts,numItems:Math.min(50,args.paginationOpts.numItems)});
    return {isDone:result.isDone,continueCursor:result.continueCursor,page:result.page.map(s=>({recent:s.recent??[],id:s._id,channel:s.channel,reason:s.reason,count:s.count,firstSeenAt:s.firstSeenAt,lastSeenAt:s.lastSeenAt,open:s.open,reviewedCount:s.reviewedCount??0,lastReviewedAt:s.lastReviewedAt??null,lastReviewNote:s.lastReviewNote??null}))};
  },
});
export const review=mutation({
  args:{id:v.id('webhookSignals'),expectedCount:v.number(),note:v.string()},returns:v.null(),
  handler:async(ctx,args)=>{
    const userId=await requireAdmin(ctx);
    const signal=await ctx.db.get(args.id);
    if(!signal || !signal.open || signal.count!==args.expectedCount)throw new ConvexError('Het signaal is gewijzigd. Controleer de nieuwste melding.');
    const note=args.note.trim();
    if(note.length<3 || note.length>500)throw new ConvexError('Schrijf een toelichting van 3 tot 500 tekens.');
    const reviewedAt=Date.now();
    await ctx.db.insert('webhookSignalReviews',{signalId:signal._id,reviewedBy:userId,reviewedAt,count:signal.count,note});
    await ctx.db.patch(signal._id,{open:false,reviewedCount:signal.count,lastReviewedAt:reviewedAt,lastReviewNote:note});
    return null;
  },
});

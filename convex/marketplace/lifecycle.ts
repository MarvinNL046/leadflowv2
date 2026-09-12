import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { isLeadForSale } from './availability';

/** Indexed, bounded sweeps; purchase checks the timestamp immediately too. */
export const sweep = internalMutation({args:{},returns:v.object({expired:v.number(),flagged:v.number()}),handler:async ctx=>{
  const now=Date.now();let expired=0,flagged=0;
  for(const status of ['published','sold_shared'] as const){
    const rows=await ctx.db.query('marketplaceLeads').withIndex('by_status_expiresAt',q=>q.eq('status',status).gt('expiresAt',0).lte('expiresAt',now)).take(100);
    for(const lead of rows){await ctx.db.patch(lead._id,{status:'expired',followUpDueAt:undefined});expired++;}
  }
  const due=await ctx.db.query('marketplaceLeads').withIndex('by_followUpDueAt',q=>q.gt('followUpDueAt',0).lte('followUpDueAt',now)).take(100);
  for(const lead of due){
    const purchase=await ctx.db.query('marketplacePurchases').withIndex('by_lead',q=>q.eq('leadId',lead._id)).first();
    const needsAttention=isLeadForSale(lead,now) && !purchase && (!lead.followUpStatus || lead.followUpStatus==='new');
    await ctx.db.patch(lead._id,{followUpDueAt:undefined,...(needsAttention?{unclaimedAt:now}:{})});
    if(needsAttention) flagged++;
  }
  return {expired,flagged};
}});

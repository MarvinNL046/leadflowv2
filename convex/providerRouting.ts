import {v} from 'convex/values';
import {internalQuery, type QueryCtx} from './_generated/server';
import type {Id} from './_generated/dataModel';
import {hasWorkspaceProviders,STAYCOOL_PROVIDER_ORG_ID} from './companyProviders';

// Called only after the legacy provider endpoint's signature/secret is verified.
export const whatsappWorkspace = internalQuery({
  args:{sessionId:v.optional(v.string())},returns:v.union(v.id('workspaces'),v.null()),
  handler:async(ctx,args)=>{
    if(!args.sessionId)return null;
    const matches=await ctx.db.query('whatsappWebConfig').withIndex('by_session',q=>q.eq('sessionId',args.sessionId!)).take(2);
    if(matches.length!==1)return null;
    const ws=matches[0].workspaceId;
    return await hasWorkspaceProviders(ctx,ws) ? ws:null;
  },
});
export const legacySmsWorkspace = internalQuery({
  args:{},returns:v.union(v.id('workspaces'),v.null()),
  handler:async(ctx)=>{
    const orgId=ctx.db.normalizeId('orgs',process.env.LEGACY_PROVIDER_ORG_ID ?? STAYCOOL_PROVIDER_ORG_ID);
    if(!orgId || !await ctx.db.get(orgId))return null;
    const workspaces=await ctx.db.query('workspaces').withIndex('by_org',q=>q.eq('orgId',orgId)).take(2);
    // One signed legacy SMS account, one workspace. Multiple workspaces require
    // explicit device routing before this endpoint can accept messages.
    return workspaces.length===1 ? workspaces[0]._id:null;
  },
});
export async function findLegacyReceipt(ctx:QueryCtx,externalId:string,channel:'email'|'sms'|'whatsapp',workspaceId?:Id<'workspaces'>){
  const rows=await ctx.db.query('messages').withIndex('by_external_id',q=>q.eq('externalMessageId',externalId)).take(101);
  if(rows.length>100)return null;
  const matches=[];
  for(const row of rows){
    if(row.channel!==channel || row.direction!=='outbound' || (workspaceId && row.workspaceId!==workspaceId))continue;
    if(await hasWorkspaceProviders(ctx,row.workspaceId))matches.push(row);
  }
  return matches.length===1 ? matches[0]:null;
}

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
    if(await ctx.db.query('companyWhatsappConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',ws)).first())return null;
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
    if(row.whatsappConnectionId || row.emailConnectionId || row.channel!==channel || row.direction!=='outbound' || (workspaceId && row.workspaceId!==workspaceId))continue;
    if(await hasWorkspaceProviders(ctx,row.workspaceId))matches.push(row);
  }
  return matches.length===1 ? matches[0]:null;
}

export async function findCompanyEmailReceipt(ctx:QueryCtx,externalId:string,id:Id<'companyEmailConnections'>){
  const connection=await ctx.db.get(id);if(!connection || connection.status==='draft')return null;
  const rows=await ctx.db.query('messages').withIndex('by_emailConnection_external',q=>q.eq('emailConnectionId',id).eq('externalMessageId',externalId)).take(2);
  if(rows.length!==1 || rows[0].channel!=='email' || rows[0].direction!=='outbound')return null;
  const ws=await ctx.db.get(rows[0].workspaceId);return ws?.orgId===connection.orgId ? rows[0]:null;
}

export async function findCompanyWhatsappReceipt(ctx:QueryCtx,externalId:string,id:Id<'companyWhatsappConnections'>){
 const r=await ctx.db.get(id);if(!r)return null;
 const rows=await ctx.db.query('messages').withIndex('by_whatsappConnectionId_and_externalMessageId',q=>q.eq('whatsappConnectionId',id).eq('externalMessageId',externalId)).take(2);
 return rows.length===1 && rows[0].workspaceId===r.workspaceId && rows[0].channel==='whatsapp' && rows[0].direction==='outbound'?rows[0]:null;
}

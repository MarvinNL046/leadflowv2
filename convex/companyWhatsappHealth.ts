import {v} from 'convex/values';
import {paginationOptsValidator} from 'convex/server';
import {action,internalAction,internalMutation,internalQuery,type ActionCtx} from './_generated/server';
import {internal} from './_generated/api';
import type {Id} from './_generated/dataModel';
import {requireWorkspacePermission} from './lib/permissions';
import {decryptSecret} from './lib/crypto';
import {VOIDFIX_WA_BASE} from './lib/voidfix';
const health=v.union(v.literal('connected'),v.literal('disconnected'),v.literal('unknown'));
export const page=internalQuery({args:{paginationOpts:paginationOptsValidator},returns:v.object({ids:v.array(v.id('companyWhatsappConnections')),isDone:v.boolean(),continueCursor:v.string()}),handler:async(ctx,args)=>{const p=await ctx.db.query('companyWhatsappConnections').withIndex('by_status',q=>q.eq('status','active')).paginate(args.paginationOpts);return {ids:p.page.map(r=>r._id),isDone:p.isDone,continueCursor:p.continueCursor};}});
export const sweep=internalAction({args:{cursor:v.optional(v.string())},returns:v.null(),handler:async(ctx,args)=>{
 const p=await ctx.runQuery(internal.companyWhatsappHealth.page,{paginationOpts:{cursor:args.cursor??null,numItems:25}});
 for(const id of p.ids)await ctx.scheduler.runAfter(0,internal.companyWhatsappHealth.probe,{id});
 if(!p.isDone)await ctx.scheduler.runAfter(0,internal.companyWhatsappHealth.sweep,{cursor:p.continueCursor});return null;
}});
export const load=internalQuery({args:{id:v.id('companyWhatsappConnections'),manual:v.boolean()},returns:v.union(v.object({apiKey:v.string(),sessionId:v.string(),phoneNumber:v.string()}),v.null()),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);if(!r)return null;if(args.manual)await requireWorkspacePermission(ctx,r.workspaceId,'manage');if(r.status!=='active')return null;return {apiKey:await decryptSecret(r.encryptedApiKey),sessionId:r.sessionId,phoneNumber:r.phoneNumber};}});
export const save=internalMutation({args:{id:v.id('companyWhatsappConnections'),manual:v.boolean(),checkedAt:v.number(),health,reason:v.string()},returns:v.null(),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);if(!r)return null;if(args.manual)await requireWorkspacePermission(ctx,r.workspaceId,'manage');if(r.status!=='active' || (r.lastCheckedAt??0)>args.checkedAt)return null;await ctx.db.patch(r._id,{health:args.health,healthReason:args.reason,lastCheckedAt:args.checkedAt});return null;}});
async function check(ctx:ActionCtx,id:Id<'companyWhatsappConnections'>,manual:boolean){
 const data=await ctx.runQuery(internal.companyWhatsappHealth.load,{id,manual});if(!data)return null;
 const checkedAt=Date.now();let state:'connected'|'disconnected'|'unknown'='unknown',reason='Provider niet bereikbaar of antwoord ongeldig';
 try{
  const res=await fetch(`${VOIDFIX_WA_BASE}/api/external/session-status/${encodeURIComponent(data.sessionId)}`,{headers:{'X-API-Key':data.apiKey},signal:AbortSignal.timeout(10000)});
  if(res.ok){const json=await res.json();const d=json?.data;if(json.success===true && d?.sessionId===data.sessionId && typeof d.isConnected==='boolean'){
   const same=typeof d.phoneNumber==='string' && d.phoneNumber.replace(/\D/g,'')===data.phoneNumber.replace(/\D/g,'');
   state=d.isConnected && d.status==='WORKING' && same?'connected':'disconnected';reason=state==='connected'?'Verbinding en nummer gecontroleerd':d.isConnected && !same?'Telefoonnummer wijkt af':'Sessie niet verbonden';
  }}
 }catch{ /* Never expose a provider URL, credential or raw response. */ }
 await ctx.runMutation(internal.companyWhatsappHealth.save,{id,manual,checkedAt,health:state,reason});return null;
}
export const probe=internalAction({args:{id:v.id('companyWhatsappConnections')},returns:v.null(),handler:(ctx,args)=>check(ctx,args.id,false)});
export const checkNow=action({args:{id:v.id('companyWhatsappConnections')},returns:v.null(),handler:(ctx,args)=>check(ctx,args.id,true)});

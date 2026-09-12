import {ConvexError,v} from 'convex/values';
import {action,internalQuery,internalMutation,query,mutation,type QueryCtx} from './_generated/server';
import {internal} from './_generated/api';
import {requireWorkspacePermission} from './lib/permissions';
import {encryptSecret,decryptSecret} from './lib/crypto';
import {VOIDFIX_WA_BASE} from './lib/voidfix';
import type {Id} from './_generated/dataModel';

export const list=query({
  args:{workspaceId:v.id('workspaces')},returns:v.array(v.object({id:v.id('companyWhatsappConnections'),status:v.union(v.literal('active'),v.literal('disabled')),sessionId:v.string(),phoneNumber:v.string(),verifiedAt:v.number(),lastWebhookAt:v.union(v.number(),v.null()),health:v.union(v.literal('connected'),v.literal('disconnected'),v.literal('unknown')),lastCheckedAt:v.union(v.number(),v.null()),healthReason:v.union(v.string(),v.null())})),
  handler:async(ctx,args)=>{await requireWorkspacePermission(ctx,args.workspaceId,'manage');const rows=await ctx.db.query('companyWhatsappConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',args.workspaceId)).order('desc').take(20);return rows.map(r=>({id:r._id,status:r.status,sessionId:r.sessionId,phoneNumber:r.phoneNumber,verifiedAt:r.verifiedAt,lastWebhookAt:r.lastWebhookAt??null,health:r.health??'unknown',lastCheckedAt:r.lastCheckedAt??null,healthReason:r.healthReason??null}));},
});
export const authorize=internalQuery({args:{workspaceId:v.id('workspaces')},returns:v.null(),handler:async(ctx,args)=>{await requireWorkspacePermission(ctx,args.workspaceId,'manage');return null;}});
export const activate=action({
  args:{workspaceId:v.id('workspaces'),apiKey:v.string(),sessionId:v.string(),expectedPhone:v.string()},returns:v.id('companyWhatsappConnections'),
  handler:async(ctx,args):Promise<Id<'companyWhatsappConnections'>>=>{
    await ctx.runQuery(internal.companyWhatsapp.authorize,{workspaceId:args.workspaceId});
    if(!args.apiKey || args.apiKey.length>500 || /[\r\n]/.test(args.apiKey) || !/^[a-zA-Z0-9_-]{1,150}$/.test(args.sessionId))throw new ConvexError('Controleer de API-key en sessie-ID.');
    if(args.apiKey===process.env.VOIDFIX_API_KEY)throw new ConvexError('Gebruik een eigen Voidfix-account, niet het bestaande platformaccount.');
    const res=await fetch(`${VOIDFIX_WA_BASE}/api/external/sessions`,{headers:{'X-API-Key':args.apiKey}});
    if(!res.ok)throw new ConvexError('Voidfix-controle mislukt. Controleer de API-key.');
    const json=await res.json();
    if(json.success!==true || !Array.isArray(json.data))throw new ConvexError('Voidfix gaf geen geldige sessielijst terug.');
    const sessions=json.data.filter((s: {sessionId?:string})=>s?.sessionId===args.sessionId);
    const session=sessions[0];const expected=args.expectedPhone.replace(/\D/g,'');
    if(sessions.length!==1 || session.isConnected!==true || session.status!=='WORKING' || typeof session.phoneNumber!=='string' || expected.length<8 || expected.length>15 || session.phoneNumber.replace(/\D/g,'')!==expected)throw new ConvexError('Sessie niet verbonden of het telefoonnummer komt niet overeen. Gebruik landcode, bijvoorbeeld +31.');
    const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    return ctx.runMutation(internal.companyWhatsapp.commit,{workspaceId:args.workspaceId,sessionId:args.sessionId,phoneNumber:'+'+expected,encryptedApiKey:await encryptSecret(args.apiKey),encryptedWebhookSecret:await encryptSecret(secret)});
  },
});
export const commit=internalMutation({
  args:{workspaceId:v.id('workspaces'),sessionId:v.string(),phoneNumber:v.string(),encryptedApiKey:v.string(),encryptedWebhookSecret:v.string()},returns:v.id('companyWhatsappConnections'),
  handler:async(ctx,args)=>{
    const {userId}=await requireWorkspacePermission(ctx,args.workspaceId,'manage');
    const active=await ctx.db.query('companyWhatsappConnections').withIndex('by_workspaceId_and_status',q=>q.eq('workspaceId',args.workspaceId).eq('status','active')).unique();
    if(active)throw new ConvexError('Pauzeer eerst de actieve koppeling.');
    const same=await ctx.db.query('companyWhatsappConnections').withIndex('by_sessionId',q=>q.eq('sessionId',args.sessionId)).take(21);
    if(same.length>20 || same.some(r=>r.workspaceId!==args.workspaceId))throw new ConvexError('Deze sessie is al aan een andere werkruimte gebonden.');
    const legacy=await ctx.db.query('whatsappWebConfig').withIndex('by_session',q=>q.eq('sessionId',args.sessionId)).first();
    if(legacy || args.sessionId===process.env.VOIDFIX_WA_SESSION_ID)throw new ConvexError('Deze sessie wordt al door de bestaande koppeling gebruikt.');
    if((await ctx.db.query('companyWhatsappConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',args.workspaceId)).take(20)).length>=20)throw new ConvexError('Neem contact op met de platformbeheerder voor meer koppelingen.');
    if(!args.encryptedApiKey.startsWith('v1:') || !args.encryptedWebhookSecret.startsWith('v1:'))throw new ConvexError('Versleutelde sleutels vereist');
    return ctx.db.insert('companyWhatsappConnections',{...args,createdBy:userId,status:'active',verifiedAt:Date.now(),health:'connected',lastCheckedAt:Date.now()});
  },
});
export const disable=mutation({args:{id:v.id('companyWhatsappConnections')},returns:v.null(),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);if(!r)throw new ConvexError('Koppeling niet gevonden');await requireWorkspacePermission(ctx,r.workspaceId,'manage');await ctx.db.patch(r._id,{status:'disabled',disabledAt:Date.now()});return null;}});
export const setupUrl=action({args:{id:v.id('companyWhatsappConnections')},returns:v.string(),handler:async(ctx,args)=>{
  const secret:string=await ctx.runQuery(internal.companyWhatsapp.authorizedSecret,args);const base=process.env.CONVEX_SITE_URL;if(!base)throw new ConvexError('Webhookadres ontbreekt');return `${base}/webhooks/voidfix-wa-company?connectionId=${args.id}&secret=${encodeURIComponent(secret)}`;
}});
export const authorizedSecret=internalQuery({args:{id:v.id('companyWhatsappConnections')},returns:v.string(),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);if(!r || r.status!=='active')throw new ConvexError('Geen actieve koppeling');await requireWorkspacePermission(ctx,r.workspaceId,'manage');return decryptSecret(r.encryptedWebhookSecret);}});
export const transport=internalQuery({args:{workspaceId:v.id('workspaces')},returns:v.union(v.object({apiKey:v.string(),sessionId:v.string(),connectionId:v.id('companyWhatsappConnections')}),v.null()),handler:async(ctx,args)=>{
  const r=await ctx.db.query('companyWhatsappConnections').withIndex('by_workspaceId_and_status',q=>q.eq('workspaceId',args.workspaceId).eq('status','active')).unique();
  if(r?.health && r.health!=='connected')throw new ConvexError('WhatsApp-verbinding niet bevestigd. Controleer de koppeling bij Instellingen.');
  if(r)return {apiKey:await decryptSecret(r.encryptedApiKey),sessionId:r.sessionId,connectionId:r._id};
  if(await ctx.db.query('companyWhatsappConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',args.workspaceId)).first())throw new ConvexError('Eigen WhatsApp-koppeling is gepauzeerd.');return null;
}});
export const webhookContext=internalQuery({args:{id:v.id('companyWhatsappConnections')},returns:v.union(v.object({workspaceId:v.id('workspaces'),sessionId:v.string(),secret:v.string(),status:v.union(v.literal('active'),v.literal('disabled'))}),v.null()),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);return r?{workspaceId:r.workspaceId,sessionId:r.sessionId,status:r.status,secret:await decryptSecret(r.encryptedWebhookSecret)}:null;}});
export const seen=internalMutation({args:{id:v.id('companyWhatsappConnections')},returns:v.null(),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);if(r)await ctx.db.patch(r._id,{lastWebhookAt:Date.now()});return null;}});
export async function requireActiveInbound(ctx:QueryCtx,id:Id<'companyWhatsappConnections'>,workspaceId:Id<'workspaces'>){const r=await ctx.db.get(id);if(!r || r.status!=='active' || r.workspaceId!==workspaceId)throw new ConvexError('WhatsApp-koppeling niet actief voor deze werkruimte.');}

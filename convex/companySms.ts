import {ConvexError,v} from 'convex/values';
import {action,internalQuery,internalMutation,query,mutation,type QueryCtx} from './_generated/server';
import {internal} from './_generated/api';
import {requireWorkspacePermission} from './lib/permissions';
import {encryptSecret,decryptSecret} from './lib/crypto';

import type {Id} from './_generated/dataModel';

export const list=query({
  args:{workspaceId:v.id('workspaces')},returns:v.array(v.object({id:v.id('companySmsConnections'),status:v.union(v.literal('active'),v.literal('disabled')),deviceId:v.string(),deviceName:v.string(),verifiedAt:v.number(),lastWebhookAt:v.union(v.number(),v.null())})),
  handler:async(ctx,args)=>{await requireWorkspacePermission(ctx,args.workspaceId,'manage');const rows=await ctx.db.query('companySmsConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',args.workspaceId)).order('desc').take(20);return rows.map(r=>({id:r._id,status:r.status,deviceId:r.deviceId,deviceName:r.deviceName,verifiedAt:r.verifiedAt,lastWebhookAt:r.lastWebhookAt??null}));},
});
export const authorize=internalQuery({args:{workspaceId:v.id('workspaces')},returns:v.null(),handler:async(ctx,args)=>{await requireWorkspacePermission(ctx,args.workspaceId,'manage');return null;}});
export const activate=action({
  args:{workspaceId:v.id('workspaces'),apiKey:v.string(),deviceId:v.string(),expectedDeviceName:v.string()},returns:v.id('companySmsConnections'),
  handler:async(ctx,args):Promise<Id<'companySmsConnections'>>=>{
    await ctx.runQuery(internal.companySms.authorize,{workspaceId:args.workspaceId});
    if(!args.apiKey || args.apiKey.length>500 || /[\r\n]/.test(args.apiKey) || !/^[a-zA-Z0-9_-]{1,150}$/.test(args.deviceId))throw new ConvexError('Controleer de API-key en apparaat-ID.');
    if(args.apiKey===process.env.VOIDFIX_SMS_API_SECRET)throw new ConvexError('Gebruik een eigen Voidfix-account, niet het bestaande platformaccount.');
    if(!/^\d{1,20}$/.test(args.deviceId))throw new ConvexError('Gebruik de numerieke apparaat-ID uit Devices & SIMs.');
    let json;try{const res=await fetch('https://sms.voidfix.com/services/get-devices.php?'+new URLSearchParams({key:args.apiKey}));if(!res.ok)throw new Error();json=await res.json();}catch{throw new ConvexError('SMS-apparaatcontrole mislukt. Controleer de API-key.');}
    if(json?.success!==true || !Array.isArray(json.data?.devices))throw new ConvexError('Voidfix gaf geen geldige apparaatlijst terug.');
    const devices=json.data.devices.filter((d:{id?:number|string})=>d && String(d.id)===args.deviceId);
    const device=devices[0];const expected=args.expectedDeviceName.trim();
    if(devices.length!==1 || typeof device.name!=='string' || !expected || device.name!==expected || !Array.isArray(device.sims) || !device.sims.length)throw new ConvexError('Apparaat niet gevonden, naam klopt niet of er is geen SIM gekoppeld.');
    const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    return ctx.runMutation(internal.companySms.commit,{workspaceId:args.workspaceId,deviceId:args.deviceId,deviceName:expected,encryptedApiKey:await encryptSecret(args.apiKey),encryptedWebhookSecret:await encryptSecret(secret)});
  },
});
export const commit=internalMutation({
  args:{workspaceId:v.id('workspaces'),deviceId:v.string(),deviceName:v.string(),encryptedApiKey:v.string(),encryptedWebhookSecret:v.string()},returns:v.id('companySmsConnections'),
  handler:async(ctx,args)=>{
    const {userId}=await requireWorkspacePermission(ctx,args.workspaceId,'manage');
    const active=await ctx.db.query('companySmsConnections').withIndex('by_workspaceId_and_status',q=>q.eq('workspaceId',args.workspaceId).eq('status','active')).unique();
    if(active)throw new ConvexError('Pauzeer eerst de actieve koppeling.');
    const same=await ctx.db.query('companySmsConnections').withIndex('by_deviceId',q=>q.eq('deviceId',args.deviceId)).take(21);
    if(same.length>20 || same.some(r=>r.workspaceId!==args.workspaceId))throw new ConvexError('Dit apparaat is al aan een andere werkruimte gebonden.');
    if(args.deviceId===process.env.VOIDFIX_SMS_DEVICE_ID)throw new ConvexError('Dit apparaat wordt al door de bestaande platformkoppeling gebruikt.');
    if((await ctx.db.query('companySmsConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',args.workspaceId)).take(20)).length>=20)throw new ConvexError('Neem contact op met de platformbeheerder voor meer koppelingen.');
    if(!args.encryptedApiKey.startsWith('v1:') || !args.encryptedWebhookSecret.startsWith('v1:'))throw new ConvexError('Versleutelde sleutels vereist');
    return ctx.db.insert('companySmsConnections',{...args,createdBy:userId,status:'active',verifiedAt:Date.now()});
  },
});
export const disable=mutation({args:{id:v.id('companySmsConnections')},returns:v.null(),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);if(!r)throw new ConvexError('Koppeling niet gevonden');await requireWorkspacePermission(ctx,r.workspaceId,'manage');await ctx.db.patch(r._id,{status:'disabled',disabledAt:Date.now()});return null;}});
export const setupUrl=action({args:{id:v.id('companySmsConnections')},returns:v.string(),handler:async(ctx,args)=>{
  const secret:string=await ctx.runQuery(internal.companySms.authorizedSecret,args);const base=process.env.CONVEX_SITE_URL;if(!base)throw new ConvexError('Webhookadres ontbreekt');return `${base}/webhooks/voidfix-sms-company?connectionId=${args.id}&secret=${encodeURIComponent(secret)}`;
}});
export const authorizedSecret=internalQuery({args:{id:v.id('companySmsConnections')},returns:v.string(),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);if(!r || r.status!=='active')throw new ConvexError('Geen actieve koppeling');await requireWorkspacePermission(ctx,r.workspaceId,'manage');return decryptSecret(r.encryptedWebhookSecret);}});
export const transport=internalQuery({args:{workspaceId:v.id('workspaces')},returns:v.union(v.object({apiKey:v.string(),deviceId:v.string(),connectionId:v.id('companySmsConnections')}),v.null()),handler:async(ctx,args)=>{
  const r=await ctx.db.query('companySmsConnections').withIndex('by_workspaceId_and_status',q=>q.eq('workspaceId',args.workspaceId).eq('status','active')).unique();
  if(r)return {apiKey:await decryptSecret(r.encryptedApiKey),deviceId:r.deviceId,connectionId:r._id};
  if(await ctx.db.query('companySmsConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',args.workspaceId)).first())throw new ConvexError('Eigen SMS-koppeling is gepauzeerd.');return null;
}});
export const webhookContext=internalQuery({args:{id:v.id('companySmsConnections')},returns:v.union(v.object({workspaceId:v.id('workspaces'),deviceId:v.string(),secret:v.string(),status:v.union(v.literal('active'),v.literal('disabled'))}),v.null()),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);return r?{workspaceId:r.workspaceId,deviceId:r.deviceId,status:r.status,secret:await decryptSecret(r.encryptedWebhookSecret)}:null;}});
export const seen=internalMutation({args:{id:v.id('companySmsConnections')},returns:v.null(),handler:async(ctx,args)=>{const r=await ctx.db.get(args.id);if(r)await ctx.db.patch(r._id,{lastWebhookAt:Date.now()});return null;}});
export async function requireActiveInbound(ctx:QueryCtx,id:Id<'companySmsConnections'>,workspaceId:Id<'workspaces'>){const r=await ctx.db.get(id);if(!r || r.status!=='active' || r.workspaceId!==workspaceId)throw new ConvexError('SMS-koppeling niet actief voor deze werkruimte.');}

import {ConvexError,v} from 'convex/values';
import {action,internalMutation,internalQuery,mutation,query,type QueryCtx} from './_generated/server';
import {internal} from './_generated/api';
import type {Id} from './_generated/dataModel';
import {requireCompanyPermission,requireWorkspacePermission} from './lib/permissions';
import {encryptSecret,decryptSecret} from './lib/crypto';
import {hasWorkspaceProviders} from './companyProviders';

function endpoint(id:Id<'companyEmailConnections'>){
  const base=process.env.CONVEX_SITE_URL;
  if(!base)throw new ConvexError('Webhookadres is nog niet ingesteld op het platform.');
  return `${base}/webhooks/resend-company?connectionId=${id}`;
}
export const list=query({
  args:{workspaceId:v.id('workspaces')},
  returns:v.array(v.object({id:v.id('companyEmailConnections'),status:v.union(v.literal('draft'),v.literal('active'),v.literal('disabled')),endpoint:v.string(),from:v.union(v.string(),v.null()),verifiedAt:v.union(v.number(),v.null())})),
  handler:async(ctx,args)=>{
    const {orgId}=await requireWorkspacePermission(ctx,args.workspaceId,'manage');
    const rows=await ctx.db.query('companyEmailConnections').withIndex('by_org',q=>q.eq('orgId',orgId)).order('desc').take(20);
    return rows.map(r=>({id:r._id,status:r.status,endpoint:endpoint(r._id),from:r.fromEmail??null,verifiedAt:r.verifiedAt??null}));
  },
});
export const prepare=mutation({
  args:{workspaceId:v.id('workspaces')},returns:v.id('companyEmailConnections'),
  handler:async(ctx,args)=>{
    const {orgId,userId}=await requireWorkspacePermission(ctx,args.workspaceId,'manage');
    const draft=await ctx.db.query('companyEmailConnections').withIndex('by_org_status',q=>q.eq('orgId',orgId).eq('status','draft')).unique();
    if(draft)return draft._id;
    if((await ctx.db.query('companyEmailConnections').withIndex('by_org',q=>q.eq('orgId',orgId)).take(20)).length>=20)throw new ConvexError('Neem contact op met de platformbeheerder voor meer koppelingen.');
    return ctx.db.insert('companyEmailConnections',{orgId,status:'draft',createdBy:userId});
  },
});
export const authorize=internalQuery({
  args:{id:v.id('companyEmailConnections')},returns:v.string(),
  handler:async(ctx,args)=>{
    const row=await ctx.db.get(args.id);if(!row)throw new ConvexError('Koppeling niet gevonden');
    await requireCompanyPermission(ctx,row.orgId,'manage');
    if(row.status!=='draft')throw new ConvexError('Maak een nieuw concept voor een andere koppeling.');
    return endpoint(row._id);
  },
});
export const activate=action({
  args:{id:v.id('companyEmailConnections'),apiKey:v.string(),fromEmail:v.string(),fromName:v.string(),domainId:v.string(),webhookId:v.string()},returns:v.null(),
  handler:async(ctx,args)=>{
    const expectedEndpoint:string=await ctx.runQuery(internal.companyEmail.authorize,{id:args.id});
    const email=args.fromEmail.trim().toLowerCase(),name=args.fromName.trim();
    if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email) || name.length>100 || /[\r\n<>]/.test(name))throw new ConvexError('Vul een geldig afzenderadres en naam in.');
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(args.domainId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(args.webhookId) || !args.apiKey.startsWith('re_') || args.apiKey.length>500)throw new ConvexError('Controleer de API-key en de domein- en webhook-ID.');
    async function read(path:string){
      const response=await fetch(`https://api.resend.com/${path}`,{headers:{Authorization:`Bearer ${args.apiKey}`}});
      if(!response.ok)throw new ConvexError('Resend-controle mislukt. Controleer de API-key en leesrechten voor domeinen en webhooks.');
      return response.json();
    }
    const domain=await read(`domains/${args.domainId}`);
    if(domain.status!=='verified' || typeof domain.name!=='string' || domain.name.toLowerCase()!==email.split('@')[1] || domain.capabilities?.sending==='disabled')throw new ConvexError('Het afzenderdomein is niet geverifieerd voor verzending in dit Resend-account.');
    const hook=await read(`webhooks/${args.webhookId}`);
    const required=['email.delivered','email.bounced','email.complained','email.opened'];
    if(hook.status!=='enabled' || hook.endpoint!==expectedEndpoint || !Array.isArray(hook.events) || !required.every(e=>hook.events.includes(e)) || typeof hook.signing_secret!=='string' || !hook.signing_secret.startsWith('whsec_'))throw new ConvexError('De webhook is niet actief op het juiste adres of mist vereiste gebeurtenissen.');
    if(hook.signing_secret===process.env.RESEND_WEBHOOK_SECRET)throw new ConvexError('Gebruik een eigen webhook voor deze bedrijfskoppeling.');
    await ctx.runMutation(internal.companyEmail.commit,{id:args.id,encryptedApiKey:await encryptSecret(args.apiKey),encryptedWebhookSecret:await encryptSecret(hook.signing_secret),fromEmail:email,fromName:name,domainId:args.domainId,webhookId:args.webhookId});
    return null;
  },
});
export const commit=internalMutation({
  args:{id:v.id('companyEmailConnections'),encryptedApiKey:v.string(),encryptedWebhookSecret:v.string(),fromEmail:v.string(),fromName:v.string(),domainId:v.string(),webhookId:v.string()},returns:v.null(),
  handler:async(ctx,args)=>{
    const row=await ctx.db.get(args.id);if(!row)throw new ConvexError('Koppeling niet gevonden');
    await requireCompanyPermission(ctx,row.orgId,'manage');
    if(row.status!=='draft')throw new ConvexError('Deze koppeling is intussen gewijzigd.');
    const active=await ctx.db.query('companyEmailConnections').withIndex('by_org_status',q=>q.eq('orgId',row.orgId).eq('status','active')).unique();
    if(active)throw new ConvexError('Pauzeer eerst de bestaande eigen e-mailkoppeling.');
    if(!args.encryptedApiKey.startsWith('v1:') || !args.encryptedWebhookSecret.startsWith('v1:'))throw new ConvexError('Versleutelde sleutels vereist');
    const {id,...fields}=args;await ctx.db.patch(id,{...fields,status:'active',verifiedAt:Date.now()});return null;
  },
});
export const disable=mutation({
  args:{id:v.id('companyEmailConnections')},returns:v.null(),
  handler:async(ctx,args)=>{
    const row=await ctx.db.get(args.id);if(!row)throw new ConvexError('Koppeling niet gevonden');
    await requireCompanyPermission(ctx,row.orgId,'manage');
    if(row.status!=='active')throw new ConvexError('Deze koppeling is niet actief.');
    await ctx.db.patch(row._id,{status:'disabled',disabledAt:Date.now()});return null;
  },
});
export async function loadEmailTransport(ctx:QueryCtx,workspaceId:Id<'workspaces'>){
  const ws=await ctx.db.get(workspaceId);if(!ws)throw new ConvexError('Werkruimte niet gevonden');
  const active=await ctx.db.query('companyEmailConnections').withIndex('by_org_status',q=>q.eq('orgId',ws.orgId).eq('status','active')).unique();
  if(active?.encryptedApiKey && active.fromEmail)return {apiKey:await decryptSecret(active.encryptedApiKey),from:active.fromName?`${active.fromName} <${active.fromEmail}>`:active.fromEmail,connectionId:active._id};
  const disabled=await ctx.db.query('companyEmailConnections').withIndex('by_org_status',q=>q.eq('orgId',ws.orgId).eq('status','disabled')).first();
  if(!disabled && await hasWorkspaceProviders(ctx,workspaceId))return {apiKey:process.env.RESEND_API_KEY??'',from:process.env.EMAIL_FROM??'noreply@example.com',connectionId:undefined};
  throw new ConvexError('E-mail is niet ingesteld of is gepauzeerd voor dit bedrijf.');
}
export const transport=internalQuery({
  args:{workspaceId:v.id('workspaces')},returns:v.object({apiKey:v.string(),from:v.string(),connectionId:v.optional(v.id('companyEmailConnections'))}),
  handler:loadTransport,
});
async function loadTransport(ctx:QueryCtx,args:{workspaceId:Id<'workspaces'>}){return loadEmailTransport(ctx,args.workspaceId);}
export const webhookSecret=internalQuery({
  args:{id:v.id('companyEmailConnections')},returns:v.union(v.string(),v.null()),
  handler:async(ctx,args)=>{const row=await ctx.db.get(args.id);return row?.encryptedWebhookSecret ? decryptSecret(row.encryptedWebhookSecret):null;},
});

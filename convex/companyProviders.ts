import {ConvexError, v} from 'convex/values';
import {internalQuery, query, type QueryCtx} from './_generated/server';
import type {Id} from './_generated/dataModel';
import {requireWorkspacePermission} from './lib/permissions';

// The deployed environment credentials belong to this existing company.
// Never infer ownership from a company name, slug, member role or platform role.
export const STAYCOOL_PROVIDER_ORG_ID = 'q1766xgcazxy1bgy8jbyrkj5xx871wp9';
export function ownsLegacyProviders(orgId: string) {
  return orgId === (process.env.LEGACY_PROVIDER_ORG_ID ?? STAYCOOL_PROVIDER_ORG_ID);
}
export async function hasWorkspaceProviders(ctx: QueryCtx, workspaceId: Id<'workspaces'>) {
  const ws = await ctx.db.get(workspaceId);
  return !!ws && ownsLegacyProviders(ws.orgId) && !!await ctx.db.get(ws.orgId);
}
export async function requireWorkspaceProviders(ctx: QueryCtx, workspaceId: Id<'workspaces'>) {
  if (!await hasWorkspaceProviders(ctx, workspaceId)) {
    throw new ConvexError('Communicatie en koppelingen zijn nog niet ingesteld voor dit bedrijf. Neem contact op met de platformbeheerder.');
  }
}
export async function hasLegacyWhatsapp(ctx:QueryCtx,workspaceId:Id<'workspaces'>){
  return await hasWorkspaceProviders(ctx,workspaceId) && !await ctx.db.query('companyWhatsappConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',workspaceId)).first();
}
export const assertWorkspace = internalQuery({
  args: {workspaceId:v.id('workspaces')}, returns:v.null(),
  handler:async(ctx,args)=>{await requireWorkspaceProviders(ctx,args.workspaceId);return null;},
});
export const contactEnabled = internalQuery({
  args:{contactId:v.id('contacts')}, returns:v.boolean(),
  handler:async(ctx,args)=>{
    const contact=await ctx.db.get(args.contactId);
    return !!contact && await hasWorkspaceProviders(ctx,contact.workspaceId);
  },
});
export const status = query({
  args:{workspaceId:v.id('workspaces')},
  returns:v.object({assigned:v.boolean(),email:v.boolean(),sms:v.boolean(),whatsapp:v.boolean(),calendar:v.boolean(),suite:v.boolean()}),
  handler:async(ctx,args)=>{
    await requireWorkspacePermission(ctx,args.workspaceId,'manage');
    const assigned=await hasWorkspaceProviders(ctx,args.workspaceId);
    const wa=assigned ? await ctx.db.query('whatsappWebConfig').withIndex('by_workspace',q=>q.eq('workspaceId',args.workspaceId)).unique():null;
    const ws=await ctx.db.get(args.workspaceId);
    const ownEmail=ws?await ctx.db.query('companyEmailConnections').withIndex('by_org_status',q=>q.eq('orgId',ws.orgId).eq('status','active')).unique():null;
    const pausedEmail=ws?await ctx.db.query('companyEmailConnections').withIndex('by_org_status',q=>q.eq('orgId',ws.orgId).eq('status','disabled')).first():null;
    const ownWa=await ctx.db.query('companyWhatsappConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',args.workspaceId)).first();
    const activeWa=await ctx.db.query('companyWhatsappConnections').withIndex('by_workspaceId_and_status',q=>q.eq('workspaceId',args.workspaceId).eq('status','active')).unique();
    const ownSms=await ctx.db.query('companySmsConnections').withIndex('by_workspaceId',q=>q.eq('workspaceId',args.workspaceId)).first();
    const activeSms=await ctx.db.query('companySmsConnections').withIndex('by_workspaceId_and_status',q=>q.eq('workspaceId',args.workspaceId).eq('status','active')).unique();
    return {assigned:assigned || !!ownEmail || !!activeWa || !!activeSms,
      email:!!ownEmail || (!pausedEmail && assigned && !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM),
      sms:ownSms ? !!activeSms : assigned && !!process.env.VOIDFIX_SMS_API_SECRET && !!process.env.VOIDFIX_SMS_DEVICE_ID,
      whatsapp:ownWa ? !!activeWa && (!activeWa.health || activeWa.health==='connected') : assigned && !!process.env.VOIDFIX_API_KEY && !!(wa ? wa.isActive && wa.sessionId : process.env.VOIDFIX_WA_SESSION_ID),
      calendar:assigned && !!process.env.GOOGLE_CALENDAR_ID && !!process.env.GOOGLE_CALENDAR_CLIENT_EMAIL && !!process.env.GOOGLE_CALENDAR_PRIVATE_KEY,
      suite:assigned && !!(process.env.CASHFLOW_READ_API_KEY || process.env.FROSTWORK_READ_API_KEY),
    };
  },
});
export const whatsappSession = internalQuery({
  args:{workspaceId:v.id('workspaces')},returns:v.string(),
  handler:async(ctx,args)=>{
    await requireWorkspaceProviders(ctx,args.workspaceId);
    const config=await ctx.db.query('whatsappWebConfig').withIndex('by_workspace',q=>q.eq('workspaceId',args.workspaceId)).unique();
    // An explicitly inactive workspace must never fall back to another session.
    const sessionId=config ? (config.isActive ? config.sessionId : undefined) : process.env.VOIDFIX_WA_SESSION_ID;
    if(!sessionId)throw new ConvexError('WhatsApp is niet verbonden voor deze werkruimte. Koppel de sessie opnieuw.');
    return sessionId;
  },
});

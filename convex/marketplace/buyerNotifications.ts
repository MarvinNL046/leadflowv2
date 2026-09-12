import { v } from 'convex/values';
import { internalMutation, internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { isLeadForSale, matchesBuyer } from './availability';
import type { Doc } from '../_generated/dataModel';
import { NICHE_LABELS, SERVICE_TYPE_LABELS } from './types';
import { lookupRegionByPostcode } from './regions';

const emailEnabled = (p: Doc<'marketplaceBuyerPreferences'>) => p.emailAlertsActivatedAt !== undefined && p.notifyOnNewLead && (p.notifyChannel === 'email' || p.notifyChannel === 'both');
const euros = (c: number) => `€${(c/100).toFixed(2).replace('.',',')}`;

export const queueForLead = internalMutation({
  args: {leadId:v.id('marketplaceLeads'),cursor:v.optional(v.union(v.string(),v.null()))}, returns:v.null(),
  handler: async(ctx,{leadId,cursor})=>{
    const lead = await ctx.db.get(leadId);
    if (!lead || !isLeadForSale(lead)) return null;
    const batch = await ctx.db.query('marketplaceBuyerPreferences').paginate({cursor:cursor??null,numItems:50});
    for(const prefs of batch.page){
      if(!emailEnabled(prefs) || !matchesBuyer(lead,prefs)) continue;
      const org = await ctx.db.get(prefs.orgId);
      if(!org?.marketplaceEnabled) continue;
      const owner = await ctx.db.get(org.ownerId);
      if(!owner?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email)) continue;
      const existing = await ctx.db.query('marketplaceBuyerNotifications').withIndex('by_lead_org',q=>q.eq('leadId',leadId).eq('orgId',org._id)).unique();
      if(existing) continue;
      const service = lead.serviceType ? SERVICE_TYPE_LABELS[lead.serviceType] : NICHE_LABELS[lead.niche];
      const location = lookupRegionByPostcode(lead.postalCode??'')?.city ?? lead.province ?? 'jouw werkgebied';
      const id = await ctx.db.insert('marketplaceBuyerNotifications',{
        leadId,orgId:org._id,recipient:owner.email,from:process.env.EMAIL_FROM??'noreply@example.com',
        subject:`Nieuwe passende aanvraag: ${service} in ${location}`,
        body:[`Er staat een nieuwe aanvraag klaar voor ${org.name}.`,`Dienst: ${service}`,`Plaats: ${location}`,
          `Exclusief: ${euros(lead.priceExclusiveCents)}. Gedeeld: ${euros(lead.priceSharedCents)} per koper, maximaal ${lead.maxSharedBuyers} kopers totaal.`,
          'De actuele beschikbaarheid staat in LeadFlow. Contactgegevens worden pas na aankoop zichtbaar.',
          `${(process.env.SITE_URL??'https://leadflow.wetry.app').replace(/\/$/,'')}/feed/lead/${leadId}`].join('\n\n'),
        state:'pending',attempts:0,
      });
      await ctx.scheduler.runAfter(0,internal.marketplace.buyerNotifications.deliver,{id});
    }
    if(!batch.isDone) await ctx.scheduler.runAfter(0,internal.marketplace.buyerNotifications.queueForLead,{leadId,cursor:batch.continueCursor});
    return null;
  },
});

export const claim = internalMutation({
  args:{id:v.id('marketplaceBuyerNotifications')},
  returns:v.union(v.null(),v.object({attempt:v.number(),recipient:v.string(),from:v.string(),subject:v.string(),body:v.string()})),
  handler:async(ctx,{id})=>{
    const row=await ctx.db.get(id), now=Date.now();
    if(!row || row.state==='sent' || row.state==='skipped' || (row.leaseUntil??0)>now) return null;
    if(row.attempts>=3 || now-row._creationTime>23*60*60*1000){
      await ctx.db.patch(id,{state:'failed',leaseUntil:undefined}); return null;
    }
    const lead=await ctx.db.get(row.leadId),org=await ctx.db.get(row.orgId);
    const prefs=await ctx.db.query('marketplaceBuyerPreferences').withIndex('by_org',q=>q.eq('orgId',row.orgId)).unique();
    const owner=org?await ctx.db.get(org.ownerId):null;
    if(!lead || !isLeadForSale(lead) || !org?.marketplaceEnabled || !prefs || !emailEnabled(prefs) || !matchesBuyer(lead,prefs) || owner?.email!==row.recipient){
      await ctx.db.patch(id,{state:'skipped',leaseUntil:undefined});return null;
    }
    const purchases=await ctx.db.query('marketplacePurchases').withIndex('by_lead',q=>q.eq('leadId',lead._id)).take(10);
    const exclusive=lead.allowExclusive && purchases.length===0;
    const shared=lead.allowShared && !purchases.some(p=>p.mode==='exclusive') && purchases.length<lead.maxSharedBuyers;
    if(purchases.some(p=>p.buyerOrgId===row.orgId) || (!exclusive&&!shared) || (prefs.preferredMode==='exclusive'&&!exclusive) || (prefs.preferredMode==='shared'&&!shared)){
      await ctx.db.patch(id,{state:'skipped',leaseUntil:undefined});return null;
    }
    const attempt=row.attempts+1;
    await ctx.db.patch(id,{state:'sending',attempts:attempt,leaseUntil:now+60_000});
    // Persist the recovery task before I/O, so a crashed action does not lose the email.
    await ctx.scheduler.runAfter(60_000,internal.marketplace.buyerNotifications.deliver,{id});
    return {attempt,recipient:row.recipient,from:row.from,subject:row.subject,body:row.body};
  },
});

export const complete = internalMutation({
  args:{id:v.id('marketplaceBuyerNotifications'),attempt:v.number(),sent:v.boolean()},returns:v.null(),
  handler:async(ctx,{id,attempt,sent})=>{
    const row=await ctx.db.get(id);
    if(row?.state==='sending' && row.attempts===attempt) await ctx.db.patch(id,{state:sent?'sent':'failed',leaseUntil:undefined,...(sent?{sentAt:Date.now()}:{})});
    return null;
  },
});

export const deliver = internalAction({
  args:{id:v.id('marketplaceBuyerNotifications')},returns:v.null(),
  handler:async(ctx,{id})=>{
    const mail=await ctx.runMutation(internal.marketplace.buyerNotifications.claim,{id});
    if(!mail) return null;
    let sent=false;
    try{
      if(process.env.RESEND_API_KEY){
        const res=await fetch('https://api.resend.com/emails',{
          method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`marketplace-buyer/${id}`},
          body:JSON.stringify({from:mail.from,to:mail.recipient,subject:mail.subject,text:mail.body}),signal:AbortSignal.timeout(15_000),
        });
        sent=res.ok;
      }
    }catch{ /* Recovery uses the same stored payload and provider idempotency key. */ }
    await ctx.runMutation(internal.marketplace.buyerNotifications.complete,{id,attempt:mail.attempt,sent});
    return null;
  },
});

/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {expect,test} from 'vitest';
import schema from './schema';
import {api,internal} from './_generated/api';
const modules=import.meta.glob('./**/*.ts');
async function setup(){
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const userId=await ctx.db.insert('users',{clerkUserId:'review-admin'});
    await ctx.db.insert('userProfiles',{userId,locale:'nl',isSuperAdmin:true});
    const buyerId=await ctx.db.insert('users',{clerkUserId:'review-buyer',email:'buyer@example.invalid'});
    await ctx.db.insert('userProfiles',{userId:buyerId,locale:'nl',isSuperAdmin:false});
    const orgId=await ctx.db.insert('orgs',{ownerId:buyerId,name:'Test',slug:'test',marketplaceEnabled:true});
    const workspaceId=await ctx.db.insert('workspaces',{orgId,name:'Test',isDefault:true});
    await ctx.db.insert('memberships',{userId:buyerId,orgId,workspaceId,role:'owner'});
    await ctx.db.insert('marketplaceWallets',{orgId,balanceCents:20000,updatedAt:1});
    await ctx.db.insert('marketplaceBuyerPreferences',{orgId,niches:['airco'],serviceTypes:['install'],provinces:['Limburg'],preferredMode:'both',notifyOnNewLead:true,notifyChannel:'email',emailAlertsActivatedAt:1,updatedAt:1});
    const leadId=await ctx.db.insert('marketplaceLeads',{niche:'airco',segment:'b2c',province:'Limburg',status:'published',score:'high',allowExclusive:true,allowShared:true,maxSharedBuyers:3,priceExclusiveCents:6000,priceSharedCents:2000,publishedAt:1000,expiresAt:Date.now()+86400000,phoneVerifiedAt:900,emailVerifiedAt:800,followUpStatus:'new',followUpDueAt:Date.now()+40000,metadata:{source:'test-source',v1CreatedAt:'2026-05-23T07:33:31.138Z',serviceType:'Legacy label'}});
    return {leadId,userId,buyerId,orgId,workspaceId};
  });
  const admin=t.withIdentity({subject:'review-admin'});
  const args={leadId:ids.leadId,serviceType:'install' as const,expectedServiceType:null,expectedRevision:0,note:'Installatie blijkt uit de aanvraag.'};
  const overview=()=>admin.query(api.marketplace.admin.listLeads,{paginationOpts:{cursor:null,numItems:25}});
  return {t,admin,...ids,args,overview};
}
test('review changes matching, records actor and reason, preserves all other lead data and sends nothing',async()=>{
  const {t,admin,leadId,userId,args,overview}=await setup();
  const before=await t.run(ctx=>ctx.db.get(leadId));
  expect((await overview()).page[0].coverage.status).toBe('uncovered');
  await admin.mutation(api.marketplace.admin.reviewServiceType,args);
  const after=await t.run(ctx=>ctx.db.get(leadId));
  expect(after).toEqual({...before,serviceType:'install',serviceTypeRevision:1});
  const view=(await overview()).page[0];
  expect(view).toMatchObject({serviceType:'install',serviceTypeRevision:1,coverage:{status:'covered'},latestServiceReview:{note:args.note}});
  const reviews=await t.run(ctx=>ctx.db.query('marketplaceServiceReviews').take(10));
  expect(reviews).toHaveLength(1);expect(reviews[0]).toMatchObject({leadId,before:null,after:'install',reviewedBy:userId,note:args.note,revision:1});
  expect(await t.run(ctx=>ctx.db.query('marketplaceBuyerNotifications').take(1))).toHaveLength(0);
  expect(await t.run(ctx=>ctx.db.system.query('_scheduled_functions').take(1))).toHaveLength(0);
  await admin.mutation(api.marketplace.admin.reviewServiceType,{...args,serviceType:null,expectedServiceType:'install',expectedRevision:1,note:'Type blijkt toch niet duidelijk.'});
  expect((await overview()).page[0]).toMatchObject({serviceType:null,serviceTypeRevision:2,coverage:{status:'uncovered'}});
  expect(await t.run(ctx=>ctx.db.query('marketplaceServiceReviews').take(10))).toHaveLength(2);
});
test.each(['anonymous','buyer'])('review is denied for %s',async identity=>{
  const {t,args}=await setup();
  const caller=identity==='anonymous'?t:t.withIdentity({subject:'review-buyer'});
  await expect(caller.mutation(api.marketplace.admin.reviewServiceType,args)).rejects.toThrow();
  expect(await t.run(ctx=>ctx.db.query('marketplaceServiceReviews').take(1))).toHaveLength(0);
});
test.each(['','  ','ab','x'.repeat(501)])('rejects invalid review note length %s',async note=>{
  const {admin,args}=await setup();
  await expect(admin.mutation(api.marketplace.admin.reviewServiceType,{...args,note})).rejects.toThrow('toelichting');
});
test('stale edits and ABA changes cannot overwrite a newer review',async()=>{
  const {admin,args}=await setup();
  await admin.mutation(api.marketplace.admin.reviewServiceType,args);
  await expect(admin.mutation(api.marketplace.admin.reviewServiceType,args)).rejects.toThrow('ondertussen gewijzigd');
  await admin.mutation(api.marketplace.admin.reviewServiceType,{...args,serviceType:null,expectedServiceType:'install',expectedRevision:1});
  await expect(admin.mutation(api.marketplace.admin.reviewServiceType,args)).rejects.toThrow('ondertussen gewijzigd');
});
test('purchase after opening the editor blocks a review even if status still says published',async()=>{
  const {t,admin,args,leadId,buyerId,orgId,workspaceId,overview}=await setup();
  expect((await overview()).page[0].canEditServiceType).toBe(true);
  await t.run(ctx=>ctx.db.insert('marketplacePurchases',{leadId,buyerUserId:buyerId,buyerOrgId:orgId,buyerWorkspaceId:workspaceId,mode:'shared',priceCents:2000,purchasedAt:Date.now(),buyerStatus:'new'}));
  expect((await overview()).page[0].canEditServiceType).toBe(false);
  await expect(admin.mutation(api.marketplace.admin.reviewServiceType,args)).rejects.toThrow('verkochte aanvraag');
});
test.each(['sold_shared','sold_exclusive'] as const)('legacy sold status %s blocks reviews',async status=>{
  const {t,admin,args,leadId}=await setup();
  await t.run(ctx=>ctx.db.patch(leadId,{status}));
  await expect(admin.mutation(api.marketplace.admin.reviewServiceType,args)).rejects.toThrow('verkochte aanvraag');
});

test('pause blocks real purchase and coverage; resume preserves original dates and requires current-need confirmation',async()=>{
  const {t,admin,leadId,overview,userId,orgId}=await setup();
  await t.run(ctx=>ctx.db.patch(leadId,{serviceType:'install'}));
  const before=await t.run(ctx=>ctx.db.get(leadId));
  const buyer=t.withIdentity({subject:'review-buyer'});
  expect(await buyer.query(api.marketplace.feed.getBuyerFeed,{})).toHaveLength(1);
  const mailId=await t.run(ctx=>ctx.db.insert('marketplaceBuyerNotifications',{leadId,orgId,recipient:'buyer@example.invalid',from:'test@example.invalid',subject:'Test',body:'Test',state:'pending',attempts:0}));
  const pause={leadId,action:'pause' as const,expectedRevision:0,note:'Oude aanvraag eerst opnieuw beoordelen.',confirmedCurrent:false};
  await admin.mutation(api.marketplace.admin.reviewSale,pause);
  expect(await t.run(ctx=>ctx.db.get(leadId))).toEqual({...before,status:'pending_review',salePausedByAdmin:true,saleReviewRevision:1});
  expect((await overview()).page[0]).toMatchObject({saleReviewAction:'resume',coverage:{status:'unavailable'}});
  expect(await buyer.query(api.marketplace.feed.getBuyerFeed,{})).toHaveLength(0);
  expect(await buyer.query(api.marketplace.feed.getMaskedLeadDetail,{leadId})).toBeNull();
  expect(await t.mutation(internal.marketplace.buyerNotifications.claim,{id:mailId})).toBeNull();
  expect(await t.run(ctx=>ctx.db.get(mailId))).toMatchObject({state:'skipped',attempts:0});
  expect(await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).toMatchObject({success:false,error:'lead_not_available'});
  const resume={...pause,action:'resume' as const,expectedRevision:1,note:'Behoefte door beheer opnieuw bevestigd.'};
  await expect(admin.mutation(api.marketplace.admin.reviewSale,resume)).rejects.toThrow('actueel');
  await admin.mutation(api.marketplace.admin.reviewSale,{...resume,confirmedCurrent:true});
  expect(await t.run(ctx=>ctx.db.get(leadId))).toEqual({...before,salePausedByAdmin:false,saleReviewRevision:2});
  expect((await overview()).page[0]).toMatchObject({saleReviewAction:'pause',coverage:{status:'covered'}});
  expect(await buyer.query(api.marketplace.feed.getBuyerFeed,{})).toHaveLength(1);
  const history=await t.run(ctx=>ctx.db.query('marketplaceSaleReviews').withIndex('by_lead',q=>q.eq('leadId',leadId)).take(10));
  expect(history).toHaveLength(2);expect(history[0]).toMatchObject({reviewedBy:userId,action:'pause',confirmedCurrent:false});expect(history[1]).toMatchObject({action:'resume',confirmedCurrent:true});
  expect(await t.run(ctx=>ctx.db.system.query('_scheduled_functions').take(1))).toHaveLength(0);
});
test('sale review refuses unauthorized, stale, invalid and purchased changes',async()=>{
  const {t,admin,leadId,buyerId,orgId,workspaceId}=await setup();
  const args={leadId,action:'pause' as const,expectedRevision:0,note:'Controle nodig.',confirmedCurrent:false};
  await expect(t.mutation(api.marketplace.admin.reviewSale,args)).rejects.toThrow();
  await expect(t.withIdentity({subject:'review-buyer'}).mutation(api.marketplace.admin.reviewSale,args)).rejects.toThrow();
  await expect(admin.mutation(api.marketplace.admin.reviewSale,{...args,note:' '})).rejects.toThrow('reden');
  await admin.mutation(api.marketplace.admin.reviewSale,args);
  await expect(admin.mutation(api.marketplace.admin.reviewSale,args)).rejects.toThrow('ondertussen');
  await t.run(ctx=>ctx.db.insert('marketplacePurchases',{leadId,buyerUserId:buyerId,buyerOrgId:orgId,buyerWorkspaceId:workspaceId,mode:'shared',priceCents:2000,purchasedAt:Date.now(),buyerStatus:'new'}));
  await expect(admin.mutation(api.marketplace.admin.reviewSale,{...args,action:'resume',expectedRevision:1,confirmedCurrent:true})).rejects.toThrow('verkochte');
});
test('expired pauses and unrelated pending-review leads cannot be republished',async()=>{
  const {t,admin,leadId,overview}=await setup();
  const args={leadId,action:'resume' as const,expectedRevision:0,note:'Controle uitgevoerd.',confirmedCurrent:true};
  await t.run(ctx=>ctx.db.patch(leadId,{status:'pending_review'}));
  await expect(admin.mutation(api.marketplace.admin.reviewSale,args)).rejects.toThrow('niet via beheer');
  await t.run(ctx=>ctx.db.patch(leadId,{salePausedByAdmin:true,expiresAt:Date.now()-1}));
  expect((await overview()).page[0].saleReviewAction).toBeNull();
  await expect(admin.mutation(api.marketplace.admin.reviewSale,args)).rejects.toThrow('verkooptermijn');
});

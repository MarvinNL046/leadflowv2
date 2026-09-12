/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {test,expect,vi,beforeEach,afterEach} from 'vitest';
import schema from './schema';
import {api,internal} from './_generated/api';
const modules=import.meta.glob('./**/*.ts');
const fetchMock=vi.fn();
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
  vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset().mockResolvedValue(Response.json({id:'local-only'}));
  vi.stubEnv('RESEND_API_KEY','local-only');vi.stubEnv('EMAIL_FROM','test@example.invalid');vi.stubEnv('SUPER_ADMIN_EMAILS','admin@example.invalid');
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function setup(){
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const userId=await ctx.db.insert('users',{clerkUserId:'pilot',email:'buyer@example.invalid'});
    const orgId=await ctx.db.insert('orgs',{name:'Staycool Airconditioning',slug:'pilot',ownerId:userId,marketplaceEnabled:true});
    const workspaceId=await ctx.db.insert('workspaces',{orgId,name:'pilot',isDefault:true});
    await ctx.db.insert('memberships',{userId,orgId,workspaceId,role:'owner'});
    await ctx.db.insert('marketplaceWallets',{orgId,balanceCents:20000,updatedAt:Date.now()});
    const apiKeyId=await ctx.db.insert('marketplaceApiKeys',{name:'pilot.invalid',keyHash:'pilot-only',keyPrefix:'pilot',defaultNiche:'airco',allowedNiches:['airco'],trusted:true,isActive:true});
    return {orgId,userId,workspaceId,apiKeyId};
  });
  await t.mutation(internal.marketplace.adminCli.configureStaycoolPilot,{orgId:ids.orgId});
  await t.mutation(internal.marketplace.adminCli.setAircoInstallPolicy,{expiryDays:7});
  const {leadId}=await t.mutation(internal.marketplace.intake.insertLead,{apiKeyId:ids.apiKeyId,serviceType:'install',firstName:'Private',lastName:'Person',email:'private@example.invalid',phone:'+31612345678',postalCode:'6222XD',message:'Private message with +31612345678'});
  return {t,...ids,leadId,buyer:t.withIdentity({subject:'pilot'})};
}
const buyerCalls=()=>fetchMock.mock.calls.filter(([,init])=>init?.headers?.['Idempotency-Key']?.startsWith('marketplace-buyer/'));

test('matching buyer gets one safe email despite duplicate queue and delivery calls',async()=>{
  const {t,leadId}=await setup();
  for(let i=0;i<3;i++) await t.mutation(internal.marketplace.buyerNotifications.queueForLead,{leadId});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const rows=await t.run(ctx=>ctx.db.query('marketplaceBuyerNotifications').collect());
  expect(rows).toHaveLength(1);expect(rows[0].state).toBe('sent');expect(buyerCalls()).toHaveLength(1);
  const body=JSON.parse(buyerCalls()[0][1].body);
  expect(body.to).toBe('buyer@example.invalid');expect(body.text).toContain('3 kopers totaal');
  expect(body.text).not.toContain('Private');expect(body.text).not.toContain('private@example.invalid');expect(body.text).not.toContain('+31612345678');
});

test.each(['province','service','optout','disabled'] as const)('no email for %s mismatch',async variant=>{
  const {t,buyer,leadId,orgId}=await setup();
  if(variant==='province') await buyer.mutation(api.marketplace.buyerPreferences.updateBuyerPreferences,{provinces:['Groningen']});
  if(variant==='service') await buyer.mutation(api.marketplace.buyerPreferences.updateBuyerPreferences,{serviceTypes:['repair']});
  if(variant==='optout') await buyer.mutation(api.marketplace.buyerPreferences.updateBuyerPreferences,{notifyOnNewLead:false});
  if(variant==='disabled') await t.run(ctx=>ctx.db.patch(orgId,{marketplaceEnabled:false}));
  await t.mutation(internal.marketplace.buyerNotifications.queueForLead,{leadId});
  await t.finishAllScheduledFunctions(vi.runAllTimers);expect(buyerCalls()).toHaveLength(0);
});

test('failed delivery retries three times with identical provider key and payload',async()=>{
  const {t}=await setup();fetchMock.mockResolvedValue(new Response('{}',{status:503}));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(buyerCalls()).toHaveLength(3);
  expect(new Set(buyerCalls().map(([,i])=>i.headers['Idempotency-Key'])).size).toBe(1);
  expect(new Set(buyerCalls().map(([,i])=>i.body)).size).toBe(1);
  expect((await t.run(ctx=>ctx.db.query('marketplaceBuyerNotifications').first()))?.state).toBe('failed');
});

test('delivery rechecks eligibility after queueing',async()=>{
  const {t,leadId}=await setup();
  await t.mutation(internal.marketplace.buyerNotifications.queueForLead,{leadId});
  await t.run(ctx=>ctx.db.patch(leadId,{expiresAt:Date.now()}));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(buyerCalls()).toHaveLength(0);
});

test('legacy notification preference stays inactive until explicitly activated',async()=>{
  const {t,orgId}=await setup();
  await t.run(async ctx=>{
    const prefs=await ctx.db.query('marketplaceBuyerPreferences').withIndex('by_org',q=>q.eq('orgId',orgId)).unique();
    await ctx.db.patch(prefs!._id,{emailAlertsActivatedAt:undefined});
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);expect(buyerCalls()).toHaveLength(0);
});

test('lease prevents simultaneous delivery claims and recovers after a crash',async()=>{
  const {t,leadId}=await setup();await t.mutation(internal.marketplace.buyerNotifications.queueForLead,{leadId});
  const row=await t.run(ctx=>ctx.db.query('marketplaceBuyerNotifications').first());
  expect(await t.mutation(internal.marketplace.buyerNotifications.claim,{id:row!._id})).not.toBeNull();
  expect(await t.mutation(internal.marketplace.buyerNotifications.claim,{id:row!._id})).toBeNull();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(buyerCalls()).toHaveLength(1);
});

test('new installation policy flags after one day and expires after seven days',async()=>{
  const {t,leadId,buyer}=await setup();
  const lead=await t.run(ctx=>ctx.db.get(leadId));
  expect(lead!.expiresAt!-lead!.publishedAt!).toBe(7*86400000);
  expect(lead!.followUpDueAt!-lead!.publishedAt!).toBe(86400000);
  vi.setSystemTime(Date.now()+86400000);
  expect(await t.mutation(internal.marketplace.lifecycle.sweep,{})).toMatchObject({flagged:1});
  expect(await t.mutation(internal.marketplace.lifecycle.sweep,{})).toMatchObject({flagged:0});
  vi.setSystemTime(lead!.expiresAt!);
  expect((await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).success).toBe(false);
  expect(await t.mutation(internal.marketplace.lifecycle.sweep,{})).toMatchObject({expired:1});
  expect((await t.run(ctx=>ctx.db.get(leadId)))?.status).toBe('expired');
});

test('purchased leads do not create an unclaimed warning',async()=>{
  const {t,leadId,buyer}=await setup();
  expect((await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).success).toBe(true);
  vi.setSystemTime(Date.now()+86400000);await t.mutation(internal.marketplace.lifecycle.sweep,{});
  expect((await t.run(ctx=>ctx.db.get(leadId)))?.unclaimedAt).toBeUndefined();
});

test('three shared buyers allowed; fourth refused and exclusive closes after first shared',async()=>{
  const {t,buyer,leadId}=await setup();
  expect((await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).success).toBe(true);
  for(let i=1;i<=3;i++){
    await t.run(async ctx=>{
      const userId=await ctx.db.insert('users',{clerkUserId:'buyer'+i});
      const orgId=await ctx.db.insert('orgs',{name:'buyer'+i,slug:'buyer'+i,ownerId:userId,marketplaceEnabled:true});
      const workspaceId=await ctx.db.insert('workspaces',{orgId,name:'buyer',isDefault:true});
      await ctx.db.insert('memberships',{orgId,userId,workspaceId,role:'owner'});
      await ctx.db.insert('marketplaceWallets',{orgId,balanceCents:10000,updatedAt:Date.now()});
      await ctx.db.insert('marketplaceBuyerPreferences',{orgId,niches:['airco'],preferredMode:'both',notifyOnNewLead:false,notifyChannel:'none',updatedAt:Date.now()});
    });
    const other=t.withIdentity({subject:'buyer'+i});
    expect((await other.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'exclusive'})).success).toBe(false);
    expect((await other.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).success).toBe(i<3);
  }
  expect(await t.run(ctx=>ctx.db.query('marketplacePurchases').collect())).toHaveLength(3);
});

test('settings can clear service/province filters explicitly and empty provinces match none',async()=>{
  const {buyer}=await setup();
  await buyer.mutation(api.marketplace.buyerPreferences.updateBuyerPreferences,{provinces:[]});
  expect(await buyer.query(api.marketplace.feed.getBuyerFeed,{})).toHaveLength(0);
  await buyer.mutation(api.marketplace.buyerPreferences.updateBuyerPreferences,{provinces:null,serviceTypes:null});
  const prefs=await buyer.query(api.marketplace.buyerPreferences.getBuyerPreferences,{});
  expect(prefs?.provinces).toBeUndefined();expect(prefs?.serviceTypes).toBeUndefined();
  expect(await buyer.query(api.marketplace.feed.getBuyerFeed,{})).toHaveLength(1);
});

test('cap migration only changes unsold capacity, preserving prices and expiry',async()=>{
  const {t,leadId}=await setup();await t.run(ctx=>ctx.db.patch(leadId,{maxSharedBuyers:4}));
  const before=await t.run(ctx=>ctx.db.get(leadId));
  expect(await t.mutation(internal.marketplace.adminCli.capUnpurchasedLeads,{})).toMatchObject({changed:1});
  const after=await t.run(ctx=>ctx.db.get(leadId));
  expect(after).toMatchObject({maxSharedBuyers:3,priceExclusiveCents:before!.priceExclusiveCents,expiresAt:before!.expiresAt});
});

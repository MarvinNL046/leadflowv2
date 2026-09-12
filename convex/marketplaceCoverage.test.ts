/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {expect,test} from 'vitest';
import schema from './schema';
import {api} from './_generated/api';
import type {Doc} from './_generated/dataModel';
import {coverageForLead} from './marketplace/coverage';
const modules=import.meta.glob('./**/*.ts');
const now=Date.parse('2026-09-12T12:00:00Z');
const lead={_id:'lead',_creationTime:now,niche:'airco',segment:'b2c',serviceType:'install',province:'Limburg',status:'published',allowExclusive:true,allowShared:true,maxSharedBuyers:3} as Doc<'marketplaceLeads'>;
const buyer={_id:'prefs',orgId:'org',niches:['airco'],serviceTypes:['install'],provinces:['Limburg'],preferredMode:'both',notifyOnNewLead:false,notifyChannel:'none'} as Doc<'marketplaceBuyerPreferences'>;
const purchase=(org='other',mode='shared')=>({buyerOrgId:org,mode} as Doc<'marketplacePurchases'>);

test.each([
  [{serviceType:undefined},{},'unknown_service'],
  [{serviceType:'maintain'},{},'service'],
  [{province:'Noord-Brabant'},{},'province'],
  [{province:undefined},{},'unknown_province'],
  [{},{provinces:[]},'province'],
  [{},{segments:['b2b']},'segment'],
  [{niche:'loodgieter'},{},'niche'],
] as const)('explains missing coverage %j %j', (leadPatch,buyerPatch,reason)=>{
  expect(coverageForLead({...lead,...leadPatch} as Doc<'marketplaceLeads'>,[{...buyer,...buyerPatch} as Doc<'marketplaceBuyerPreferences'>],true,[],now)).toMatchObject({status:'uncovered',matchingBuyers:0,complete:true,reasons:[reason]});
});
test('all-service and all-province buyers can match unknown values; mail opt-out does not remove coverage',()=>{
  expect(coverageForLead({...lead,serviceType:undefined,province:undefined},[{...buyer,serviceTypes:undefined,provinces:undefined}],true,[],now)).toMatchObject({status:'covered',matchingBuyers:1});
});
test.each(['rejected','expired','sold_exclusive','pending_review'] as const)('closed lead %s does not count as a coverage gap',status=>{
  expect(coverageForLead({...lead,status},[buyer],true,[],now).status).toBe('unavailable');
});
test('timestamp expiry closes coverage immediately',()=>{
  expect(coverageForLead({...lead,expiresAt:now},[buyer],true,[],now).status).toBe('unavailable');
});
test('shared slots, exclusive sale and preferred mode are respected',()=>{
  expect(coverageForLead(lead,[buyer],true,[purchase(),purchase('two'),purchase('three')],now).status).toBe('unavailable');
  expect(coverageForLead(lead,[buyer],true,[purchase('other','exclusive')],now).status).toBe('unavailable');
  expect(coverageForLead(lead,[{...buyer,preferredMode:'exclusive'}],true,[purchase()],now).reasons).toEqual(['mode']);
  expect(coverageForLead(lead,[buyer],true,[purchase()],now).status).toBe('covered');
  expect(coverageForLead(lead,[buyer],true,[purchase('org')],now).reasons).toEqual(['already_purchased']);
});
test('incomplete reads never claim definite zero; positive matches are a lower bound',()=>{
  expect(coverageForLead(lead,[],false,[],now)).toMatchObject({status:'unknown',complete:false});
  expect(coverageForLead(lead,[buyer],false,[],now)).toMatchObject({status:'covered',matchingBuyers:1,complete:false});
  expect(coverageForLead(lead,[buyer],true,Array.from({length:101},()=>purchase()),now)).toMatchObject({status:'unknown',complete:false});
  expect(coverageForLead(lead,[],true,[],now).reasons).toEqual(['no_active_buyers']);
});

test('admin coverage updates with active preferences, ignores disabled orgs and stays read-only',async()=>{
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const userId=await ctx.db.insert('users',{clerkUserId:'coverage-admin'});
    await ctx.db.insert('userProfiles',{userId,locale:'nl',isSuperAdmin:true});
    const orgId=await ctx.db.insert('orgs',{ownerId:userId,name:'Coverage test',slug:'coverage',marketplaceEnabled:false});
    const prefsId=await ctx.db.insert('marketplaceBuyerPreferences',{orgId,niches:['airco'],serviceTypes:['install'],provinces:['Limburg'],preferredMode:'both',notifyOnNewLead:false,notifyChannel:'none',updatedAt:now});
    const leadId=await ctx.db.insert('marketplaceLeads',{niche:'airco',segment:'b2c',serviceType:'install',province:'Limburg',status:'published',score:'high',allowExclusive:true,allowShared:true,maxSharedBuyers:3,priceExclusiveCents:6000,priceSharedCents:2000});
    return {orgId,prefsId,leadId};
  });
  const admin=t.withIdentity({subject:'coverage-admin'});
  const args={paginationOpts:{cursor:null,numItems:25}};
  await expect(t.query(api.marketplace.admin.listLeads,args)).rejects.toThrow();
  await expect(t.withIdentity({subject:'no-profile'}).query(api.marketplace.admin.listLeads,args)).rejects.toThrow();
  const before=await t.run(ctx=>ctx.db.get(ids.leadId));
  expect((await admin.query(api.marketplace.admin.listLeads,args)).page[0].coverage.reasons).toEqual(['no_active_buyers']);
  await t.run(ctx=>ctx.db.patch(ids.orgId,{marketplaceEnabled:true}));
  expect((await admin.query(api.marketplace.admin.listLeads,args)).page[0].coverage).toMatchObject({status:'covered',matchingBuyers:1});
  await t.run(ctx=>ctx.db.patch(ids.prefsId,{serviceTypes:['repair']}));
  expect((await admin.query(api.marketplace.admin.listLeads,args)).page[0].coverage.reasons).toEqual(['service']);
  expect(await t.run(ctx=>ctx.db.get(ids.leadId))).toEqual(before);
  expect(await t.run(ctx=>ctx.db.query('marketplaceBuyerNotifications').take(1))).toHaveLength(0);
});

test('more than 200 preferences cannot produce a false no-buyer result',async()=>{
  const t=convexTest(schema,modules);
  await t.run(async ctx=>{
    const userId=await ctx.db.insert('users',{clerkUserId:'limited-admin'});
    await ctx.db.insert('userProfiles',{userId,locale:'nl',isSuperAdmin:true});
    const orgId=await ctx.db.insert('orgs',{ownerId:userId,name:'Disabled',slug:'disabled',marketplaceEnabled:false});
    for(let i=0;i<201;i++) await ctx.db.insert('marketplaceBuyerPreferences',{orgId,niches:[],preferredMode:'both',notifyOnNewLead:false,notifyChannel:'none',updatedAt:now});
    await ctx.db.insert('marketplaceLeads',{niche:'airco',segment:'b2c',status:'published',score:'high',allowExclusive:true,allowShared:true,maxSharedBuyers:3,priceExclusiveCents:6000,priceSharedCents:2000});
  });
  const result=await t.withIdentity({subject:'limited-admin'}).query(api.marketplace.admin.listLeads,{paginationOpts:{cursor:null,numItems:25}});
  expect(result.page[0].coverage).toMatchObject({status:'unknown',complete:false});
});

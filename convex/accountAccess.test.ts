/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {afterEach,expect,test,vi} from 'vitest';
import schema from './schema';
import {api,internal} from './_generated/api';
const modules=import.meta.glob('./**/*.ts');
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

async function setup(){
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const owner=await ctx.db.insert('users',{clerkUserId:'owner'});
    const admin=await ctx.db.insert('users',{clerkUserId:'admin'});
    const member=await ctx.db.insert('users',{clerkUserId:'member'});
    const outsider=await ctx.db.insert('users',{clerkUserId:'outsider'});
    const orgId=await ctx.db.insert('orgs',{name:'A',slug:'a',ownerId:owner});
    const otherOrg=await ctx.db.insert('orgs',{name:'B',slug:'b',ownerId:outsider});
    const workspaceId=await ctx.db.insert('workspaces',{orgId,name:'A',isDefault:true});
    await ctx.db.insert('memberships',{userId:owner,orgId,workspaceId,role:'owner'});
    await ctx.db.insert('memberships',{userId:admin,orgId,workspaceId,role:'admin'});
    await ctx.db.insert('memberships',{userId:member,orgId,workspaceId,role:'member'});
    await ctx.db.insert('memberships',{userId:outsider,orgId:otherOrg,role:'owner'});
    const pageId=await ctx.db.insert('metaPages',{orgId,pageId:'page-a',pageName:'A',accessToken:'test-token',isActive:true});
    await ctx.db.insert('whatsappWebConfig',{workspaceId,sessionId:'test-session',phoneNumber:'',isActive:true});
    return {owner,admin,member,outsider,orgId,workspaceId,pageId};
  });
  vi.stubEnv('LEGACY_PROVIDER_ORG_ID',ids.orgId);
  return {t,...ids};
}

test.each(['anonymous','outsider','member'])('integration actions reject %s before provider calls or writes',async subject=>{
  const {t,workspaceId,pageId}=await setup();
  const caller=subject==='anonymous'?t:t.withIdentity({subject});
  vi.stubEnv('VOIDFIX_API_KEY','test-only');
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify({data:[],sessionId:'new-session',qrCode:'test',isConnected:false}),{status:200}));
  vi.stubGlobal('fetch',fetchMock);
  await expect(caller.action(api.integrations.syncFormsForPage,{pageId})).rejects.toThrow();
  await expect(caller.action(api.integrations.linkWhatsapp,{workspaceId})).rejects.toThrow();
  await expect(caller.action(api.integrations.checkWhatsappStatus,{workspaceId})).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await t.run(ctx=>ctx.db.query('whatsappWebConfig').first())).toMatchObject({sessionId:'test-session',isActive:true});
});

test.each(['owner','admin'])('%s can manage own integration with mocked providers',async subject=>{
  const {t,workspaceId,pageId}=await setup();const caller=t.withIdentity({subject});
  vi.stubEnv('VOIDFIX_API_KEY','test-only');
  vi.stubGlobal('fetch',vi.fn(async(input)=>new Response(JSON.stringify(String(input).includes('leadgen_forms')?{data:[]}:{isConnected:true}),{status:200})));
  expect(await caller.action(api.integrations.syncFormsForPage,{pageId})).toEqual({synced:0,errors:[]});
  expect(await caller.action(api.integrations.checkWhatsappStatus,{workspaceId})).toMatchObject({success:true,isConnected:true});
});

test('member cannot change integrations or initiate OAuth; owner/admin can',async()=>{
  const {t,orgId,workspaceId,pageId,member,owner,admin,outsider}=await setup();
  const caller=t.withIdentity({subject:'member'});
  await expect(caller.mutation(api.integrations.disconnectWhatsapp,{workspaceId})).rejects.toThrow();
  await expect(caller.mutation(api.integrations.disconnectMeta,{orgId})).rejects.toThrow();
  await expect(caller.mutation(api.integrations.assignMetaPageToWorkspace,{pageId,workspaceId})).rejects.toThrow();
  for(const userId of [member,outsider])expect(await t.query(internal.metaOauth.userHasOrgAccess,{userId,orgId})).toBe(false);
  for(const userId of [owner,admin])expect(await t.query(internal.metaOauth.userHasOrgAccess,{userId,orgId})).toBe(true);
});

test('new verified signup is not a platform admin and has no company access',async()=>{
  const {t,orgId,workspaceId}=await setup();
  const caller=t.withIdentity({subject:'new-company',email:'company@example.invalid',emailVerified:true});
  expect(await caller.mutation(api.userProfiles.getOrCreateUserProfile,{})).toMatchObject({isSuperAdmin:false});
  expect(await caller.query(api.userProfiles.myTenants,{})).toEqual([]);
  expect(await caller.query(api.marketplace.access.marketplaceAccess,{})).toEqual({ok:false});
  await expect(caller.query(api.contacts.list,{workspaceId})).rejects.toThrow();
  await expect(caller.query(api.marketplace.admin.listSources,{})).rejects.toThrow();
  await expect(caller.mutation(api.marketplace.access.enableMarketplaceForCurrentOrg,{orgId})).rejects.toThrow();
});

test('unverified administrator email cannot bootstrap privileges',async()=>{
  const t=convexTest(schema,modules);
  const caller=t.withIdentity({subject:'unverified',email:'marvinsmit1988@gmail.com',emailVerified:false});
  expect(await caller.mutation(api.userProfiles.getOrCreateUserProfile,{})).toMatchObject({isSuperAdmin:false});
  expect(await caller.query(api.userProfiles.myTenants,{})).toEqual([]);
});

test('company owner cannot read another company CRM or platform intake',async()=>{
  const {t,workspaceId}=await setup();
  const caller=t.withIdentity({subject:'outsider'});
  await expect(caller.query(api.contacts.list,{workspaceId})).rejects.toThrow();
  await expect(caller.query(api.crmSettings.get,{workspaceId})).rejects.toThrow();
  await expect(caller.query(api.marketplace.admin.listSources,{})).rejects.toThrow();
});

test('OAuth completion rechecks the signed-state actor and current role',async()=>{
  const {t,orgId,owner,member,outsider}=await setup();
  const args={orgId,metaUserId:'meta-test',accessToken:'test-only',pages:[]};
  for(const authorizedUserId of [member,outsider]) {
    await expect(t.mutation(internal.integrations.upsertMetaConnectionInternal,{...args,authorizedUserId})).rejects.toThrow();
  }
  await t.mutation(internal.integrations.upsertMetaConnectionInternal,{...args,authorizedUserId:owner});
  await t.run(async ctx=>{
    const m=await ctx.db.query('memberships').withIndex('by_user_org',q=>q.eq('userId',owner).eq('orgId',orgId)).first();
    await ctx.db.patch(m!._id,{role:'member'});
  });
  await expect(t.mutation(internal.integrations.upsertMetaConnectionInternal,{...args,authorizedUserId:owner,accessToken:'replacement'})).rejects.toThrow();
  expect(await t.run(ctx=>ctx.db.query('metaConnections').first())).toMatchObject({accessToken:'test-only'});
});

test('unknown contact never triggers requests to the other suite apps',async()=>{
  const {t,workspaceId}=await setup();
  const missingId=await t.run(async ctx=>{
    const id=await ctx.db.insert('contacts',{workspaceId,callCount:0});await ctx.db.delete(id);return id;
  });
  vi.stubEnv('CASHFLOW_READ_API_KEY','test-only');vi.stubEnv('FROSTWORK_READ_API_KEY','test-only');
  const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  expect(await t.withIdentity({subject:'owner'}).action(api.crossApp.contactSuiteSummary,{contactId:missingId})).toEqual({cashflow:null,frostwork:null});
  expect(fetchMock).not.toHaveBeenCalled();
});

test('revoked integration role cannot commit a provider response',async()=>{
  const {t,orgId,workspaceId,pageId,owner}=await setup();
  const caller=t.withIdentity({subject:'owner'});
  await caller.query(internal.integrations.getPageForSync,{pageId});
  await caller.query(internal.integrations.getWhatsappConfigInternal,{workspaceId});
  await t.run(async ctx=>{
    const m=await ctx.db.query('memberships').withIndex('by_user_org',q=>q.eq('userId',owner).eq('orgId',orgId)).first();
    await ctx.db.patch(m!._id,{role:'member'});
  });
  await expect(caller.mutation(internal.integrations.upsertFormInternal,{orgId,pageId,formId:'test-form'})).rejects.toThrow();
  await expect(caller.mutation(internal.integrations.upsertWhatsappSession,{workspaceId,sessionId:'replacement',isActive:false})).rejects.toThrow();
  await expect(caller.mutation(internal.integrations.updateWhatsappSession,{workspaceId,isActive:false})).rejects.toThrow();
  expect(await t.run(ctx=>ctx.db.query('metaForms').first())).toBeNull();
  expect(await t.run(ctx=>ctx.db.query('whatsappWebConfig').first())).toMatchObject({sessionId:'test-session',isActive:true});
});

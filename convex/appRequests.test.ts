/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {expect,test,vi,afterEach} from 'vitest';
import schema from './schema';
import {api} from './_generated/api';
const modules=import.meta.glob('./**/*.ts');
afterEach(()=>vi.unstubAllEnvs());
async function setup(){
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const owner=await ctx.db.insert('users',{clerkUserId:'owner'}),member=await ctx.db.insert('users',{clerkUserId:'member'}),admin=await ctx.db.insert('users',{clerkUserId:'admin'});
  await ctx.db.insert('userProfiles',{userId:admin,isSuperAdmin:true,locale:'nl'});
  const orgId=await ctx.db.insert('orgs',{name:'A',slug:'a',ownerId:owner});
  const workspaceId=await ctx.db.insert('workspaces',{orgId,name:'A',isDefault:true});
  for(const [userId,role] of [[owner,'owner'],[member,'member']] as const)await ctx.db.insert('memberships',{userId,orgId,workspaceId,role});
  return {orgId,workspaceId};
 });return {t,...ids};
}
test('owner request is idempotent, visible to members and never grants suite access',async()=>{
 const {t,workspaceId}=await setup();const owner=t.withIdentity({subject:'owner'});
 await owner.mutation(api.appRequests.request,{workspaceId,product:'frostwork'});
 await owner.mutation(api.appRequests.request,{workspaceId,product:'frostwork'});
 expect(await t.run(ctx=>ctx.db.query('appRequests').take(10))).toHaveLength(1);
 expect(await t.withIdentity({subject:'member'}).query(api.appRequests.status,{workspaceId})).toMatchObject({existingSuite:false,canRequest:false,requested:['frostwork'],active:[]});
 expect((await t.withIdentity({subject:'admin'}).query(api.appRequests.list,{paginationOpts:{cursor:null,numItems:20}})).page).toHaveLength(1);
});
test('anonymous, member and unrelated superadmin cannot request; outsiders cannot read company status',async()=>{
 const {t,workspaceId}=await setup();
 for(const actor of [t,t.withIdentity({subject:'member'}),t.withIdentity({subject:'admin'})])await expect(actor.mutation(api.appRequests.request,{workspaceId,product:'cashflow'})).rejects.toThrow();
 for(const actor of [t,t.withIdentity({subject:'admin'})])await expect(actor.query(api.appRequests.status,{workspaceId})).rejects.toThrow();
 await expect(t.withIdentity({subject:'owner'}).query(api.appRequests.list,{paginationOpts:{cursor:null,numItems:20}})).rejects.toThrow();
 expect(await t.run(ctx=>ctx.db.query('appRequests').take(10))).toHaveLength(0);
});
test('existing suite is assigned by company, never by customer name or global role',async()=>{
 const {t,workspaceId,orgId}=await setup();vi.stubEnv('LEGACY_PROVIDER_ORG_ID',orgId);
 expect((await t.withIdentity({subject:'member'}).query(api.appRequests.status,{workspaceId})).existingSuite).toBe(true);
 await t.withIdentity({subject:'owner'}).mutation(api.appRequests.request,{workspaceId,product:'cashflow'});
 expect(await t.run(ctx=>ctx.db.query('appRequests').take(10))).toHaveLength(0);
});


test('only platform admin can review; legacy requests are pending and approval never grants access', async () => {
 const {t,workspaceId,orgId}=await setup();
 const id=await t.run(async ctx=>ctx.db.insert('appRequests',{orgId,product:'cashflow',requestedBy:(await ctx.db.query('users').withIndex('by_clerk_user',q=>q.eq('clerkUserId','owner')).unique())!._id,requestedAt:1}));
 const owner=t.withIdentity({subject:'owner'}), admin=t.withIdentity({subject:'admin'});
 expect((await owner.query(api.appRequests.status,{workspaceId})).requests[0].status).toBe('pending');
 for (const actor of [t,owner,t.withIdentity({subject:'member'})]) await expect(actor.mutation(api.appRequests.review,{requestId:id,status:'approved',note:'Akkoord voor inrichting',expectedRevision:0})).rejects.toThrow();
 await expect(admin.mutation(api.appRequests.review,{requestId:id,status:'approved',note:' ',expectedRevision:0})).rejects.toThrow();
 await admin.mutation(api.appRequests.review,{requestId:id,status:'approved',note:'Akkoord voor inrichting',expectedRevision:0});
 const status=await owner.query(api.appRequests.status,{workspaceId});
 expect(status.requests[0]).toMatchObject({status:'approved',reviewNote:'Akkoord voor inrichting',revision:1});
 expect(status.active).toEqual([]);
 expect(await t.run(ctx=>ctx.db.query('suiteBindings').take(10))).toHaveLength(0);
 await expect(admin.mutation(api.appRequests.review,{requestId:id,status:'rejected',note:'Verouderde beoordeling',expectedRevision:0})).rejects.toThrow();
 expect(await t.run(ctx=>ctx.db.query('appRequestReviews').take(10))).toHaveLength(1);
 await admin.mutation(api.appRequests.review,{requestId:id,status:'rejected',note:'Nieuwe afspraak nodig',expectedRevision:1});
 expect((await owner.query(api.appRequests.status,{workspaceId})).requests[0].status).toBe('rejected');
 expect(await t.run(ctx=>ctx.db.query('appRequestReviews').take(10))).toHaveLength(2);
});

test('company admins cannot request and another company cannot read review notes',async()=>{
 const {t,workspaceId}=await setup();
 const other=await t.run(async ctx=>{
  const user=await ctx.db.insert('users',{clerkUserId:'other'});
  const orgId=await ctx.db.insert('orgs',{name:'B',slug:'b',ownerId:user});
  const ws=await ctx.db.insert('workspaces',{orgId,name:'B',isDefault:true});
  await ctx.db.insert('memberships',{userId:user,orgId,workspaceId:ws,role:'owner'});
  const member=await ctx.db.query('users').withIndex('by_clerk_user',q=>q.eq('clerkUserId','member')).unique();
  const membership=await ctx.db.query('memberships').withIndex('by_user_org',q=>q.eq('userId',member!._id)).first();
  await ctx.db.patch(membership!._id,{role:'admin'});return ws;
 });
 await expect(t.withIdentity({subject:'member'}).mutation(api.appRequests.request,{workspaceId,product:'cashflow'})).rejects.toThrow();
 await t.withIdentity({subject:'owner'}).mutation(api.appRequests.request,{workspaceId,product:'cashflow'});
 await expect(t.withIdentity({subject:'other'}).query(api.appRequests.status,{workspaceId})).rejects.toThrow();
 expect((await t.withIdentity({subject:'other'}).query(api.appRequests.status,{workspaceId:other})).requests).toEqual([]);
});

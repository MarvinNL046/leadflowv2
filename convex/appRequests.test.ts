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
 expect(await t.withIdentity({subject:'member'}).query(api.appRequests.status,{workspaceId})).toEqual({existingSuite:false,canRequest:false,requested:['frostwork'],active:[]});
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

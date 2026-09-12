/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';import {afterEach,expect,test,vi} from 'vitest';import schema from './schema';import {api,internal} from './_generated/api';
const modules=import.meta.glob('./**/*.ts');afterEach(()=>vi.useRealTimers());
const form={name:'Installateur A',contactPhone:'+31600000001',workArea:'Limburg',services:'Airco-installatie'};
function identity(subject:string,email=subject+'@example.invalid',emailVerified=true){return {subject,email,emailVerified};}
async function setup(){const t=convexTest(schema,modules),owner=t.withIdentity(identity('owner')),other=t.withIdentity(identity('other'));const a=await owner.mutation(api.companyOnboarding.create,form),b=await other.mutation(api.companyOnboarding.create,{...form,name:'B'});return {t,owner,other,a,b};}
test('creates an isolated owner and pipeline without platform rights, providers or marketplace access',async()=>{
 const {t,owner,a,b}=await setup();const tenants=await owner.query(api.userProfiles.myTenants,{});expect(tenants).toHaveLength(1);expect(tenants[0]).toMatchObject({role:'owner',workspace:{id:a}});
 const org=await t.run(ctx=>ctx.db.get(tenants[0].org!.id));expect(org).toMatchObject({marketplaceEnabled:false,contactEmail:'owner@example.invalid',workArea:'Limburg'});
 expect((await owner.query(api.userProfiles.me,{}))?.isSuperAdmin).toBe(false);
 const pipeline=await t.run(ctx=>ctx.db.query('pipelines').withIndex('by_workspace',q=>q.eq('workspaceId',a)).unique());expect(await t.run(ctx=>ctx.db.query('pipelineStages').withIndex('by_pipeline_order',q=>q.eq('pipelineId',pipeline!._id)).take(10))).toHaveLength(5);
 expect(await owner.query(api.companyProviders.status,{workspaceId:a})).toMatchObject({assigned:false,email:false,sms:false,whatsapp:false});await expect(t.query(internal.companyProviders.assertWorkspace,{workspaceId:a})).rejects.toThrow();
 await expect(owner.query(api.companyOnboarding.team,{workspaceId:b})).rejects.toThrow();await expect(owner.mutation(api.companyOnboarding.create,form)).rejects.toThrow('al gekoppeld');
});
test.each(['anonymous','unverified','missing-email'])('%s cannot register',async kind=>{const t=convexTest(schema,modules),c=kind==='anonymous'?t:t.withIdentity(kind==='unverified'?identity('u','u@example.invalid',false):{subject:'u',emailVerified:true});await expect(c.mutation(api.companyOnboarding.create,form)).rejects.toThrow();expect(await t.run(ctx=>ctx.db.query('orgs').take(1))).toEqual([]);});
test('invite is email-bound, stored as a hash, single use, and gives only the selected company role',async()=>{
 const {t,owner,a,b}=await setup();const {code}=await owner.mutation(api.companyOnboarding.invite,{workspaceId:a,email:'JOIN@example.invalid',role:'member'});
 expect(JSON.stringify(await t.run(ctx=>ctx.db.query('companyInvites').take(1)))).not.toContain(code);
 const wrong=t.withIdentity(identity('wrong'));await expect(wrong.mutation(api.companyOnboarding.accept,{code})).rejects.toThrow();const join=t.withIdentity(identity('join'));
 expect(await join.mutation(api.companyOnboarding.accept,{code})).toBe(a);await expect(join.mutation(api.companyOnboarding.accept,{code})).rejects.toThrow();expect((await join.query(api.userProfiles.myTenants,{}))[0].role).toBe('member');expect((await join.query(api.userProfiles.me,{}))?.isSuperAdmin).toBe(false);
 const contacts=await t.run(async ctx=>({a:await ctx.db.insert('contacts',{workspaceId:a,firstName:'A',callCount:0}),b:await ctx.db.insert('contacts',{workspaceId:b,firstName:'B',callCount:0})}));
 expect(await join.query(api.contacts.getDetail,{contactId:contacts.a})).toBeTruthy();await expect(join.query(api.contacts.getDetail,{contactId:contacts.b})).rejects.toThrow();await expect(join.query(api.companyOnboarding.team,{workspaceId:a})).rejects.toThrow();
});
test.each(['expired','revoked','replaced','unverified'])('rejects %s invitation',async kind=>{
 const {t,owner,a}=await setup();const {code}=await owner.mutation(api.companyOnboarding.invite,{workspaceId:a,email:'join@example.invalid',role:'member'});const row=await t.run(ctx=>ctx.db.query('companyInvites').first());
 if(kind==='expired')await t.run(ctx=>ctx.db.patch(row!._id,{expiresAt:Date.now()-1}));if(kind==='revoked')await owner.mutation(api.companyOnboarding.revoke,{id:row!._id});if(kind==='replaced')await owner.mutation(api.companyOnboarding.invite,{workspaceId:a,email:'join@example.invalid',role:'member'});
 await expect(t.withIdentity(identity('join','join@example.invalid',kind!=='unverified')).mutation(api.companyOnboarding.accept,{code})).rejects.toThrow();
});
test('admin can invite members but cannot create admins, remove owner or cross-company members',async()=>{
 const {t,owner,other,a,b}=await setup();const admin=t.withIdentity(identity('admin'));const {code}=await owner.mutation(api.companyOnboarding.invite,{workspaceId:a,email:'admin@example.invalid',role:'admin'});await admin.mutation(api.companyOnboarding.accept,{code});
 await admin.mutation(api.companyOnboarding.invite,{workspaceId:a,email:'member@example.invalid',role:'member'});await expect(admin.mutation(api.companyOnboarding.invite,{workspaceId:a,email:'bad@example.invalid',role:'admin'})).rejects.toThrow();
 const team=await owner.query(api.companyOnboarding.team,{workspaceId:a});await expect(admin.mutation(api.companyOnboarding.removeMember,{id:team.members.find(m=>m.role==='owner')!.id})).rejects.toThrow();
 const foreign=(await other.query(api.companyOnboarding.team,{workspaceId:b})).members[0];await expect(admin.mutation(api.companyOnboarding.removeMember,{id:foreign.id})).rejects.toThrow();
});
test('removed inviter invalidates pending codes and removing a member revokes CRM access without deleting contacts',async()=>{
 const {t,owner,a}=await setup();const admin=t.withIdentity(identity('admin'));const first=await owner.mutation(api.companyOnboarding.invite,{workspaceId:a,email:'admin@example.invalid',role:'admin'});await admin.mutation(api.companyOnboarding.accept,{code:first.code});
 const pending=await admin.mutation(api.companyOnboarding.invite,{workspaceId:a,email:'join@example.invalid',role:'member'});const team=await owner.query(api.companyOnboarding.team,{workspaceId:a});const target=team.members.find(m=>m.role==='admin')!;
 const contactId=await t.run(ctx=>ctx.db.insert('contacts',{workspaceId:a,callCount:0}));await owner.mutation(api.companyOnboarding.removeMember,{id:target.id});await expect(admin.query(api.contacts.getDetail,{contactId})).rejects.toThrow();expect(await t.run(ctx=>ctx.db.get(contactId))).toBeTruthy();await expect(t.withIdentity(identity('join')).mutation(api.companyOnboarding.accept,{code:pending.code})).rejects.toThrow('uitnodiger');
});
test('existing company owner cannot join a second company',async()=>{const {owner,other,a}=await setup();const {code}=await owner.mutation(api.companyOnboarding.invite,{workspaceId:a,email:'other@example.invalid',role:'admin'});await expect(other.mutation(api.companyOnboarding.accept,{code})).rejects.toThrow('al gekoppeld');});

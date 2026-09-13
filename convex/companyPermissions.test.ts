/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {expect,test,vi,afterEach} from 'vitest';
import schema from './schema';
import {api,internal} from './_generated/api';
import {imageContentType} from './files';
const modules=import.meta.glob('./**/*.ts');
afterEach(()=>vi.unstubAllGlobals());
async function setup(){
  const t=convexTest(schema,modules);
  const data=await t.run(async ctx=>{
    async function company(label:string){
      const owner=await ctx.db.insert('users',{clerkUserId:label+'-owner'});
      const orgId=await ctx.db.insert('orgs',{name:label,slug:label,ownerId:owner,marketplaceEnabled:true});
      const workspaceId=await ctx.db.insert('workspaces',{orgId,name:label,isDefault:true});
      for(const role of ['owner','admin','member'] as const){
        const userId=role==='owner'?owner:await ctx.db.insert('users',{clerkUserId:label+'-'+role});
        await ctx.db.insert('memberships',{userId,orgId,workspaceId,role});
      }
      const contactId=await ctx.db.insert('contacts',{workspaceId,firstName:label,callCount:0});
      const pipelineId=await ctx.db.insert('pipelines',{workspaceId,name:label,isDefault:true});
      const stageId=await ctx.db.insert('pipelineStages',{pipelineId,name:'Nieuw',order:0,isWonStage:false,isLostStage:false});
      const segmentId=await ctx.db.insert('segments',{workspaceId,name:label,rules:{match:'all',conditions:[]}});
      const broadcastId=await ctx.db.insert('broadcasts',{workspaceId,segmentId,name:label,subject:'Test',body:'Test',status:'draft',stats:{total:0,sent:0,delivered:0,bounced:0,unsubscribed:0,failed:0}});
      await ctx.db.insert('marketplaceWallets',{orgId,balanceCents:10000,updatedAt:1});
      return {orgId,workspaceId,contactId,pipelineId,stageId,segmentId,broadcastId};
    }
    const a=await company('a'),b=await company('b');
    const superUser=await ctx.db.insert('users',{clerkUserId:'platform'});
    await ctx.db.insert('userProfiles',{userId:superUser,locale:'nl',isSuperAdmin:true});
    const leadId=await ctx.db.insert('marketplaceLeads',{niche:'airco',segment:'b2c',status:'published',score:'high',allowExclusive:true,allowShared:true,maxSharedBuyers:3,priceExclusiveCents:5000,priceSharedCents:2000});
    return {a,b,leadId};
  });return {t,...data};
}

test.each(['a-member','b-owner','platform','anonymous'])('%s cannot manage company A',async subject=>{
  const {t,a}=await setup();const caller=subject==='anonymous'?t:t.withIdentity({subject});
  const denied=[
    ()=>caller.mutation(api.crmSettings.update,{workspaceId:a.workspaceId,companyName:'Forbidden'}),
    ()=>caller.mutation(api.aiAgentConfig.update,{workspaceId:a.workspaceId,enabled:true}),
    ()=>caller.mutation(api.pipelines.renamePipeline,{pipelineId:a.pipelineId,name:'Forbidden'}),
    ()=>caller.mutation(api.workflows.createAiFirstResponseWorkflow,{workspaceId:a.workspaceId}),
    ()=>caller.mutation(api.customFields.createDefinition,{workspaceId:a.workspaceId,label:'Forbidden',fieldType:'text'}),
    ()=>caller.mutation(api.emailTemplates.create,{workspaceId:a.workspaceId,name:'Test',subject:'Test',body:'Test'}),
    ()=>caller.mutation(api.emailBacklog.create,{workspaceId:a.workspaceId,title:'Test'}),
    ()=>caller.mutation(api.broadcasts.create,{workspaceId:a.workspaceId,segmentId:a.segmentId,name:'Test',subject:'Test',body:'Test'}),
    ()=>caller.mutation(api.segments.create,{workspaceId:a.workspaceId,name:'Test',rules:{match:'all',conditions:[]}}),
  ];
  for(const action of denied)await expect(action()).rejects.toThrow();
  expect(await t.run(ctx=>ctx.db.query('crmSettings').first())).toBeNull();
  expect(await t.run(ctx=>ctx.db.query('workflows').first())).toBeNull();
});

test.each(['a-owner','a-admin'])('%s can configure its company',async subject=>{
  const {t,a}=await setup();const caller=t.withIdentity({subject});
  await caller.mutation(api.crmSettings.update,{workspaceId:a.workspaceId,companyName:'Own company'});
  expect(await caller.query(api.crmSettings.get,{workspaceId:a.workspaceId})).toMatchObject({companyName:'Own company'});
  await caller.mutation(api.pipelines.renamePipeline,{pipelineId:a.pipelineId,name:'Own pipeline'});
  await caller.mutation(api.customFields.createDefinition,{workspaceId:a.workspaceId,label:'Eigen veld',fieldType:'text'});
  expect(await caller.query(api.marketplace.access.marketplaceAccess,{})).toMatchObject({ok:true,canManage:true,orgId:a.orgId});
});

test('member can do daily CRM work but cannot access company B',async()=>{
  const {t,a,b}=await setup();const caller=t.withIdentity({subject:'a-member'});
  await caller.mutation(api.notes.create,{contactId:a.contactId,body:'Own note'});
  const taskId=await caller.mutation(api.tasks.create,{contactId:a.contactId,title:'Call back'});
  await caller.mutation(api.tasks.setDone,{taskId,done:true});
  await caller.mutation(api.contacts.update,{contactId:a.contactId,firstName:'Own edit'});
  expect(await caller.query(api.contacts.getDetail,{contactId:a.contactId})).toMatchObject({contact:{firstName:'Own edit'}});
  for(const action of [()=>caller.query(api.contacts.getDetail,{contactId:b.contactId}),()=>caller.mutation(api.notes.create,{contactId:b.contactId,body:'No'}),()=>caller.mutation(api.tasks.create,{contactId:b.contactId,title:'No'})])await expect(action()).rejects.toThrow();
  await expect(caller.mutation(api.opportunities.create,{workspaceId:a.workspaceId,contactId:a.contactId,pipelineId:b.pipelineId,stageId:b.stageId,title:'Cross-company'})).rejects.toThrow('Pipeline');
});

test('member cannot spend wallet, change buyer preferences or start provider actions',async()=>{
  const {t,a,leadId}=await setup();const caller=t.withIdentity({subject:'a-member'});
  const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  await expect(caller.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).rejects.toThrow('bedrijfsbeheerder');
  await expect(caller.mutation(api.marketplace.buyerPreferences.updateBuyerPreferences,{niches:['airco']})).rejects.toThrow();
  await expect(caller.action(api.marketplace.stripe.createTopup,{amountCents:5000})).rejects.toThrow();
  await expect(caller.action(api.broadcasts.sendTest,{broadcastId:a.broadcastId,toEmail:'test@example.invalid'})).rejects.toThrow();
  await expect(caller.action(api.broadcasts.sendNow,{broadcastId:a.broadcastId})).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await t.run(ctx=>ctx.db.query('marketplacePurchases').first())).toBeNull();
  expect(await caller.query(api.marketplace.access.marketplaceAccess,{})).toMatchObject({ok:true,canManage:false});
});

test('owner cannot link a campaign to another company segment',async()=>{
  const {t,a,b}=await setup();
  await expect(t.withIdentity({subject:'a-owner'}).mutation(api.broadcasts.create,{workspaceId:a.workspaceId,segmentId:b.segmentId,name:'Test',subject:'Test',body:'Test'})).rejects.toThrow('segment');
});

test('uploads and URL resolution are company-bound; legacy direct uploads are closed',async()=>{
  const {t,a,b}=await setup();const owner=t.withIdentity({subject:'a-owner'});
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]).buffer;
  for(const subject of ['a-member','b-owner','unknown'])await expect(t.withIdentity({subject}).action(api.files.uploadImage,{workspaceId:a.workspaceId,bytes})).rejects.toThrow();
  await expect(owner.mutation(api.files.generateUploadUrl,{})).rejects.toThrow();
  expect(await owner.action(api.files.uploadImage,{workspaceId:a.workspaceId,bytes})).toMatch(/^https?:/);
  const image=await t.run(ctx=>ctx.db.query('companyImages').first());
  expect(image).toMatchObject({orgId:a.orgId,workspaceId:a.workspaceId});
  await expect(t.withIdentity({subject:'b-owner'}).mutation(api.files.resolveStorageUrl,{storageId:image!.storageId})).rejects.toThrow();
  expect(await owner.mutation(api.files.resolveStorageUrl,{storageId:image!.storageId})).toMatch(/^https?:/);
  await expect(owner.action(api.files.uploadImage,{workspaceId:b.workspaceId,bytes})).rejects.toThrow();
});

test('image uploads reject HTML/SVG and oversized content',()=>{
  expect(()=>imageContentType(new TextEncoder().encode('<svg onload="bad()"/>').buffer)).toThrow();
  expect(()=>imageContentType(new ArrayBuffer(5*1024*1024+1))).toThrow();
});

test('a corrupt buyer workspace cannot cross the company boundary',async()=>{
  const {t,a,b}=await setup();
  await t.run(async ctx=>{const rows=await ctx.db.query('memberships').withIndex('by_org',q=>q.eq('orgId',a.orgId)).take(10);for(const row of rows)await ctx.db.patch(row._id,{workspaceId:b.workspaceId});});
  expect(await t.withIdentity({subject:'a-owner'}).query(api.marketplace.access.marketplaceAccess,{})).toEqual({ok:false});
});

test('removing management rights takes effect on the next write and provider check',async()=>{
  const {t,a}=await setup();const caller=t.withIdentity({subject:'a-admin'});
  await caller.mutation(api.crmSettings.update,{workspaceId:a.workspaceId,companyName:'Before'});
  await t.run(async ctx=>{
    const user=await ctx.db.query('users').withIndex('by_clerk_user',q=>q.eq('clerkUserId','a-admin')).unique();
    const m=await ctx.db.query('memberships').withIndex('by_user_org',q=>q.eq('userId',user!._id).eq('orgId',a.orgId)).first();
    await ctx.db.patch(m!._id,{role:'member'});
  });
  await expect(caller.mutation(api.crmSettings.update,{workspaceId:a.workspaceId,companyName:'After'})).rejects.toThrow();
  await expect(caller.query(internal.files.assertUploadAccess,{workspaceId:a.workspaceId})).rejects.toThrow();
  expect(await caller.query(api.crmSettings.get,{workspaceId:a.workspaceId})).toMatchObject({companyName:'Before'});
});

test('task assignment accepts own team, rejects outsiders and supports unassigning',async()=>{
  const {t,a,b}=await setup();
  const caller=t.withIdentity({subject:'a-member'});
  const own=await caller.query(api.tasks.assignees,{workspaceId:a.workspaceId});
  const outsiders=await t.withIdentity({subject:'b-owner'}).query(api.tasks.assignees,{workspaceId:b.workspaceId});
  expect(own).toHaveLength(3);
  const taskId=await caller.mutation(api.tasks.create,{contactId:a.contactId,title:'Assign test',assignedToId:own[0].userId});
  expect((await caller.query(api.tasks.listByContact,{contactId:a.contactId}))[0].assignedToId).toBe(own[0].userId);
  await expect(caller.mutation(api.tasks.assign,{taskId,userId:outsiders[0].userId})).rejects.toThrow();
  await expect(caller.mutation(api.tasks.create,{contactId:a.contactId,title:'Wrong',assignedToId:outsiders[0].userId})).rejects.toThrow();
  await expect(t.withIdentity({subject:'b-owner'}).mutation(api.tasks.assign,{taskId,userId:outsiders[0].userId})).rejects.toThrow();
  await expect(t.withIdentity({subject:'b-owner'}).query(api.tasks.assignees,{workspaceId:a.workspaceId})).rejects.toThrow();
  await caller.mutation(api.tasks.assign,{taskId,userId:null});
  expect((await caller.query(api.tasks.listByContact,{contactId:a.contactId}))[0].assignedToId).toBeUndefined();
});

test('my tasks uses authenticated identity and filters before the result limit',async()=>{
  const {t,a,b}=await setup();
  const caller=t.withIdentity({subject:'a-member'});
  const member=await t.run(ctx=>ctx.db.query('users').filter(q=>q.eq(q.field('clerkUserId'),'a-member')).first());
  await t.run(async ctx=>{
    for(let i=0;i<301;i++) await ctx.db.insert('tasks',{workspaceId:a.workspaceId,title:'Unassigned '+i,status:'open'});
    await ctx.db.insert('tasks',{workspaceId:a.workspaceId,title:'Mine',status:'open',assignedToId:member!._id});
    await ctx.db.insert('tasks',{workspaceId:a.workspaceId,title:'Done',status:'done',assignedToId:member!._id});
  });
  const mine=await caller.query(api.tasks.listOpen,{workspaceId:a.workspaceId,view:'mine'});
  expect(mine.map(task=>task.title)).toEqual(['Mine']);
  const unassigned=await caller.query(api.tasks.listOpen,{workspaceId:a.workspaceId,view:'unassigned'});
  expect(unassigned).toHaveLength(300);
  expect(unassigned.every(task=>task.assignedToId===undefined)).toBe(true);
  expect(await t.withIdentity({subject:'a-owner'}).query(api.tasks.listOpen,{workspaceId:a.workspaceId,view:'mine'})).toHaveLength(0);
  await expect(caller.query(api.tasks.listOpen,{workspaceId:b.workspaceId,view:'mine'})).rejects.toThrow();
});

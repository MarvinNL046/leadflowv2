/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {afterEach,expect,test,vi} from 'vitest';
import {api,internal} from './_generated/api';
import schema from './schema';
const modules=import.meta.glob('./**/*.ts');
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function setup(){
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    async function company(name:string){
      const ownerId=await ctx.db.insert('users',{clerkUserId:name});
      const orgId=await ctx.db.insert('orgs',{name:'Staycool',slug:name,ownerId});
      const workspaceId=await ctx.db.insert('workspaces',{orgId,name,isDefault:true});
      await ctx.db.insert('memberships',{userId:ownerId,orgId,role:'owner'});
      const contactId=await ctx.db.insert('contacts',{workspaceId,email:name+'@example.invalid',phone:'+31612345678',callCount:0});
      const segmentId=await ctx.db.insert('segments',{workspaceId,name,rules:{match:'all',conditions:[]}});
      const broadcastId=await ctx.db.insert('broadcasts',{workspaceId,segmentId,name,subject:'Test',body:'Test',status:'draft',stats:{total:0,sent:0,delivered:0,bounced:0,unsubscribed:0,failed:0}});
      return {orgId,workspaceId,contactId,broadcastId};
    }
    return {a:await company('a'),b:await company('b')};
  });
  vi.stubEnv('LEGACY_PROVIDER_ORG_ID',ids.a.orgId);
  for(const key of ['RESEND_API_KEY','EMAIL_FROM','VOIDFIX_SMS_API_SECRET','VOIDFIX_SMS_DEVICE_ID','VOIDFIX_API_KEY','VOIDFIX_WA_SESSION_ID','CASHFLOW_READ_API_KEY','FROSTWORK_READ_API_KEY'])vi.stubEnv(key,'fixture');
  return {t,...ids};
}
test.each(['email','sms','whatsapp'] as const)('company B cannot use A %s, including scheduled sends',async channel=>{
  const {t,b}=await setup();const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  await expect(t.withIdentity({subject:'b'}).action(api.messaging.send,{contactId:b.contactId,channel,body:'Test'})).rejects.toThrow('niet ingesteld');
  await expect(t.action(internal.messaging.sendInternal,{contactId:b.contactId,channel,body:'Test'})).rejects.toThrow('niet ingesteld');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await t.run(ctx=>ctx.db.query('messages').first())).toBeNull();
});
test('campaigns and WhatsApp setup cannot use another company provider account',async()=>{
  const {t,b}=await setup();const caller=t.withIdentity({subject:'b'});const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  await expect(caller.action(api.broadcasts.sendTest,{broadcastId:b.broadcastId,toEmail:'test@example.invalid'})).rejects.toThrow('niet ingesteld');
  await expect(t.action(internal.broadcasts.runBatch,{broadcastId:b.broadcastId})).rejects.toThrow('niet ingesteld');
  for(const f of [api.integrations.linkWhatsapp,api.integrations.checkWhatsappStatus])await expect(caller.action(f,{workspaceId:b.workspaceId})).rejects.toThrow('niet ingesteld');
  expect(fetchMock).not.toHaveBeenCalled();
});
test('suite requests stay local for an unconfigured company; calendar resolver denies it',async()=>{
  const {t,a,b}=await setup();const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  expect(await t.withIdentity({subject:'b'}).action(api.crossApp.contactSuiteSummary,{contactId:b.contactId})).toEqual({cashflow:null,frostwork:null});
  expect(await t.query(internal.companyProviders.contactEnabled,{contactId:b.contactId})).toBe(false);
  expect(await t.query(internal.companyProviders.contactEnabled,{contactId:a.contactId})).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});
test('assigned company still sends using only its exact workspace WhatsApp session',async()=>{
  const {t,a}=await setup();await t.run(ctx=>ctx.db.insert('whatsappWebConfig',{workspaceId:a.workspaceId,sessionId:'exact-a',phoneNumber:'',isActive:true}));
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify({messageId:'fake-message'}),{status:200}));vi.stubGlobal('fetch',fetchMock);
  expect(await t.withIdentity({subject:'a'}).action(api.messaging.send,{contactId:a.contactId,channel:'whatsapp',body:'Test'})).toMatchObject({status:'sent'});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string,RequestInit])[1].body as string)).toMatchObject({sessionId:'exact-a'});
});
test('inactive workspace session never falls back to deployment session',async()=>{
  const {t,a}=await setup();await t.run(ctx=>ctx.db.insert('whatsappWebConfig',{workspaceId:a.workspaceId,sessionId:'inactive',phoneNumber:'',isActive:false}));
  await expect(t.query(internal.companyProviders.whatsappSession,{workspaceId:a.workspaceId})).rejects.toThrow('niet verbonden');
});
test('status returns no secrets and enforces company membership',async()=>{
  const {t,a,b}=await setup();
  const status=await t.withIdentity({subject:'b'}).query(api.companyProviders.status,{workspaceId:b.workspaceId});
  expect(status).toEqual({assigned:false,email:false,sms:false,whatsapp:false,calendar:false,suite:false});
  expect(JSON.stringify(await t.withIdentity({subject:'a'}).query(api.companyProviders.status,{workspaceId:a.workspaceId}))).not.toContain('fixture');
  await expect(t.withIdentity({subject:'b'}).query(api.companyProviders.status,{workspaceId:a.workspaceId})).rejects.toThrow();
});
test.each(['email','sms'] as const)('assigned company retains %s delivery with mocked provider',async channel=>{
  const {t,a}=await setup();
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify({id:'fake-email',success:true,data:{messages:[{ID:123}]}}),{status:200}));vi.stubGlobal('fetch',fetchMock);
  expect(await t.withIdentity({subject:'a'}).action(api.messaging.send,{contactId:a.contactId,channel,body:'Test'})).toMatchObject({status:'sent'});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('unconfigured calendar does not request a token or create an external event',async()=>{
  const {t,b}=await setup();const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  await t.action(internal.googleCalendar.createAppointmentEvent,{contactId:b.contactId,startMs:Date.now(),name:'Fictief'});
  expect(fetchMock).not.toHaveBeenCalled();
});
test('legacy health monitor ignores sessions of other companies',async()=>{
  const {t,a,b}=await setup();
  for(const [company,sessionId] of [[a,'session-a'],[b,'session-b']] as const)await t.run(ctx=>ctx.db.insert('whatsappWebConfig',{workspaceId:company.workspaceId,sessionId,phoneNumber:'',isActive:true}));
  expect(await t.query(internal.whatsappHealth.alleSessies,{})).toMatchObject([{sessionId:'session-a'}]);
  expect(await t.mutation(internal.whatsappHealth.legStandVastOpSessie,{sessionId:'session-b',isActive:false})).toEqual({bekend:false});
});

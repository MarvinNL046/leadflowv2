/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {afterEach,expect,test,vi} from 'vitest';
import {api,internal} from './_generated/api';
import schema from './schema';
const modules=import.meta.glob('./**/*.ts');
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function setup(){
 vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32));vi.stubEnv('CONVEX_SITE_URL','https://example.convex.site');
 const t=convexTest(schema,modules);const ids=await t.run(async ctx=>{
  async function company(name:string){const userId=await ctx.db.insert('users',{clerkUserId:name});const orgId=await ctx.db.insert('orgs',{ownerId:userId,name,slug:name});const workspaceId=await ctx.db.insert('workspaces',{orgId,name,isDefault:true});const membershipId=await ctx.db.insert('memberships',{orgId,userId,role:'owner'});const m=await ctx.db.insert('users',{clerkUserId:name+'-member'});await ctx.db.insert('memberships',{orgId,userId:m,role:'member'});const contactId=await ctx.db.insert('contacts',{workspaceId,phone:'+31600000001',callCount:0});return {orgId,workspaceId,membershipId,contactId};}return {a:await company('a'),b:await company('b')};
 });
 const input={workspaceId:ids.a.workspaceId,apiKey:'own-a-key',sessionId:'session-a',expectedPhone:'+31600000002'};
 const fetchMock=vi.fn(async(url:unknown,_init?:RequestInit)=>String(url).endsWith('/sessions')?Response.json({success:true,data:[{sessionId:input.sessionId,isConnected:true,status:'WORKING',phoneNumber:input.expectedPhone}]}):Response.json({success:true,data:{messageId:'same-id'}}));vi.stubGlobal('fetch',fetchMock);
 const aCaller=t.withIdentity({subject:'a'});return {t,...ids,input,fetchMock,aCaller};
}
test.each(['anonymous','a-member','b'])('%s cannot bind or read foreign company settings',async subject=>{const {t,a,input,fetchMock}=await setup();const c=subject==='anonymous'?t:t.withIdentity({subject});await expect(c.action(api.companyWhatsapp.activate,input)).rejects.toThrow();await expect(c.query(api.companyWhatsapp.list,{workspaceId:a.workspaceId})).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();});
test.each(['foreign-session','wrong-phone','offline','duplicate','bad-key'])('rejects %s',async scenario=>{
 const {t,aCaller,input,fetchMock}=await setup();const session={sessionId:scenario==='foreign-session'?'other':input.sessionId,phoneNumber:scenario==='wrong-phone'?'+31699999999':input.expectedPhone,isConnected:scenario!=='offline',status:'WORKING'};
 fetchMock.mockResolvedValue(scenario==='bad-key'?new Response('',{status:401}):Response.json({success:true,data:scenario==='duplicate'?[session,session]:[session]}));
 await expect(aCaller.action(api.companyWhatsapp.activate,input)).rejects.toThrow();expect(await t.run(ctx=>ctx.db.query('companyWhatsappConnections').take(1))).toEqual([]);
});
test('encrypted binding, protected setup URL, own send key and session',async()=>{
 const {t,a,aCaller,input,fetchMock}=await setup();const id=await aCaller.action(api.companyWhatsapp.activate,input);
 const row=await t.run(ctx=>ctx.db.get(id));expect(row?.encryptedApiKey).toMatch(/^v1:/);expect(row?.encryptedWebhookSecret).toMatch(/^v1:/);expect(JSON.stringify(await aCaller.query(api.companyWhatsapp.list,{workspaceId:a.workspaceId}))).not.toContain('encrypted');
 await expect(t.withIdentity({subject:'b'}).action(api.companyWhatsapp.setupUrl,{id})).rejects.toThrow();
 const url=await aCaller.action(api.companyWhatsapp.setupUrl,{id});expect(url).toContain('secret=');
 const sent=await aCaller.action(api.messaging.send,{contactId:a.contactId,channel:'whatsapp',body:'test'});
 expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({'X-API-Key':input.apiKey});expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string).sessionId).toBe(input.sessionId);
 expect(await t.run(ctx=>ctx.db.get(sent.messageId))).toMatchObject({whatsappConnectionId:id,externalMessageId:'same-id',status:'sent'});
});
test('revoked rights during provider response block saving',async()=>{const {t,a,aCaller,input,fetchMock}=await setup();const fn=fetchMock.getMockImplementation()!;fetchMock.mockImplementation(async(u,i)=>{await t.run(ctx=>ctx.db.patch(a.membershipId,{role:'member'}));return fn(u,i);});await expect(aCaller.action(api.companyWhatsapp.activate,input)).rejects.toThrow();});
test('sessions cannot be moved to another company or reused from legacy',async()=>{
 const {t,a,aCaller,b,input}=await setup();await aCaller.action(api.companyWhatsapp.activate,input);
 await expect(t.withIdentity({subject:'b'}).action(api.companyWhatsapp.activate,{...input,workspaceId:b.workspaceId})).rejects.toThrow('andere werkruimte');
 const id=await t.run(ctx=>ctx.db.insert('whatsappWebConfig',{workspaceId:a.workspaceId,sessionId:'legacy-session',phoneNumber:'',isActive:true}));expect(id).toBeTruthy();
 vi.stubEnv('VOIDFIX_API_KEY',input.apiKey);await expect(aCaller.action(api.companyWhatsapp.activate,input)).rejects.toThrow('platformaccount');
});
test('webhooks reject wrong secret/session and keep receipts and inbound scoped after pause',async()=>{
 const {t,a,b,aCaller,input,fetchMock}=await setup();const id=await aCaller.action(api.companyWhatsapp.activate,input);const url=new URL(await aCaller.action(api.companyWhatsapp.setupUrl,{id}));
 const sent=await aCaller.action(api.messaging.send,{contactId:a.contactId,channel:'whatsapp',body:'test'});
 const foreign=await t.run(ctx=>ctx.db.insert('messages',{workspaceId:b.workspaceId,channel:'whatsapp',direction:'outbound',status:'sent',to:'+31600000001',body:'test',externalMessageId:'same-id'}));
 async function post(data:unknown,path=url.pathname+url.search){return t.fetch(path,{method:'POST',body:JSON.stringify(data)});}
 expect((await post({sessionId:input.sessionId,event:'message.incoming',from:'+31600000003',body:'test'},url.pathname+'?connectionId='+id+'&secret=wrong')).status).toBe(401);
 await post({sessionId:'wrong',event:'message.incoming',from:'+31600000003',body:'test'});expect(await t.run(ctx=>ctx.db.query('messages').take(10))).toHaveLength(2);
 await post({sessionId:input.sessionId,event:'message.incoming',messageId:'inbound-id',from:'+31600000003',body:'test'});
 await post({sessionId:input.sessionId,event:'message.incoming',messageId:'inbound-id',from:'+31600000003',body:'test'});
 expect(await t.run(ctx=>ctx.db.query('messages').take(10))).toHaveLength(3);expect((await t.run(ctx=>ctx.db.get(id)))?.lastWebhookAt).toBeTypeOf('number');
 await aCaller.mutation(api.companyWhatsapp.disable,{id});vi.stubEnv('LEGACY_PROVIDER_ORG_ID',a.orgId);fetchMock.mockClear();await expect(aCaller.action(api.messaging.send,{contactId:a.contactId,channel:'whatsapp',body:'no'})).rejects.toThrow('gepauzeerd');expect(fetchMock).not.toHaveBeenCalled();
 await post({sessionId:input.sessionId,event:'message.incoming',messageId:'after-pause',from:'+31600000003',body:'no'});expect(await t.run(ctx=>ctx.db.query('messages').take(10))).toHaveLength(3);
 await post({sessionId:input.sessionId,messageId:'same-id',status:'delivered'});expect((await t.run(ctx=>ctx.db.get(sent.messageId)))?.status).toBe('delivered');expect((await t.run(ctx=>ctx.db.get(foreign)))?.status).toBe('sent');
 await expect(t.mutation(internal.messaging.recordInbound,{workspaceId:b.workspaceId,whatsappConnectionId:id,channel:'whatsapp',from:'+31600000003',body:'wrong'})).rejects.toThrow();
});

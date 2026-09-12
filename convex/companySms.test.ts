/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';import {afterEach,expect,test,vi} from 'vitest';import {api,internal} from './_generated/api';import schema from './schema';
const modules=import.meta.glob('./**/*.ts');afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function setup(){
 vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32));vi.stubEnv('CONVEX_SITE_URL','https://example.convex.site');const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{async function c(name:string){const u=await ctx.db.insert('users',{clerkUserId:name});const orgId=await ctx.db.insert('orgs',{ownerId:u,name,slug:name});const workspaceId=await ctx.db.insert('workspaces',{orgId,name,isDefault:true});const membershipId=await ctx.db.insert('memberships',{orgId,userId:u,role:'owner'});const m=await ctx.db.insert('users',{clerkUserId:name+'-member'});await ctx.db.insert('memberships',{orgId,userId:m,role:'member'});const contactId=await ctx.db.insert('contacts',{workspaceId,phone:'+31600000001',callCount:0});return {orgId,workspaceId,membershipId,contactId};}return {a:await c('a'),b:await c('b')};});
 const input={workspaceId:ids.a.workspaceId,apiKey:'own-sms-key',deviceId:'123',expectedDeviceName:'Company phone'};
 const fetchMock=vi.fn(async(url:unknown,_init?:RequestInit)=>String(url).includes('get-devices.php')?Response.json({success:true,data:{devices:[{id:123,name:'Company phone',sims:['SIM 1']}]}}):Response.json({success:true,data:{messages:[{ID:456}]}}));vi.stubGlobal('fetch',fetchMock);return {t,...ids,input,fetchMock,caller:t.withIdentity({subject:'a'})};
}
test.each(['anonymous','a-member','b'])('%s cannot configure company SMS',async sub=>{const {t,a,input,fetchMock}=await setup();const c=sub==='anonymous'?t:t.withIdentity({subject:sub});await expect(c.action(api.companySms.activate,input)).rejects.toThrow();await expect(c.query(api.companySms.list,{workspaceId:a.workspaceId})).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();});
test.each(['foreign','name','sim','duplicate','key'])('rejects invalid %s',async kind=>{const {caller,input,fetchMock,t}=await setup();const d={id:kind==='foreign'?999:123,name:kind==='name'?'wrong':'Company phone',sims:kind==='sim'?[]:['SIM 1']};fetchMock.mockResolvedValue(kind==='key'?new Response('',{status:401}):Response.json({success:true,data:{devices:kind==='duplicate'?[d,d]:[d]}}));await expect(caller.action(api.companySms.activate,input)).rejects.toThrow();expect(await t.run(ctx=>ctx.db.query('companySmsConnections').take(1))).toEqual([]);});
test('own credentials, protected URL and device-bound inbound/receipt/pause',async()=>{
 const {t,a,b,caller,input,fetchMock}=await setup();const id=await caller.action(api.companySms.activate,input);expect((await t.run(ctx=>ctx.db.get(id)))?.encryptedApiKey).toMatch(/^v1:/);
 await expect(t.withIdentity({subject:'b'}).action(api.companySms.setupUrl,{id})).rejects.toThrow();
 const url=new URL(await caller.action(api.companySms.setupUrl,{id}));const sent=await caller.action(api.messaging.send,{contactId:a.contactId,channel:'sms',body:'test'});
 const form=new URLSearchParams(fetchMock.mock.calls[1][1]!.body as string);expect(form.get('key')).toBe(input.apiKey);expect(form.get('devices')).toBe(input.deviceId);
 expect(await t.run(ctx=>ctx.db.get(sent.messageId))).toMatchObject({smsConnectionId:id,externalMessageId:'456'});
 const foreign=await t.run(ctx=>ctx.db.insert('messages',{workspaceId:b.workspaceId,channel:'sms',direction:'outbound',status:'sent',to:'+31600000001',body:'test',externalMessageId:'456'}));
 async function post(deviceID:string,status:string,ID:number=100){return t.fetch(url.pathname+url.search,{method:'POST',body:new URLSearchParams({messages:JSON.stringify([{deviceID,status,ID,number:'+31600000003',message:'reply'}])}).toString()});}
 expect((await t.fetch(url.pathname+'?connectionId='+id+'&secret=wrong',{method:'POST',body:'{}'})).status).toBe(401);
 await post('wrong','Received');expect(await t.run(ctx=>ctx.db.query('messages').take(10))).toHaveLength(2);
 await post('123','Received');await post('123','Received');expect(await t.run(ctx=>ctx.db.query('messages').take(10))).toHaveLength(3);
 await caller.mutation(api.companySms.disable,{id});vi.stubEnv('LEGACY_PROVIDER_ORG_ID',a.orgId);fetchMock.mockClear();await expect(caller.action(api.messaging.send,{contactId:a.contactId,channel:'sms',body:'no'})).rejects.toThrow('gepauzeerd');expect(fetchMock).not.toHaveBeenCalled();
 await post('123','Received',101);expect(await t.run(ctx=>ctx.db.query('messages').take(10))).toHaveLength(3);
 await post('123','Delivered',456);expect((await t.run(ctx=>ctx.db.get(sent.messageId)))?.status).toBe('delivered');expect((await t.run(ctx=>ctx.db.get(foreign)))?.status).toBe('sent');
 expect(await t.query(internal.providerRouting.legacySmsWorkspace,{})).toBeNull();
});
test('rechecks rights and rejects a device already bound to another workspace',async()=>{
 const {t,a,b,caller,input,fetchMock}=await setup();await caller.action(api.companySms.activate,input);await expect(t.withIdentity({subject:'b'}).action(api.companySms.activate,{...input,workspaceId:b.workspaceId})).rejects.toThrow('andere werkruimte');
 const fn=fetchMock.getMockImplementation()!;fetchMock.mockImplementation(async(u,i)=>{await t.run(ctx=>ctx.db.patch(a.membershipId,{role:'member'}));return fn(u,i);});await expect(caller.action(api.companySms.activate,input)).rejects.toThrow();
});

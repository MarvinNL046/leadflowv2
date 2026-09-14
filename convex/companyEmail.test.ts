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
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    async function company(name:string){
      const userId=await ctx.db.insert('users',{clerkUserId:name});
      const orgId=await ctx.db.insert('orgs',{ownerId:userId,name,slug:name});
      const workspaceId=await ctx.db.insert('workspaces',{orgId,name,isDefault:true});
      const membershipId=await ctx.db.insert('memberships',{orgId,userId,role:'owner'});
      const memberId=await ctx.db.insert('users',{clerkUserId:name+'-member'});await ctx.db.insert('memberships',{orgId,userId:memberId,role:'member'});
      const contactId=await ctx.db.insert('contacts',{workspaceId,email:'recipient@real.nl',callCount:0});
      return {orgId,workspaceId,contactId,membershipId};
    }return {a:await company('a'),b:await company('b')};
  });
  const aCaller=t.withIdentity({subject:'a'}),bCaller=t.withIdentity({subject:'b'});
  const aId=await aCaller.mutation(api.companyEmail.prepare,{workspaceId:ids.a.workspaceId}),bId=await bCaller.mutation(api.companyEmail.prepare,{workspaceId:ids.b.workspaceId});
  const input={id:aId,apiKey:'re_company_a',fromEmail:'team@company-a.invalid',fromName:'Company A',domainId:'domain-a',webhookId:'hook-a'};
  const fetchMock=vi.fn(async(url:unknown,_init?:RequestInit)=>{
    if(String(url).includes('/domains/'))return Response.json({name:'company-a.invalid',status:'verified',capabilities:{sending:'enabled'}});
    if(String(url).includes('/webhooks/'))return Response.json({status:'enabled',endpoint:`https://example.convex.site/webhooks/resend-company?connectionId=${aId}`,events:['email.delivered','email.bounced','email.complained','email.opened'],signing_secret:'whsec_'+btoa('company-a-secret')});
    if(String(url).endsWith('/emails/batch'))return Response.json({data:[{id:'sent-id'}]});
    return Response.json({id:'sent-id'});
  });vi.stubGlobal('fetch',fetchMock);
  return {t,...ids,aCaller,bCaller,aId,bId,input,fetchMock};
}
test('activation verifies domain and webhook then stores only encrypted credentials',async()=>{
  const {t,a,aCaller,aId,input,fetchMock}=await setup();
  await aCaller.action(api.companyEmail.activate,input);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const row=await t.run(ctx=>ctx.db.get(aId));expect(row).toMatchObject({status:'active',fromEmail:input.fromEmail});
  expect(row?.encryptedApiKey).toMatch(/^v1:/);expect(row?.encryptedWebhookSecret).toMatch(/^v1:/);
  expect(JSON.stringify(row)).not.toContain(input.apiKey);
  const view=JSON.stringify(await aCaller.query(api.companyEmail.list,{workspaceId:a.workspaceId}));
  expect(view).not.toContain('encrypted');expect(view).not.toContain('secret');expect(view).not.toContain(input.apiKey);
});
test.each(['anonymous','a-member','b'])('%s cannot activate/read company A credentials',async subject=>{
  const {t,a,input,fetchMock}=await setup();const caller=subject==='anonymous'?t:t.withIdentity({subject});
  await expect(caller.action(api.companyEmail.activate,input)).rejects.toThrow();
  await expect(caller.query(api.companyEmail.list,{workspaceId:a.workspaceId})).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
test.each(['unverified','foreign-domain','wrong-webhook','disabled-webhook','missing-events'])('activation rejects %s without storing keys',async scenario=>{
  const {t,aCaller,aId,input,fetchMock}=await setup();
  fetchMock.mockImplementation(async url=>String(url).includes('/domains/')?Response.json({name:scenario==='foreign-domain'?'other.invalid':'company-a.invalid',status:scenario==='unverified'?'pending':'verified'}):Response.json({status:scenario==='disabled-webhook'?'disabled':'enabled',endpoint:scenario==='wrong-webhook'?'https://other.invalid':`https://example.convex.site/webhooks/resend-company?connectionId=${aId}`,events:scenario==='missing-events'?[]:['email.delivered','email.bounced','email.complained','email.opened'],signing_secret:'whsec_'+btoa('company-a-secret')}));
  await expect(aCaller.action(api.companyEmail.activate,input)).rejects.toThrow();
  expect(await t.run(ctx=>ctx.db.get(aId))).toMatchObject({status:'draft'});
  expect((await t.run(ctx=>ctx.db.get(aId)))?.encryptedApiKey).toBeUndefined();
});
test('rights revoked during provider verification prevent committing credentials',async()=>{
  const {t,a,aCaller,aId,input,fetchMock}=await setup();const original=fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async(url,init)=>{await t.run(ctx=>ctx.db.patch(a.membershipId,{role:'member'}));return original(url,init);});
  await expect(aCaller.action(api.companyEmail.activate,input)).rejects.toThrow();expect((await t.run(ctx=>ctx.db.get(aId)))?.status).toBe('draft');
});
test('provider rejects API key without saving credentials',async()=>{
  const {t,aCaller,aId,input,fetchMock}=await setup();fetchMock.mockResolvedValue(new Response('',{status:401}));
  await expect(aCaller.action(api.companyEmail.activate,input)).rejects.toThrow('Resend-controle mislukt');
  expect((await t.run(ctx=>ctx.db.get(aId)))?.encryptedApiKey).toBeUndefined();
});
test('CRM and campaign mail use own key/from and message keeps connection binding',async()=>{
  const {t,a,aCaller,aId,input,fetchMock}=await setup();await aCaller.action(api.companyEmail.activate,input);fetchMock.mockClear();
  const result=await aCaller.action(api.messaging.send,{contactId:a.contactId,channel:'email',body:'Test'});
  expect(await t.run(ctx=>ctx.db.get(result.messageId))).toMatchObject({emailConnectionId:aId,status:'sent'});
  const request=fetchMock.mock.calls[0][1]!;expect(request.headers).toMatchObject({Authorization:'Bearer '+input.apiKey});expect(JSON.parse(request.body as string).from).toBe('Company A <team@company-a.invalid>');
  const broadcastId=await t.run(async ctx=>{const segmentId=await ctx.db.insert('segments',{workspaceId:a.workspaceId,name:'Test',rules:{match:'all',conditions:[]}});return ctx.db.insert('broadcasts',{workspaceId:a.workspaceId,segmentId,name:'Test',subject:'Test',body:'Test',status:'draft',stats:{total:0,sent:0,delivered:0,bounced:0,unsubscribed:0,failed:0}});});
  await aCaller.action(api.broadcasts.sendTest,{broadcastId,toEmail:'test@example.invalid'});
  expect(fetchMock.mock.calls[1][1]!.headers).toMatchObject({Authorization:'Bearer '+input.apiKey});
});
test('pause blocks new mail without falling back to legacy keys; old receipts remain scoped',async()=>{
  const {t,a,b,aCaller,aId,input,fetchMock}=await setup();await aCaller.action(api.companyEmail.activate,input);
  const sent=await aCaller.action(api.messaging.send,{contactId:a.contactId,channel:'email',body:'Test'});
  vi.stubEnv('LEGACY_PROVIDER_ORG_ID',a.orgId);vi.stubEnv('RESEND_API_KEY','legacy-key');
  await aCaller.mutation(api.companyEmail.disable,{id:aId});fetchMock.mockClear();
  await expect(aCaller.action(api.messaging.send,{contactId:a.contactId,channel:'email',body:'Test'})).rejects.toThrow('gepauzeerd');expect(fetchMock).not.toHaveBeenCalled();
  const foreign=await t.run(ctx=>ctx.db.insert('messages',{workspaceId:b.workspaceId,channel:'email',direction:'outbound',status:'sent',to:'x@example.invalid',body:'test',externalMessageId:'sent-id'}));
  expect(await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId:'sent-id',channel:'email',newStatus:'delivered'})).toMatchObject({matched:false});
  await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId:'sent-id',emailConnectionId:aId,channel:'email',newStatus:'delivered'});
  expect((await t.run(ctx=>ctx.db.get(sent.messageId)))?.status).toBe('delivered');expect((await t.run(ctx=>ctx.db.get(foreign)))?.status).toBe('sent');
});
test('campaign batch stamps its connection and delivery updates only its campaign',async()=>{
  const {t,a,aCaller,aId,input,fetchMock}=await setup();await aCaller.action(api.companyEmail.activate,input);fetchMock.mockClear();
  const broadcastId=await t.run(async ctx=>{
    const segmentId=await ctx.db.insert('segments',{workspaceId:a.workspaceId,name:'Test',rules:{match:'all',conditions:[]}});
    const id=await ctx.db.insert('broadcasts',{workspaceId:a.workspaceId,segmentId,name:'Test',subject:'Test',body:'Test',status:'sending',stats:{total:1,sent:0,delivered:0,bounced:0,unsubscribed:0,failed:0}});
    await ctx.db.insert('broadcastRecipients',{workspaceId:a.workspaceId,broadcastId:id,contactId:a.contactId,email:'recipient@real.nl',status:'pending'});return id;
  });
  vi.useFakeTimers();try{
    await t.action(internal.broadcasts.runBatch,{broadcastId});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0][1]!.headers).toMatchObject({Authorization:'Bearer '+input.apiKey});
    const msg=await t.run(ctx=>ctx.db.query('messages').withIndex('by_emailConnection_external',q=>q.eq('emailConnectionId',aId).eq('externalMessageId','sent-id')).unique());
    expect(msg?.relatedEntityId).toBe(broadcastId);
    await t.mutation(internal.messaging.updateStatusByExternalId,{emailConnectionId:aId,externalMessageId:'sent-id',channel:'email',newStatus:'delivered'});
    expect((await t.run(ctx=>ctx.db.get(broadcastId)))?.stats.delivered).toBe(1);
  }finally{vi.useRealTimers();}
});
test('own endpoint verifies connection signature and rejects stale signed payload',async()=>{
  const {t,a,aCaller,aId,bId,input}=await setup();await aCaller.action(api.companyEmail.activate,input);
  await aCaller.action(api.messaging.send,{contactId:a.contactId,channel:'email',body:'Test'});
  const body=JSON.stringify({type:'email.delivered',data:{email_id:'sent-id'}});
  async function headers(timestamp:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('company-a-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`event.${timestamp}.${body}`));return {'svix-id':'event','svix-timestamp':timestamp,'svix-signature':'v1,'+btoa(String.fromCharCode(...new Uint8Array(signature)))};}
  expect((await t.fetch(`/webhooks/resend-company?connectionId=${aId}`,{method:'POST',headers:await headers(String(Math.floor(Date.now()/1000))),body})).status).toBe(200);
  expect((await t.fetch(`/webhooks/resend-company?connectionId=${aId}`,{method:'POST',headers:await headers('1'),body})).status).toBe(401);
  expect((await t.fetch(`/webhooks/resend-company?connectionId=${bId}`,{method:'POST',headers:await headers(String(Math.floor(Date.now()/1000))),body})).status).not.toBe(200);
});

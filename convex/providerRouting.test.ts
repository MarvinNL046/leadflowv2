/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {afterEach,expect,test,vi} from 'vitest';
import schema from './schema';
import {internal} from './_generated/api';
const modules=import.meta.glob('./**/*.ts');
afterEach(()=>vi.unstubAllEnvs());
async function setup(){
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    async function company(name:string){
      const ownerId=await ctx.db.insert('users',{});
      const orgId=await ctx.db.insert('orgs',{name,slug:name,ownerId});
      const workspaceId=await ctx.db.insert('workspaces',{orgId,name,isDefault:true});
      const contactId=await ctx.db.insert('contacts',{workspaceId,email:name+'@example.invalid',callCount:0});
      await ctx.db.insert('whatsappWebConfig',{workspaceId,sessionId:name,phoneNumber:'',isActive:true});
      const segmentId=await ctx.db.insert('segments',{workspaceId,name,rules:{match:'all',conditions:[]}});
      const broadcastId=await ctx.db.insert('broadcasts',{workspaceId,segmentId,name,subject:'test',status:'draft',stats:{total:1,sent:1,delivered:0,bounced:0,unsubscribed:0,failed:0}});
      const messageId=await ctx.db.insert('messages',{workspaceId,contactId,channel:'email',direction:'outbound',status:'sent',to:name+'@example.invalid',body:'test',externalMessageId:'same-id',relatedEntityType:'broadcast',relatedEntityId:broadcastId});
      return {orgId,workspaceId,contactId,broadcastId,messageId};
    }return {a:await company('a'),b:await company('b')};
  });
  vi.stubEnv('LEGACY_PROVIDER_ORG_ID',ids.a.orgId);vi.stubEnv('VOIDFIX_API_SECRET','test-secret');
  return {t,...ids};
}
test.each([undefined,'unknown','b'])('WA webhook skips unmapped session %s without creating contacts/messages',async sessionId=>{
  const {t}=await setup();
  const res=await t.fetch('/webhooks/voidfix-wa',{method:'POST',headers:{'x-webhook-secret':'test-secret'},body:JSON.stringify({event:'message.incoming',sessionId,from:'+31612345678',body:'Test'})});
  expect(await res.json()).toMatchObject({skipped:'unmapped session'});
  expect(await t.run(ctx=>ctx.db.query('messages').take(10))).toHaveLength(2);
  expect(await t.run(ctx=>ctx.db.query('contacts').take(10))).toHaveLength(2);
});
test('mapped WA inbound is scoped and duplicate delivery is idempotent',async()=>{
  const {t,a}=await setup();
  const body=JSON.stringify({event:'message.incoming',data:{sessionId:'a'},from:'+31612345678',body:'Test',messageId:'same-id'});
  for(let i=0;i<2;i++)expect((await t.fetch('/webhooks/voidfix-wa',{method:'POST',headers:{'x-webhook-secret':'test-secret'},body})).status).toBe(200);
  const rows=await t.run(ctx=>ctx.db.query('messages').take(10));
  expect(rows).toHaveLength(3);expect(rows.find(m=>m.channel==='whatsapp')).toMatchObject({workspaceId:a.workspaceId,direction:'inbound'});
});
test('invalid webhook secret cannot create a message even with a known session',async()=>{
  const {t}=await setup();expect((await t.fetch('/webhooks/voidfix-wa',{method:'POST',headers:{'x-webhook-secret':'wrong'},body:JSON.stringify({sessionId:'a',from:'+31612345678'})})).status).toBe(401);
});
test('duplicate session mapping is rejected',async()=>{
  const {t,a}=await setup();await t.run(ctx=>ctx.db.insert('whatsappWebConfig',{workspaceId:a.workspaceId,sessionId:'a',phoneNumber:'',isActive:true}));
  expect(await t.query(internal.providerRouting.whatsappWorkspace,{sessionId:'a'})).toBeNull();
});
test('SMS account mapping refuses multiple workspaces instead of selecting a default',async()=>{
  const {t,a}=await setup();expect(await t.query(internal.providerRouting.legacySmsWorkspace,{})).toBe(a.workspaceId);
  await t.run(ctx=>ctx.db.insert('workspaces',{orgId:a.orgId,name:'second',isDefault:false}));
  expect(await t.query(internal.providerRouting.legacySmsWorkspace,{})).toBeNull();
});
test('receipts are channel/company scoped and campaign counters deduplicate atomically',async()=>{
  const {t,a,b}=await setup();
  for(const newStatus of ['delivered','delivered','read','read','bounced','bounced'] as const)await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId:'same-id',channel:'email',newStatus});
  expect(await t.run(ctx=>ctx.db.get(a.broadcastId))).toMatchObject({stats:{delivered:1,opened:1,bounced:1}});
  expect(await t.run(ctx=>ctx.db.get(a.contactId))).toMatchObject({emailMarketingStatus:'cleaned'});
  expect(await t.run(ctx=>ctx.db.get(b.messageId))).toMatchObject({status:'sent'});
  expect((await t.run(ctx=>ctx.db.get(b.contactId)))?.emailMarketingStatus).toBeUndefined();
  expect(await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId:'same-id',channel:'sms',newStatus:'delivered'})).toMatchObject({matched:false});
});
test('ambiguous same-company receipt and foreign contact/broadcast links are ignored',async()=>{
  const {t,a,b}=await setup();
  await t.run(ctx=>ctx.db.patch(a.messageId,{contactId:b.contactId,relatedEntityId:b.broadcastId}));
  await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId:'same-id',channel:'email',newStatus:'bounced'});
  expect((await t.run(ctx=>ctx.db.get(b.contactId)))?.emailMarketingStatus).toBeUndefined();
  expect(await t.run(ctx=>ctx.db.get(b.broadcastId))).toMatchObject({stats:{bounced:0}});
  await t.run(ctx=>ctx.db.insert('messages',{workspaceId:a.workspaceId,channel:'email',direction:'outbound',status:'sent',to:'x@example.invalid',body:'test',externalMessageId:'same-id'}));
  expect(await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId:'same-id',channel:'email',newStatus:'read'})).toMatchObject({matched:false});
});
test('signed Resend webhook processes only its company and deduplicates counters',async()=>{
  const {t,a,b}=await setup();
  vi.stubEnv('RESEND_WEBHOOK_SECRET','whsec_'+btoa('test-signing-key'));
  const body=JSON.stringify({type:'email.delivered',data:{email_id:'same-id'}});
  const timestamp=String(Math.floor(Date.now()/1000));const eventId='event-test';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-signing-key'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${eventId}.${timestamp}.${body}`));
  const headers={'svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':'v1,'+btoa(String.fromCharCode(...new Uint8Array(signature)))};
  for(let i=0;i<2;i++)expect((await t.fetch('/webhooks/resend',{method:'POST',headers,body})).status).toBe(200);
  expect(await t.run(ctx=>ctx.db.get(a.broadcastId))).toMatchObject({stats:{delivered:1}});
  expect(await t.run(ctx=>ctx.db.get(b.messageId))).toMatchObject({status:'sent'});
  expect((await t.fetch('/webhooks/resend',{method:'POST',headers:{...headers,'svix-signature':'v1,invalid'},body})).status).toBe(401);
});
test('SMS receipt cannot update an email with the same provider ID',async()=>{
  const {t,a}=await setup();
  const res=await t.fetch('/webhooks/voidfix-sms',{method:'POST',headers:{'x-webhook-secret':'test-secret'},body:JSON.stringify({status:'Delivered',messageId:'same-id'})});
  expect(res.status).toBe(200);
  expect(await t.run(ctx=>ctx.db.get(a.messageId))).toMatchObject({status:'sent'});
});
test('WA outbound echo and receipt use mapped workspace without crossing channels',async()=>{
  const {t,a,b}=await setup();
  for(const payload of [{event:'message.outbound',sessionId:'a',to:'+31612345678',body:'test',messageId:'same-id'},{event:'message.status',sessionId:'a',messageId:'same-id',status:'delivered'}]){
    expect((await t.fetch('/webhooks/voidfix-wa',{method:'POST',headers:{'x-webhook-secret':'test-secret'},body:JSON.stringify(payload)})).status).toBe(200);
  }
  const rows=await t.run(ctx=>ctx.db.query('messages').take(10));
  expect(rows.find(m=>m.channel==='whatsapp')).toMatchObject({workspaceId:a.workspaceId,status:'delivered'});
  expect(rows.find(m=>m._id===a.messageId)?.status).toBe('sent');
  expect(rows.find(m=>m._id===b.messageId)?.status).toBe('sent');
});
test('conflicting session identifiers are rejected without guessing',async()=>{
  const {t}=await setup();
  const res=await t.fetch('/webhooks/voidfix-wa',{method:'POST',headers:{'x-webhook-secret':'test-secret'},body:JSON.stringify({event:'message.incoming',sessionId:'a',data:{sessionId:'b'},from:'+31612345678',body:'test'})});
  expect(await res.json()).toMatchObject({skipped:'conflicting session'});
});
test('historical delivery timestamps suppress duplicate campaign delivery counts',async()=>{
  const {t,a}=await setup();await t.run(ctx=>ctx.db.patch(a.messageId,{status:'delivered',deliveredAt:1000}));
  await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId:'same-id',channel:'email',newStatus:'delivered'});
  expect(await t.run(ctx=>ctx.db.get(a.broadcastId))).toMatchObject({stats:{delivered:0}});
});

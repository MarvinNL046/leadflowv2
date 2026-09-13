/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import {convexTest} from 'convex-test';
import {afterEach,expect,test,vi} from 'vitest';
import {api,internal} from './_generated/api';
import schema from './schema';
const modules=import.meta.glob('./**/*.ts');
afterEach(()=>vi.unstubAllEnvs());
async function setup(){
  const t=convexTest(schema,modules);
  await t.run(async ctx=>{for(const [subject,isSuperAdmin] of [['platform',true],['company',false]] as const){const userId=await ctx.db.insert('users',{clerkUserId:subject});await ctx.db.insert('userProfiles',{userId,isSuperAdmin,locale:'nl'});}});
  return {t,admin:t.withIdentity({subject:'platform'})};
}
const opts={onlyOpen:true,paginationOpts:{numItems:25,cursor:null}};
test('signals aggregate without retaining payload or recipient data',async()=>{
  const {t,admin}=await setup();vi.stubEnv('VOIDFIX_API_SECRET','test-secret');
  for(let i=0;i<2;i++)await t.fetch('/webhooks/voidfix-wa',{method:'POST',headers:{'x-webhook-secret':'test-secret'},body:JSON.stringify({event:'message.incoming',sessionId:'private-session',from:'+31612345678',body:'private-body'})});
  const result=await admin.query(api.webhookSignals.list,opts);
  expect(result.page).toHaveLength(1);expect(result.page[0]).toMatchObject({channel:'whatsapp',reason:'unmapped_session',count:2,open:true});
  const stored=JSON.stringify(await t.run(ctx=>ctx.db.query('webhookSignals').take(30)));
  for(const value of ['private-session','31612345678','private-body','test-secret'])expect(stored).not.toContain(value);
});
test.each(['anonymous','company'])('%s cannot read or review platform signals',async subject=>{
  const {t}=await setup();await t.mutation(internal.webhookSignals.record,{channel:'email',reason:'unmatched_receipt'});
  const id=(await t.run(ctx=>ctx.db.query('webhookSignals').first()))!._id;
  const caller=subject==='anonymous'?t:t.withIdentity({subject});
  await expect(caller.query(api.webhookSignals.list,opts)).rejects.toThrow();
  await expect(caller.mutation(api.webhookSignals.review,{id,expectedCount:1,note:'checked'})).rejects.toThrow();
});
test('review records actor and count; next signal reopens without erasing history',async()=>{
  const {t,admin}=await setup();const record=()=>t.mutation(internal.webhookSignals.record,{channel:'sms',reason:'unmapped_account'});
  await record();const signal=(await admin.query(api.webhookSignals.list,opts)).page[0];
  await admin.mutation(api.webhookSignals.review,{id:signal.id,expectedCount:1,note:'Mapping gecontroleerd'});
  expect((await admin.query(api.webhookSignals.list,opts)).page).toHaveLength(0);
  expect(await t.run(ctx=>ctx.db.query('webhookSignalReviews').first())).toMatchObject({count:1,note:'Mapping gecontroleerd'});
  await record();expect((await admin.query(api.webhookSignals.list,opts)).page[0]).toMatchObject({count:2,reviewedCount:1,open:true,lastReviewNote:'Mapping gecontroleerd'});
});
test('new occurrence rejects stale review and blank notes cannot dismiss signals',async()=>{
  const {t,admin}=await setup();for(let i=0;i<2;i++)await t.mutation(internal.webhookSignals.record,{channel:'sms',reason:'unmatched_receipt'});
  const signal=(await admin.query(api.webhookSignals.list,opts)).page[0];
  await expect(admin.mutation(api.webhookSignals.review,{id:signal.id,expectedCount:1,note:'Stale'})).rejects.toThrow('gewijzigd');
  await expect(admin.mutation(api.webhookSignals.review,{id:signal.id,expectedCount:2,note:'  '})).rejects.toThrow('toelichting');
  expect((await admin.query(api.webhookSignals.list,opts)).page[0].open).toBe(true);
});
test('authentication failures do not let outsiders flood the signal log',async()=>{
  const {t,admin}=await setup();vi.stubEnv('VOIDFIX_API_SECRET','test-secret');
  expect((await t.fetch('/webhooks/voidfix-wa',{method:'POST',headers:{'x-webhook-secret':'wrong'},body:'bad'})).status).toBe(401);
  expect((await admin.query(api.webhookSignals.list,opts)).page).toHaveLength(0);
  expect((await t.fetch('/webhooks/voidfix-wa',{method:'POST',headers:{'x-webhook-secret':'test-secret'},body:'bad'})).status).toBe(400);
  expect((await admin.query(api.webhookSignals.list,opts)).page[0]).toMatchObject({reason:'invalid_payload'});
});
test('unmatched receipt is observable without creating customer data',async()=>{
  const {t,admin}=await setup();await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId:'unknown',channel:'email',newStatus:'delivered'});
  expect((await admin.query(api.webhookSignals.list,opts)).page[0]).toMatchObject({channel:'email',reason:'unmatched_receipt'});
  expect(await t.run(ctx=>ctx.db.query('messages').first())).toBeNull();
});

test('recent references are bounded and retain only safe email IDs',async()=>{
  const {t,admin}=await setup();
  const id='47c816f4-8ca5-4eb4-8017-d39e608e7f90';
  for(let n=0;n<7;n++)await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId:id,channel:'email',newStatus:'delivered'});
  const signal=(await admin.query(api.webhookSignals.list,opts)).page[0];
  expect(signal.count).toBe(7);expect(signal.recent).toHaveLength(5);
  expect(new Set(signal.recent.map(r=>r.reference)).size).toBe(5);
  for(const r of signal.recent){expect(r.providerMessageId).toBe(id);expect(r.reference).toMatch(/^[a-f0-9-]{36}$/);}
  expect(await t.run(ctx=>ctx.db.query('messages').first())).toBeNull();
});
test.each([['email','person@example.invalid'],['email','https://example.invalid/?key=secret'],['sms','31612345678'],['whatsapp','true_31612345678@c.us_SECRET'],['whatsapp','47c816f4-8ca5-4eb4-8017-d39e608e7f90']] as const)('drops unsafe or unsupported %s provider ID %s',async(channel,externalMessageId)=>{
  const {t,admin}=await setup();await t.mutation(internal.messaging.updateStatusByExternalId,{externalMessageId,channel,newStatus:'delivered'});
  const recent=(await admin.query(api.webhookSignals.list,opts)).page[0].recent;
  expect(recent).toHaveLength(1);expect(recent[0].providerMessageId).toBeUndefined();
  expect(JSON.stringify(await t.run(ctx=>ctx.db.query('webhookSignals').take(30)))).not.toContain(externalMessageId);
});
test('legacy groups remain readable and get references only on new occurrences',async()=>{
  const {t,admin}=await setup();await t.run(ctx=>ctx.db.insert('webhookSignals',{channel:'sms',reason:'invalid_payload',count:4,firstSeenAt:1,lastSeenAt:2,open:true}));
  expect((await admin.query(api.webhookSignals.list,opts)).page[0].recent).toEqual([]);
  await t.mutation(internal.webhookSignals.record,{channel:'sms',reason:'invalid_payload'});
  const row=(await admin.query(api.webhookSignals.list,opts)).page[0];expect(row.count).toBe(5);expect(row.recent).toHaveLength(1);expect(row.firstSeenAt).toBe(1);
});

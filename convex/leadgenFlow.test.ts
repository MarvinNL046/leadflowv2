/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { hashApiKey } from './marketplace/apiKeys';
import { importHistory } from './marketplace/admin';

const modules = import.meta.glob('./**/*.ts');
const rawKey = 'lmk_local_test_only_12345678901234567890';
const payload = { firstName: 'Test', lastName: 'Aanvraag', phone: '+31612345678', email: 'test@example.com', postalCode: '6222XD', nicheData: { amount_rooms: 2 } };
const fetchMock = vi.fn();
test.each([null,[],{v1CreatedAt:'2026-05-23T07:33:31.138Z'},
  {v1Import:true,v1CreatedAt:'invalid'},{v1Import:true,v1CreatedAt:'2026-02-30T00:00:00.000Z'},
  {v1Import:true,v1CreatedAt:'2027-01-01T00:00:00.000Z'}])('invalid or unmarked import date stays unknown: %j', metadata=>{
  expect(importHistory(metadata,Date.parse('2026-09-12T00:00:00Z')).originalRequestedAt).toBeNull();
});

test('admin sees original import evidence without changing sale or verification status',async()=>{
  const {t,admin,buyer,keyId}=await setup();
  const {leadId}=await t.mutation(internal.marketplace.intake.insertLead,{...payload,apiKeyId:keyId});
  await t.run(ctx=>ctx.db.patch(leadId,{metadata:{v1Import:true,v1CreatedAt:'2026-05-23T07:33:31.138Z',v1Status:'pending_review',v1EmailVerifiedAt:'2026-05-23T07:33:30.883Z'}}));
  const before=await t.run(ctx=>ctx.db.get(leadId));
  const result=await admin.query(api.marketplace.admin.listLeads,{paginationOpts:{cursor:null,numItems:25}});
  expect(result.page[0]).toMatchObject({imported:true,originalRequestedAt:Date.parse('2026-05-23T07:33:31.138Z'),importedPendingReview:true,serviceType:null,emailVerified:false,status:'published'});
  expect(await t.run(ctx=>ctx.db.get(leadId))).toEqual(before);
  await expect(buyer.query(api.marketplace.admin.listLeads,{paginationOpts:{cursor:null,numItems:25}})).rejects.toThrow();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('EMAIL_FROM', 'test@example.com');
  vi.stubEnv('SUPER_ADMIN_EMAILS', 'admin@example.com');
  vi.stubEnv('SITE_URL', 'https://leadflow.wetry.app');
  vi.stubEnv('VOIDFIX_SMS_API_SECRET', 'test-only');
  vi.stubEnv('VOIDFIX_SMS_DEVICE_ID', 'test-device');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async () => Response.json({ success: true, id: 'mock-mail' }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function setup(source = 'home:vindaircomonteur.nl', serviceType?: 'install' | 'maintain' | 'repair') {
  const t = convexTest(schema, modules);
  const keyHash = await hashApiKey(rawKey);
  const ids = await t.run(async ctx => {
    const keyId = await ctx.db.insert('marketplaceApiKeys', { keyHash, keyPrefix: rawKey.slice(0,12), name: 'vindaircomonteur.nl', defaultNiche: 'airco', allowedNiches: ['airco'], isActive: true, trusted: true });
    const userId = await ctx.db.insert('users', { clerkUserId: 'admin-test' });
    await ctx.db.insert('userProfiles', { userId, locale: 'nl', isSuperAdmin: true });
    const buyerId = await ctx.db.insert('users', { clerkUserId: 'buyer-test' });
    await ctx.db.insert('userProfiles', { userId: buyerId, locale: 'nl', isSuperAdmin: false });
    return { keyId };
  });
  const headers = { Authorization: `Bearer ${rawKey}`, 'Content-Type': 'application/json' };
  const start = async () => {
    const response = await t.fetch('/api/intake/wizard/start', { method: 'POST', headers,
      body: JSON.stringify({ niche: 'airco', payload: {...payload,...(source.startsWith('page:') ? {serviceType:'install'} : serviceType ? {serviceType} : {})}, metadata: { source } }) });
    expect(response.status).toBe(200);
    return (await response.json()).token as string;
  };
  const verify = (token: string, code: string) => t.fetch('/api/intake/wizard/verify', { method: 'POST', headers, body: JSON.stringify({ token, code }) });
  return { t, ...ids, headers, start, verify, admin: t.withIdentity({ subject: 'admin-test' }), buyer: t.withIdentity({ subject: 'buyer-test' }) };
}

test.each(['install','maintain','repair'] as const)('homepage %s survives verification and only installation alerts Staycool',async serviceType=>{
  const {t,admin,headers,start,verify}=await setup('home:vindaircomonteur.nl',serviceType);
  const orgId=await t.run(async ctx=>{
    const userId=await ctx.db.insert('users',{clerkUserId:'staycool-home-test',email:'buyer@example.invalid'});
    return ctx.db.insert('orgs',{name:'Staycool Airconditioning',slug:'staycool-home-test',ownerId:userId});
  });
  await t.mutation(internal.marketplace.adminCli.configureStaycoolPilot,{orgId});
  const token=await start();
  await t.fetch('/api/intake/wizard/send-code?v='+token,{headers});
  const smsCall=fetchMock.mock.calls.find(([url])=>String(url).includes('voidfix'))!;
  const code=new URLSearchParams(smsCall[1].body).get('message')!.match(/\d{6}/)![0];
  expect(await (await verify(token,code)).json()).toMatchObject({success:true});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const result=await admin.query(api.marketplace.admin.listLeads,{paginationOpts:{cursor:null,numItems:25}});
  expect(result.page).toHaveLength(1);
  expect(result.page[0]).toMatchObject({serviceType,source:'home:vindaircomonteur.nl',phoneVerified:true});
  const mails=await t.run(ctx=>ctx.db.query('marketplaceBuyerNotifications').take(10));
  expect(mails).toHaveLength(serviceType==='install'?1:0);
  if(serviceType==='install') expect(mails[0]).toMatchObject({orgId,state:'sent',recipient:'buyer@example.invalid'});
});

test.each(['home:vindaircomonteur.nl', 'page:vindaircomonteur.nl/installatie/airco-laten-plaatsen-stappen'])('HTTP start → dispatch → verify → admin overview preserves %s, without duplicate on retry', async source => {
  const { t, admin, headers, start, verify, keyId } = await setup(source);
  const token = await start();
  const sent = await t.fetch('/api/intake/wizard/send-code?v=' + token, { headers });
  expect(await sent.json()).toMatchObject({ sent: true, smsSent: true, emailSent: true });
  // Codes come from intercepted provider requests, not a production debug flag.
  const smsCall = fetchMock.mock.calls.find(([url]) => String(url).includes('voidfix'))!;
  const sms = new URLSearchParams(smsCall[1].body).get('message')!;
  const code = sms.match(/\d{6}/)![0];
  expect(await (await verify(token, '000000')).json()).toMatchObject({ error: 'invalid_code', attemptsLeft: 4 });
  const first = await (await verify(token, code)).json();
  expect(first).toMatchObject({ success: true, duplicate: false });
  for (let retry = 0; retry < 6; retry++) {
    expect(await (await verify(token, code)).json()).toMatchObject({ success: true, leadId: first.leadId });
  }
  expect(await t.run(ctx => ctx.db.query('marketplaceLeads').collect())).toHaveLength(1);
  expect((await t.run(ctx=>ctx.db.get('marketplaceLeads', first.leadId)))?.serviceType).toBe(source.startsWith('page:') ? 'install' : undefined);
  const overview = await admin.query(api.marketplace.admin.listLeads, { paginationOpts: { cursor: null, numItems: 25 }, sourceId: keyId });
  expect(overview.page).toHaveLength(1);
  expect(overview.page[0]).toMatchObject({ source, phoneVerified: true, followUpStatus: 'new', notificationStatus: 'pending' });
  await admin.mutation(api.marketplace.admin.setFollowUpStatus, { leadId: overview.page[0].id, status: 'contacted' });
  expect((await admin.query(api.marketplace.admin.listLeads, { paginationOpts: { cursor: null, numItems: 25 } })).page[0].followUpStatus).toBe('contacted');
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.run(ctx => ctx.db.get(overview.page[0].id)))?.notificationStatus).toBe('sent');
  const mailBodies = fetchMock.mock.calls.filter(([url]) => String(url).includes('resend')).map(([, init]) => JSON.parse(init.body));
  expect(mailBodies.some(body => body.text.includes('https://leadflow.wetry.app/crm/leadgen'))).toBe(true);
  const homepageCount = source.startsWith('home:') ? 1 : 0;
  expect(await admin.query(api.marketplace.metrics.homepageFunnel, {sourceId:keyId})).toMatchObject({submitted:homepageCount,verified:homepageCount});
});

test('homepage events only accept the two anonymous counters and metrics require admin', async () => {
  const {t,admin,buyer,headers,keyId} = await setup();
  for(const event of ['views','starts']) {
    expect((await t.fetch('/api/intake/events',{method:'POST',headers,body:JSON.stringify({event})})).status).toBe(200);
  }
  expect((await t.fetch('/api/intake/events',{method:'POST',headers,body:JSON.stringify({event:'verified'})})).status).toBe(400);
  expect((await t.fetch('/api/intake/events',{method:'POST',body:JSON.stringify({event:'views'})})).status).toBe(401);
  expect(await admin.query(api.marketplace.metrics.homepageFunnel,{sourceId:keyId})).toMatchObject({views:1,starts:1,submitted:0,verified:0});
  await expect(buyer.query(api.marketplace.metrics.homepageFunnel,{sourceId:keyId})).rejects.toThrow();
  await expect(t.query(api.marketplace.metrics.homepageFunnel,{sourceId:keyId})).rejects.toThrow();
});

test('test cleanup refuses real leads and keeps test history out of the feed', async () => {
  const {t,keyId} = await setup();
  const real = await t.mutation(internal.marketplace.intake.insertLead,{...payload,apiKeyId:keyId});
  await expect(t.mutation(internal.marketplace.adminCli.archiveTestLead,{leadId:real.leadId})).rejects.toThrow('not_a_test_lead');
  const fake = await t.mutation(internal.marketplace.intake.insertLead,{...payload,lastName:'TESTAANVRAAG',apiKeyId:keyId});
  await t.mutation(internal.marketplace.adminCli.archiveTestLead,{leadId:fake.leadId});
  expect(await t.run(ctx=>ctx.db.get(fake.leadId))).toMatchObject({status:'rejected',followUpStatus:'done'});
});

test('email-only delivery enforces cooldown and accepts the email code', async () => {
  const { t, headers, start, verify } = await setup();
  fetchMock.mockImplementation(async url => String(url).includes('voidfix') ? Response.json({ success: false }, { status: 502 }) : Response.json({ id: 'mock-mail' }));
  const token = await start();
  expect(await (await t.fetch('/api/intake/wizard/send-code?v=' + token, { headers })).json()).toMatchObject({ smsSent: false, emailSent: true });
  const calls = fetchMock.mock.calls.length;
  expect(await (await t.fetch('/api/intake/wizard/send-code?v=' + token, { headers })).json()).toMatchObject({ cooldownActive: true, sent: false });
  expect(fetchMock).toHaveBeenCalledTimes(calls);
  const email = JSON.parse(fetchMock.mock.calls.find(([url]) => String(url).includes('resend'))![1].body);
  const code = email.subject.match(/\d{6}/)[0];
  expect(await (await verify(token, code)).json()).toMatchObject({ success: true, matchedChannel: 'email' });
  const lead = (await t.run(ctx => ctx.db.query('marketplaceLeads').collect()))[0];
  expect(lead.emailVerifiedAt).toBeDefined();
  expect(lead.phoneVerifiedAt).toBeUndefined();
});

test('failed insertion rolls back the verification and can be retried', async () => {
  const { t, start, keyId } = await setup();
  const token = await start();
  const row = await t.query(internal.marketplace.wizard.getByToken, { token });
  await t.run(ctx => ctx.db.patch(keyId, { isActive: false }));
  await expect(t.mutation(internal.marketplace.wizard.verifyAndPromote, { token, apiKeyId: keyId, codeHash: row!.codeHash })).rejects.toThrow('api_key_inactive');
  const after = await t.query(internal.marketplace.wizard.getByToken, { token });
  expect(after?.verifiedAt).toBeUndefined();
  expect(after?.attempts).toBe(0);
  expect(await t.run(ctx => ctx.db.query('marketplaceLeads').collect())).toHaveLength(0);
  await t.run(ctx => ctx.db.patch(keyId, { isActive: true }));
  expect(await t.mutation(internal.marketplace.wizard.verifyAndPromote, { token, apiKeyId: keyId, codeHash: row!.codeHash })).toMatchObject({ outcome: 'success' });
});

test('admin data and mutations deny anonymous users and marketplace buyers', async () => {
  const { t, admin, buyer, keyId } = await setup();
  const inserted = await t.mutation(internal.marketplace.intake.insertLead, { apiKeyId: keyId, niche: 'airco', ...payload });
  for (const client of [t, buyer]) {
    await expect(client.query(api.marketplace.admin.listSources, {})).rejects.toThrow();
    await expect(client.query(api.marketplace.admin.listLeads, { paginationOpts: { cursor: null, numItems: 25 } })).rejects.toThrow();
    await expect(client.mutation(api.marketplace.admin.setFollowUpStatus, { leadId: inserted.leadId, status: 'done' })).rejects.toThrow();
  }
  const sources = await admin.query(api.marketplace.admin.listSources, {});
  expect(sources[0]).toMatchObject({ id: keyId, name: 'vindaircomonteur.nl' });
  expect(sources[0]).not.toHaveProperty('keyHash');
  expect(sources[0]).not.toHaveProperty('keyPrefix');
});

test('source filter and pagination keep sources separate', async () => {
  const { t, admin, keyId } = await setup();
  const otherKey = await t.run(ctx => ctx.db.insert('marketplaceApiKeys', { keyHash: 'other', keyPrefix: 'other', name: 'other.nl', defaultNiche: 'airco', allowedNiches: ['airco'], isActive: true }));
  for (const apiKeyId of [keyId, keyId, otherKey]) await t.mutation(internal.marketplace.intake.insertLead, { ...payload, apiKeyId });
  const first = await admin.query(api.marketplace.admin.listLeads, { sourceId: keyId, paginationOpts: { cursor: null, numItems: 1 } });
  const second = await admin.query(api.marketplace.admin.listLeads, { sourceId: keyId, paginationOpts: { cursor: first.continueCursor, numItems: 1 } });
  expect(first.page).toHaveLength(1); expect(second.page).toHaveLength(1);
  expect(first.page[0].id).not.toBe(second.page[0].id);
  expect(first.page[0].source).toBe('vindaircomonteur.nl');
  expect(second.page[0].source).toBe('vindaircomonteur.nl');
});

test.each(['missing-config', 'provider-error', 'network-error'])('notification failure is recorded: %s', async reason => {
  const { t, keyId } = await setup();
  if (reason === 'missing-config') vi.stubEnv('RESEND_API_KEY', '');
  if (reason === 'provider-error') fetchMock.mockResolvedValue(Response.json({ error: 'unavailable' }, { status: 503 }));
  if (reason === 'network-error') fetchMock.mockRejectedValue(new Error('offline'));
  const inserted = await t.mutation(internal.marketplace.intake.insertLead, { ...payload, apiKeyId: keyId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.run(ctx => ctx.db.get(inserted.leadId)))?.notificationStatus).toBe('failed');
});

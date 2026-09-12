/// <reference types="vite/client" />
// @vitest-environment edge-runtime
// Regression coverage for the buyer audit of 12 September 2026.
import { convexTest } from 'convex-test';
import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import Stripe from 'stripe';
import schema from './schema';
import { api, internal } from './_generated/api';
const modules = import.meta.glob('./**/*.ts');
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External requests forbidden during audit'); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function setup(balance = 10000) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert('users', { clerkUserId: 'buyer-audit' });
    const orgId = await ctx.db.insert('orgs', { name: 'Audit only', slug: 'audit', ownerId: userId, marketplaceEnabled: true });
    const workspaceId = await ctx.db.insert('workspaces', { orgId, name: 'Audit', isDefault: true });
    await ctx.db.insert('memberships', { orgId, userId, workspaceId, role: 'owner' });
    await ctx.db.insert('marketplaceWallets', { orgId, balanceCents: balance, updatedAt: Date.now() });
    const prefsId = await ctx.db.insert('marketplaceBuyerPreferences', { orgId, niches: ['airco'], preferredMode: 'both', notifyOnNewLead: true, notifyChannel: 'email', updatedAt: Date.now() });
    const pipelineId = await ctx.db.insert('pipelines', { workspaceId, name: 'Audit', isDefault: true });
    await ctx.db.insert('pipelineStages', { pipelineId, name: 'Nieuw', order: 0, isWonStage: false, isLostStage: false });
    const apiKeyId = await ctx.db.insert('marketplaceApiKeys', { keyHash: 'audit-only', keyPrefix: 'audit', name: 'audit.invalid', defaultNiche: 'airco', allowedNiches: ['airco'], trusted: true, isActive: true });
    return { orgId, userId, workspaceId, prefsId, apiKeyId };
  });
  const { leadId } = await t.mutation(internal.marketplace.intake.insertLead, {
    apiKeyId: ids.apiKeyId, firstName: 'Synthetic', lastName: 'Audit', phone: '+31612345678', email: 'audit@example.invalid', postalCode: '6222XD',
    serviceType: 'install', message: 'Drie slaapkamers met 8 meter leidingwerk.', metadata: { source: 'page:audit.invalid/installatie', serviceType: 'Airco-installatie' },
  });
  return { t, ...ids, leadId, buyer: t.withIdentity({ subject: 'buyer-audit' }) };
}

test.each(['shared', 'exclusive'] as const)('PASS: %s purchase debits stored price and creates CRM contact and opportunity', async mode => {
  const {t,buyer,leadId} = await setup();
  const lead = await t.run(ctx => ctx.db.get(leadId));
  const result = await buyer.mutation(api.marketplace.purchase.purchaseLead, { leadId, mode });
  expect(result.success).toBe(true);
  const price = mode === 'shared' ? lead!.priceSharedCents : lead!.priceExclusiveCents;
  expect((await buyer.query(api.marketplace.wallet.getWallet, {})).wallet.balanceCents).toBe(10000-price);
  expect(await t.run(ctx => ctx.db.query('contacts').collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query('opportunities').collect())).toHaveLength(1);
  expect((await buyer.mutation(api.marketplace.purchase.purchaseLead, { leadId, mode })).success).toBe(false);
  expect(await t.run(ctx => ctx.db.query('marketplaceWalletTransactions').collect())).toHaveLength(1);
});

test('PASS: insufficient funds creates no purchase or CRM contact', async () => {
  const {t,buyer,leadId} = await setup(0);
  expect(await buyer.mutation(api.marketplace.purchase.purchaseLead, {leadId,mode:'shared'})).toMatchObject({success:false,error:'insufficient_credits'});
  expect(await t.run(ctx => ctx.db.query('marketplacePurchases').collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query('contacts').collect())).toHaveLength(0);
});

test('PASS: duplicate Stripe session credits wallet once', async () => {
  const {t,orgId,buyer} = await setup(0);
  const args = {orgId,amountCents:5000,sessionId:'cs_audit_only'};
  expect(await t.mutation(internal.marketplace.wallet.creditTopupIdempotent,args)).toMatchObject({alreadyProcessed:false});
  expect(await t.mutation(internal.marketplace.wallet.creditTopupIdempotent,args)).toMatchObject({alreadyProcessed:true});
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(5000);
});

test('PASS: anonymous purchase denied', async () => {
  const {t,leadId} = await setup();
  await expect(t.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).rejects.toThrow('Not authenticated');
});

test('expired lead is absent from feed/detail and cannot be purchased', async () => {
  const {t,buyer,leadId} = await setup();
  await t.run(ctx=>ctx.db.patch(leadId,{expiresAt:Date.now()-1000}));
  expect(await buyer.query(api.marketplace.feed.getBuyerFeed,{})).toHaveLength(0);
  expect(await buyer.query(api.marketplace.feed.getMaskedLeadDetail,{leadId})).toBeNull();
  expect((await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).success).toBe(false);
});

test('purchase enforces niche gate used by feed and detail', async () => {
  const {t,buyer,leadId,prefsId} = await setup();
  await t.run(ctx=>ctx.db.patch(prefsId,{niches:['loodgieter']}));
  expect(await buyer.query(api.marketplace.feed.getBuyerFeed,{})).toHaveLength(0);
  expect((await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).success).toBe(false);
});

test('explicit installation service type is stored', async () => {
  const {t,leadId} = await setup();
  expect((await t.run(ctx=>ctx.db.get(leadId)))?.serviceType).toBe('install');
});

test('CRM handoff retains job description and original page source', async () => {
  const {t,buyer,leadId} = await setup();
  await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'});
  const notes = await t.run(ctx=>ctx.db.query('notes').collect());
  expect(notes.map(n=>n.body).join('\n')).toContain('Drie slaapkamers met 8 meter leidingwerk.');
  expect(notes[0].body).toContain('page:audit.invalid/installatie');
  const attribution = await t.run(ctx=>ctx.db.query('leadAttribution').first());
  expect(attribution?.rawPayload).toMatchObject({originalSource:'page:audit.invalid/installatie',serviceType:'install'});
});

test('signed but unpaid Checkout event does not credit wallet', async () => {
  const {t,buyer,orgId,userId} = await setup(0);
  const secret = 'whsec_audit_local_only';
  vi.stubEnv('STRIPE_SECRET_KEY','sk_test_audit_local_only');
  vi.stubEnv('STRIPE_MARKETPLACE_WEBHOOK_SECRET',secret);
  const body = JSON.stringify({ id:'evt_audit',object:'event',type:'checkout.session.completed',data:{object:{id:'cs_audit_unpaid',object:'checkout.session',amount_total:5000,currency:'eur',payment_status:'unpaid',metadata:{kind:'marketplace_topup',marketplaceOrgId:orgId,marketplaceUserId:userId}}}});
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({payload:body,secret});
  expect((await t.fetch('/webhooks/marketplace-stripe',{method:'POST',headers:{'stripe-signature':signature},body})).status).toBe(200);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(0);
});

async function signedEvent(t: Awaited<ReturnType<typeof setup>>['t'], orgId: string, overrides: Record<string,unknown> = {}, type = 'checkout.session.completed') {
  const secret = 'whsec_audit_local_only';
  vi.stubEnv('STRIPE_SECRET_KEY','sk_test_audit_local_only');
  vi.stubEnv('STRIPE_MARKETPLACE_WEBHOOK_SECRET',secret);
  const body = JSON.stringify({id:'evt_test',object:'event',type,data:{object:{id:'cs_paid',object:'checkout.session',mode:'payment',status:'complete',amount_total:5000,currency:'eur',payment_status:'paid',metadata:{kind:'marketplace_topup',marketplaceOrgId:orgId},...overrides}}});
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({payload:body,secret});
  return t.fetch('/webhooks/marketplace-stripe',{method:'POST',headers:{'stripe-signature':signature},body});
}

test('paid Checkout followed by duplicate and async success credits once', async () => {
  const {t,buyer,orgId} = await setup(0);
  for (const type of ['checkout.session.completed','checkout.session.completed','checkout.session.async_payment_succeeded']) {
    expect((await signedEvent(t,orgId,{},type)).status).toBe(200);
  }
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(5000);
});

test('delayed payment credits only after async success', async () => {
  const {t,buyer,orgId} = await setup(0);
  expect((await signedEvent(t,orgId,{payment_status:'unpaid'})).status).toBe(200);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(0);
  expect((await signedEvent(t,orgId,{},'checkout.session.async_payment_succeeded')).status).toBe(200);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(5000);
});

test.each([{currency:'usd'},{amount_total:-5000},{amount_total:5000.5},{amount_total:500001},{amount_total:999},{mode:'subscription'},{status:'open'},{id:''}])('invalid paid session rejected: %j', async overrides => {
  const {t,buyer,orgId} = await setup(0);
  expect((await signedEvent(t,orgId,overrides)).status).toBe(400);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(0);
});

test('invalid signature cannot credit wallet', async () => {
  const {t,buyer,orgId} = await setup(0);
  await signedEvent(t,orgId,{payment_status:'unpaid'});
  expect((await t.fetch('/webhooks/marketplace-stripe',{method:'POST',headers:{'stripe-signature':'invalid'},body:'{}'})).status).toBe(400);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(0);
});

test.each(['repair',undefined])('specific service preference excludes %s from feed, detail and purchase', async serviceType => {
  const {t,buyer,leadId,prefsId} = await setup();
  await t.run(async ctx=>{
    await ctx.db.patch(prefsId,{serviceTypes:['install']});
    await ctx.db.patch(leadId,{serviceType:serviceType as 'repair' | undefined});
  });
  expect(await buyer.query(api.marketplace.feed.getBuyerFeed,{})).toHaveLength(0);
  expect(await buyer.query(api.marketplace.feed.getMaskedLeadDetail,{leadId})).toBeNull();
  expect((await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).success).toBe(false);
});

test.each(['pending_review','rejected','expired','duplicate'] as const)('%s lead cannot be opened or purchased', async status=>{
  const {t,buyer,leadId} = await setup();
  await t.run(ctx=>ctx.db.patch(leadId,{status}));
  expect(await buyer.query(api.marketplace.feed.getMaskedLeadDetail,{leadId})).toBeNull();
  expect((await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'})).success).toBe(false);
});

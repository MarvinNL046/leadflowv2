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
  vi.stubEnv('STRIPE_MARKETPLACE_MODE','test');
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
  const body = JSON.stringify({ id:'evt_audit',object:'event',livemode:false,type:'checkout.session.completed',data:{object:{id:'cs_audit_unpaid',object:'checkout.session',livemode:false,amount_total:5000,currency:'eur',payment_status:'unpaid',metadata:{kind:'marketplace_topup',marketplaceOrgId:orgId,marketplaceUserId:userId}}}});
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({payload:body,secret});
  expect((await t.fetch('/webhooks/marketplace-stripe',{method:'POST',headers:{'stripe-signature':signature},body})).status).toBe(200);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(0);
});

async function signedEvent(t: Awaited<ReturnType<typeof setup>>['t'], orgId: string, overrides: Record<string,unknown> = {}, type = 'checkout.session.completed', eventLiveMode = false, keyMode = 'test') {
  const secret = 'whsec_audit_local_only';
  vi.stubEnv('STRIPE_SECRET_KEY','sk_test_audit_local_only');
  vi.stubEnv('STRIPE_MARKETPLACE_WEBHOOK_SECRET',secret);
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_' + keyMode + '_audit_local_only');
  const body = JSON.stringify({id:'evt_test',object:'event',livemode:eventLiveMode,type,data:{object:{id:'cs_paid',object:'checkout.session',livemode:eventLiveMode,mode:'payment',status:'complete',amount_total:5000,currency:'eur',payment_status:'paid',metadata:{kind:'marketplace_topup',marketplaceOrgId:orgId},...overrides}}});
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

// LG-068: isolated four-company rehearsal; all balances and identities are synthetic.
async function additionalBuyer(t: Awaited<ReturnType<typeof setup>>['t'], name: string) {
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert('users', { clerkUserId: name });
    const orgId = await ctx.db.insert('orgs', { name, slug: name, ownerId: userId, marketplaceEnabled: true });
    const workspaceId = await ctx.db.insert('workspaces', { orgId, name, isDefault: true });
    await ctx.db.insert('memberships', { userId, orgId, workspaceId, role: 'owner' });
    await ctx.db.insert('marketplaceWallets', { orgId, balanceCents: 10000, updatedAt: Date.now() });
    await ctx.db.insert('marketplaceBuyerPreferences', { orgId, niches: ['airco'], preferredMode: 'both', notifyOnNewLead: false, notifyChannel: 'email', updatedAt: Date.now() });
    const pipelineId = await ctx.db.insert('pipelines', { workspaceId, name, isDefault: true });
    await ctx.db.insert('pipelineStages', { pipelineId, name: 'Nieuw', order: 0, isWonStage: false, isLostStage: false });
    return { orgId, workspaceId };
  });
  return { ...ids, buyer: t.withIdentity({ subject: name }) };
}

test('four-company rehearsal: three shared copies are isolated, fourth buyer is not charged', async () => {
  const a = await setup();
  const { t, leadId } = a;
  const b = await additionalBuyer(t, 'synthetic-b');
  const c = await additionalBuyer(t, 'synthetic-c');
  const d = await additionalBuyer(t, 'synthetic-d');
  const lead = await t.run(ctx => ctx.db.get(leadId));
  expect(await a.buyer.query(api.marketplace.purchase.getMyPurchasedContact,{leadId})).toBeNull();
  expect(lead!.maxSharedBuyers).toBe(3);
  const results = [];
  for (const company of [a,b,c]) {
    const result = await company.buyer.mutation(api.marketplace.purchase.purchaseLead, { leadId, mode: 'shared' });
  expect(result.success).toBe(true);
  expect(await company.buyer.query(api.marketplace.purchase.getMyPurchasedContact,{leadId})).toMatchObject({contactId:result.contactId,email:'audit@example.invalid'});
    expect(result.contactId).toBeDefined();
    const detail = await company.buyer.query(api.contacts.getDetail, { contactId: result.contactId! });
    expect(detail!.contact.workspaceId).toBe(company.workspaceId);
    expect((await company.buyer.query(api.marketplace.wallet.getWallet, {})).wallet.balanceCents).toBe(10000-lead!.priceSharedCents);
    results.push(result);
  }
  expect(new Set(results.map(result => result.contactId)).size).toBe(3);
  await expect(b.buyer.query(api.contacts.getDetail, { contactId: results[0].contactId! })).rejects.toThrow();
  const denied = await d.buyer.mutation(api.marketplace.purchase.purchaseLead, { leadId, mode: 'shared' });
  expect(denied.success).toBe(false);
  expect((await d.buyer.query(api.marketplace.wallet.getWallet, {})).wallet.balanceCents).toBe(10000);
  expect(await d.buyer.query(api.marketplace.purchase.listMyPurchases, {})).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query('marketplaceWalletTransactions').take(10))).toHaveLength(3);
  expect(await t.run(ctx => ctx.db.query('opportunities').take(10))).toHaveLength(3);
});

test('purchased detail denies non-buyers and removes a missing CRM link',async()=>{
  const {t,buyer,leadId}=await setup();
  const purchase=await buyer.mutation(api.marketplace.purchase.purchaseLead,{leadId,mode:'shared'});
  const other=await additionalBuyer(t,'other-buyer');
  expect(await other.buyer.query(api.marketplace.purchase.getMyPurchasedContact,{leadId})).toBeNull();
  await expect(t.query(api.marketplace.purchase.getMyPurchasedContact,{leadId})).rejects.toThrow();
  await t.run(ctx=>ctx.db.delete(purchase.contactId!));
  expect(await buyer.query(api.marketplace.purchase.getMyPurchasedContact,{leadId})).toMatchObject({contactId:null,email:'audit@example.invalid'});
});

test('exclusive purchase prevents another company buying either mode without debiting it', async () => {
  const { t,buyer,leadId } = await setup();
  const b = await additionalBuyer(t, 'synthetic-b');
  expect((await buyer.mutation(api.marketplace.purchase.purchaseLead, { leadId,mode:'exclusive' })).success).toBe(true);
  for (const mode of ['shared','exclusive'] as const) {
    expect((await b.buyer.mutation(api.marketplace.purchase.purchaseLead, { leadId,mode })).success).toBe(false);
  }
  expect((await b.buyer.query(api.marketplace.wallet.getWallet, {})).wallet.balanceCents).toBe(10000);
  expect(await t.run(ctx => ctx.db.query('contacts').take(10))).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query('marketplaceWalletTransactions').take(10))).toHaveLength(1);
});

test('first shared purchase removes exclusive option for subsequent companies', async () => {
  const { t,buyer,leadId } = await setup();
  const b = await additionalBuyer(t, 'synthetic-b');
  await buyer.mutation(api.marketplace.purchase.purchaseLead, { leadId,mode:'shared' });
  expect(await b.buyer.mutation(api.marketplace.purchase.purchaseLead, { leadId,mode:'exclusive' })).toMatchObject({success:false,error:'mode_not_allowed'});
  expect((await b.buyer.query(api.marketplace.wallet.getWallet, {})).wallet.balanceCents).toBe(10000);
  expect((await b.buyer.mutation(api.marketplace.purchase.purchaseLead, { leadId,mode:'shared' })).success).toBe(true);
});


test.each(['live','test'])('rejects opposite signed payment mode in %s deployment', async mode => {
  const {t,buyer,orgId} = await setup(0);
  vi.stubEnv('STRIPE_MARKETPLACE_MODE',mode);
  const response = await signedEvent(t,orgId,{},'checkout.session.completed',mode !== 'live',mode);
  expect(response.status).toBe(400);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(0);
});

test('live payment accepted only with live configuration, duplicate still idempotent', async () => {
  const {t,buyer,orgId} = await setup(0);
  vi.stubEnv('STRIPE_MARKETPLACE_MODE','live');
  for (let i=0;i<2;i++) expect((await signedEvent(t,orgId,{},'checkout.session.completed',true,'live')).status).toBe(200);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(5000);
});

test('key mismatch fails closed before crediting', async () => {
  const {t,buyer,orgId} = await setup(0);
  vi.stubEnv('STRIPE_MARKETPLACE_MODE','live');
  expect((await signedEvent(t,orgId)).status).toBe(500);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(0);
});

test.each([true,undefined])('session livemode must match signed event: %s',async livemode=>{
  const {t,buyer,orgId} = await setup(0);
  expect((await signedEvent(t,orgId,{livemode})).status).toBe(400);
  expect((await buyer.query(api.marketplace.wallet.getWallet,{})).wallet.balanceCents).toBe(0);
});

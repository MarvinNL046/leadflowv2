/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { isValidMarketingEmail, dedupeByEmail } from './segmentsLogic';
const modules = import.meta.glob('./**/*.ts');
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function setup(emails = ['first@real.nl', 'second@real.nl']) {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert('users', { clerkUserId: 'campaign_tester' });
    const orgId = await ctx.db.insert('orgs', { name: 'Test', slug: 'test', ownerId: userId });
    const workspaceId = await ctx.db.insert('workspaces', { orgId, name: 'Test', isDefault: true });
    await ctx.db.insert('memberships', { orgId, userId, role: 'owner' });
    const segmentId = await ctx.db.insert('segments', { workspaceId, name: 'Test', rules: { match: 'all', conditions: [] } });
    const broadcastId = await ctx.db.insert('broadcasts', { workspaceId, segmentId, name: 'Mail', subject: 'Subject', body: '<p>Test</p>', status: 'sending', recipientsReady: true, stats: { total: emails.length, sent: 0, delivered: 0, bounced: 0, unsubscribed: 0, failed: 0 } });
    const recipientIds = [];
    for (const email of emails) {
      const contactId = await ctx.db.insert('contacts', { workspaceId, email, callCount: 0 });
      recipientIds.push(await ctx.db.insert('broadcastRecipients', { broadcastId, workspaceId, contactId, email, status: 'pending' }));
    }
    return { orgId, workspaceId, broadcastId, segmentId, recipientIds };
  });
  vi.stubEnv('LEGACY_PROVIDER_ORG_ID', ids.orgId);
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('EMAIL_FROM', 'Test <mail@real.nl>');
  vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64));
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site');
  const payload = JSON.stringify(emails.map(to => ({ from: 'Test <mail@real.nl>', to, subject: 'Subject', html: '<p>Test</p>', text: 'Test' })));
  return { t, auth: t.withIdentity({ subject: 'campaign_tester' }), ...ids, payload };
}

test('reserved domains and malformed addresses are excluded; normalized addresses dedupe', () => {
  for (const email of ['x@example.com', 'x@sub.example.org', 'x@foo.test', 'x@y.invalid', 'x y@real.nl', 'x@-bad.nl', 'a..b@real.nl', ' ']) expect(isValidMarketingEmail(email)).toBe(false);
  expect(isValidMarketingEmail(' customer+airco@real.nl ')).toBe(true);
  expect(dedupeByEmail([{ email: ' First@real.nl ' }, { email: 'first@real.nl' }])).toHaveLength(1);
});

test('concurrent preparation cannot claim the same recipients twice', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const first = await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload });
  expect(first).not.toBeNull();
  expect(await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload })).toBeNull();
  expect(await t.run(ctx => ctx.db.query('broadcastBatches').collect())).toHaveLength(1);
});

test('duplicate completions do not duplicate messages or sent counts', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  const attempt = (await t.mutation(internal.broadcastDelivery.begin, { batchId }))!;
  await t.mutation(internal.broadcastDelivery.complete, { batchId, attempt, ids: ['resend-1', 'resend-2'] });
  await t.mutation(internal.broadcastDelivery.complete, { batchId, attempt, ids: ['resend-1', 'resend-2'] });
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats.sent).toBe(2);
  expect(await t.run(ctx => ctx.db.query('messages').collect())).toHaveLength(2);
});

test('a lost response retries the exact payload with the same idempotency key', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error('connection closed')).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await t.action(internal.broadcastDelivery.deliver, { batchId });
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats.sent).toBe(0);
  vi.setSystemTime(Date.now() + 31_000);
  await t.action(internal.broadcastDelivery.deliver, { batchId });
  const first = fetchMock.mock.calls[0][1];
  const retry = fetchMock.mock.calls[1][1];
  expect(retry.body).toBe(first.body);
  expect(retry.headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key']);
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats.sent).toBe(2);
});

test('incomplete successful responses are not falsely counted as sent', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"data":[]}', { status: 200 })));
  await t.action(internal.broadcastDelivery.deliver, { batchId });
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats.sent).toBe(0);
  expect((await t.run(ctx => ctx.db.get(batchId)))!.status).toBe('pending');
});

test('recipient rejection splits the batch; a single bad recipient cannot fail every recipient', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"Invalid `to` field"}', { status: 422 })));
  await t.action(internal.broadcastDelivery.deliver, { batchId });
  const jobs = await t.run(ctx => ctx.db.query('broadcastBatches').collect());
  expect(jobs.filter(j => j.status === 'pending')).toHaveLength(2);
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.status).toBe('sending');
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats.failed).toBe(0);
});

test('expired ambiguous attempts are quarantined instead of resent', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  await t.mutation(internal.broadcastDelivery.begin, { batchId });
  vi.setSystemTime(Date.now() + 24 * 60 * 60_000);
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await t.action(internal.broadcastDelivery.deliver, { batchId });
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await t.run(ctx => ctx.db.get(batchId)))!.status).toBe('needs_review');
});

test('cancellation prevents any new provider call', async () => {
  const { t, auth, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  await auth.mutation(api.broadcasts.cancel, { broadcastId });
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await t.action(internal.broadcastDelivery.deliver, { batchId });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('late unsubscribes are excluded at preparation', async () => {
  const { t, broadcastId, recipientIds } = await setup();
  await t.run(async ctx => {
    const r = (await ctx.db.get(recipientIds[0]))!;
    await ctx.db.patch(r.contactId, { emailMarketingStatus: 'unsubscribed' });
  });
  const eligible = await t.mutation(internal.broadcasts.pendingForPreparation, { broadcastId });
  expect(eligible).toHaveLength(1);
  expect((await t.run(ctx => ctx.db.get(recipientIds[0])))!.status).toBe('failed');
});

test('unsubscribe between enqueue and first attempt removes the recipient from the request', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  await t.run(async ctx => { const r = (await ctx.db.get(recipientIds[0]))!; await ctx.db.patch(r.contactId, { emailMarketingStatus: 'unsubscribed' }); });
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [{ id: 'only-second' }] }));
  vi.stubGlobal('fetch', fetchMock);
  await t.action(internal.broadcastDelivery.deliver, { batchId });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).map((e: { to: string }) => e.to)).toEqual(['second@real.nl']);
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats).toMatchObject({ sent: 1, failed: 1 });
});

test('a 429 respects Retry-After and does not count recipients as failed', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limit', { status: 429, headers: { 'retry-after': '120' } })));
  await t.action(internal.broadcastDelivery.deliver, { batchId });
  const job = (await t.run(ctx => ctx.db.get(batchId)))!;
  expect(job.nextAttemptAt).toBe(Date.now() + 120_000);
  expect(job.status).toBe('pending');
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats.failed).toBe(0);
});

test('Retry-After is never shortened and cannot outlive the safe retry window', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  const attempt = (await t.mutation(internal.broadcastDelivery.begin, { batchId }))!;
  await t.mutation(internal.broadcastDelivery.retry, { batchId, attempt, error: 'rate limit', retryable: true, delayMs: 2 * 60 * 60_000 });
  expect((await t.run(ctx => ctx.db.get(batchId)))!.nextAttemptAt).toBe(Date.now() + 2 * 60 * 60_000);
  vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
  const second = (await t.mutation(internal.broadcastDelivery.begin, { batchId }))!;
  await t.mutation(internal.broadcastDelivery.retry, { batchId, attempt: second, error: 'daily limit', retryable: true, delayMs: 24 * 60 * 60_000 });
  expect((await t.run(ctx => ctx.db.get(batchId)))!.status).toBe('needs_review');
});

test('confirmed legacy rejection recovery preserves sent recipients and refuses a second restart', async () => {
  const { t, broadcastId, recipientIds } = await setup();
  const now = Date.now();
  await t.run(async ctx => {
    const b = (await ctx.db.get(broadcastId))!;
    await ctx.db.patch(broadcastId, { status: 'failed', completedAt: now, stats: { ...b.stats, failed: 1, sent: 1 } });
    await ctx.db.patch(recipientIds[0], { status: 'failed', errorMessage: 'Resend batch-call mislukt' });
    await ctx.db.patch(recipientIds[1], { status: 'sent', externalMessageId: 'already-sent' });
  });
  const args = { broadcastId, recipientIds: [recipientIds[0]], rejectedAt: now - 2_000, expectedCompletedAt: now, resendLogId: '0efba462-b8c8-4b66-b61a-8e0beebfae50' };
  expect(await t.mutation(internal.broadcastRecovery.retryVerifiedRejected, args)).toEqual({ requeued: 1 });
  await expect(t.mutation(internal.broadcastRecovery.retryVerifiedRejected, args)).rejects.toThrow('Campagnestatus');
  expect((await t.run(ctx => ctx.db.get(recipientIds[1])))!.externalMessageId).toBe('already-sent');
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats).toMatchObject({ sent: 1, failed: 0 });
});

test('recovery of verified legacy receipts is idempotent and never sends mail', async () => {
  const { t, broadcastId, recipientIds } = await setup();
  await t.run(async ctx => { await ctx.db.patch(broadcastId, { startedAt: Date.now() }); for (const id of recipientIds) await ctx.db.patch(id, { status: 'sending' }); });
  const receipts = recipientIds.map((recipientId, i) => ({ recipientId, externalMessageId: `verified-${i}`, email: i ? 'second@real.nl' : 'first@real.nl', subject: 'Subject', sentAt: Date.now(), outcome: 'delivered' as const }));
  expect(await t.mutation(internal.broadcastRecovery.reconcileVerified, { broadcastId, receipts })).toEqual({ repaired: 2 });
  expect(await t.mutation(internal.broadcastRecovery.reconcileVerified, { broadcastId, receipts })).toEqual({ repaired: 0 });
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats).toMatchObject({ sent: 2, delivered: 2 });
  expect(await t.run(ctx => ctx.db.query('messages').collect())).toHaveLength(2);
});

test('historical recovery refuses a receipt from another subject', async () => {
  const { t, broadcastId, recipientIds } = await setup();
  await t.run(async ctx => { await ctx.db.patch(broadcastId, { startedAt: Date.now() }); await ctx.db.patch(recipientIds[0], { status: 'sending' }); });
  await expect(t.mutation(internal.broadcastRecovery.reconcileVerified, { broadcastId, receipts: [{ recipientId: recipientIds[0], externalMessageId: 'wrong', email: 'first@real.nl', subject: 'Other campaign', sentAt: Date.now(), outcome: 'delivered' }] })).rejects.toThrow('campagne');
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats.sent).toBe(0);
});

test('audience count includes later pages, dedupes and excludes suppressed and invalid contacts', async () => {
  const { t, auth, workspaceId, broadcastId } = await setup([]);
  await t.run(async ctx => {
    for (let i = 0; i < 420; i++) await ctx.db.insert('contacts', { workspaceId, email: `person${i}@real.nl`, callCount: 0 });
    await ctx.db.insert('contacts', { workspaceId, email: ' PERSON0@real.nl ', callCount: 0 });
    await ctx.db.insert('contacts', { workspaceId, email: 'bad@example.com', callCount: 0 });
    await ctx.db.insert('contacts', { workspaceId, email: 'off@real.nl', callCount: 0, emailMarketingStatus: 'unsubscribed' });
  });
  expect((await auth.action(api.broadcastAudience.count, { broadcastId })).count).toBe(420);
  await expect(t.action(api.broadcastAudience.count, { broadcastId })).rejects.toThrow();
});

test('out-of-order opens, delivery and repeated clicks increment each metric once', async () => {
  const { t, broadcastId, recipientIds, payload } = await setup();
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  const attempt = (await t.mutation(internal.broadcastDelivery.begin, { batchId }))!;
  await t.mutation(internal.broadcastDelivery.complete, { batchId, attempt, ids: ['a', 'b'] });
  for (const newStatus of ['read', 'delivered', 'delivered', 'clicked', 'clicked'] as const) await t.mutation(internal.messaging.updateStatusByExternalId, { externalMessageId: 'a', channel: 'email', newStatus, deliveredAt: Date.now() });
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats).toMatchObject({ opened: 1, delivered: 1, clicked: 1 });
});

test('conversion after preparation excludes the contact before the first provider request', async () => {
  const { t, broadcastId, segmentId, recipientIds, payload } = await setup();
  await t.run(async ctx => {
    await ctx.db.patch(segmentId, { rules: { match: 'all', conditions: [{ field: 'tags', op: 'contains', value: 'needs-maintenance' }] } });
    for (const id of recipientIds) { const r = (await ctx.db.get(id))!; await ctx.db.patch(r.contactId, { tags: ['needs-maintenance'] }); }
  });
  const batchId = (await t.mutation(internal.broadcastDelivery.enqueue, { broadcastId, recipientIds, payload }))!;
  await t.run(async ctx => { const r = (await ctx.db.get(recipientIds[0]))!; await ctx.db.patch(r.contactId, { tags: [] }); });
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [{ id: 'remaining' }] }));
  vi.stubGlobal('fetch', fetchMock);
  await t.action(internal.broadcastDelivery.deliver, { batchId });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).map((email: { to: string }) => email.to)).toEqual(['second@real.nl']);
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.stats).toMatchObject({ sent: 1, failed: 1 });
});

test('a converted contact is excluded when a pending batch is prepared', async () => {
  const { t, broadcastId, segmentId } = await setup();
  await t.run(ctx => ctx.db.patch(segmentId, { rules: { match: 'all', conditions: [{ field: 'tags', op: 'contains', value: 'needs-maintenance' }] } }));
  expect(await t.mutation(internal.broadcasts.pendingForPreparation, { broadcastId })).toEqual([]);
});

test('segments used by a scheduled campaign cannot be deleted', async () => {
  const { t, auth, broadcastId, segmentId } = await setup();
  await t.run(ctx => ctx.db.patch(broadcastId, { status: 'scheduled' }));
  await expect(auth.mutation(api.segments.remove, { segmentId })).rejects.toThrow('nog gebruikt');
  expect(await t.run(ctx => ctx.db.get(segmentId))).not.toBeNull();
});

test('changed segment rules invalidate cached audiences and reject stale calculation results', async () => {
  const { t, auth, broadcastId, segmentId } = await setup();
  await t.run(ctx => ctx.db.patch(broadcastId, { status: 'scheduled', audienceCount: 2, audienceCountedAt: Date.now(), audienceRules: JSON.stringify({ match: 'all', conditions: [] }) }));
  await auth.mutation(api.segments.update, { segmentId, rules: { match: 'all', conditions: [{ field: 'tags', op: 'contains', value: 'new-audience' }] } });
  await t.mutation(internal.segments.refreshCampaignCounts, { segmentId, cursor: null });
  expect((await t.run(ctx => ctx.db.get(broadcastId)))!.audienceCount).toBeUndefined();
  expect(await t.mutation(internal.broadcastAudience.saveCount, { broadcastId, segmentId, rules: JSON.stringify({ match: 'all', conditions: [] }), count: 2, countedAt: Date.now() + 1000 })).toBe(false);
});

/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
const modules = import.meta.glob('./**/*.ts');
afterEach(() => vi.useRealTimers());

async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert('users', { clerkUserId: 'user_test' });
    const orgId = await ctx.db.insert('orgs', { name: 'Test', slug: 'test', ownerId: userId });
    const workspaceId = await ctx.db.insert('workspaces', { orgId, name: 'Test', isDefault: true });
    await ctx.db.insert('memberships', { userId, orgId, role: 'owner' });
    const segmentId = await ctx.db.insert('segments', { workspaceId, name: 'Test', rules: { match: 'all', conditions: [] } });
    const broadcastId = await ctx.db.insert('broadcasts', { workspaceId, segmentId, name: 'Mail', subject: 'Test', body: '<p>Test</p>', status: 'draft', stats: { total: 0, sent: 0, delivered: 0, bounced: 0, unsubscribed: 0, failed: 0 } });
    return { workspaceId, segmentId, broadcastId };
  });
  return { t, auth: t.withIdentity({ subject: 'user_test' }), ...ids };
}

test('rescheduling cancels the old job and rejects stale and legacy early callbacks', async () => {
  const { t, auth, broadcastId } = await setup();
  const first = Date.now() + 60_000;
  const second = first + 60_000;
  await auth.mutation(api.broadcasts.schedule, { broadcastId, scheduledAt: first });
  const old = await t.run(ctx => ctx.db.get(broadcastId));
  await auth.mutation(api.broadcasts.schedule, { broadcastId, scheduledAt: second });
  const job = await t.run(ctx => ctx.db.system.get(old!.scheduledJobId!));
  expect(job!.state.kind).toBe('canceled');
  vi.setSystemTime(first);
  expect(await t.mutation(internal.broadcasts.beginScheduledSend, { broadcastId })).toEqual({ started: false });
  vi.setSystemTime(second);
  expect(await t.mutation(internal.broadcasts.beginScheduledSend, { broadcastId, scheduledAt: first })).toEqual({ started: false });
  expect(await t.mutation(internal.broadcasts.beginScheduledSend, { broadcastId, scheduledAt: second })).toEqual({ started: true });
  expect(await t.mutation(internal.broadcasts.beginScheduledSend, { broadcastId, scheduledAt: second })).toEqual({ started: false });
});

test('cancel, restore and edit preserves the campaign and clears its schedule', async () => {
  const { t, auth, broadcastId, segmentId } = await setup();
  await auth.mutation(api.broadcasts.schedule, { broadcastId, scheduledAt: Date.now() + 60_000 });
  await auth.mutation(api.broadcasts.cancel, { broadcastId });
  await auth.mutation(api.broadcasts.restoreDraft, { broadcastId });
  await auth.mutation(api.broadcasts.update, { broadcastId, segmentId, name: 'Updated', subject: 'Updated', body: '<p>Updated</p>' });
  const b = await t.run(ctx => ctx.db.get(broadcastId));
  expect(b).toMatchObject({ status: 'draft', subject: 'Updated' });
  expect(b!.scheduledAt).toBeUndefined();
  expect(b!.scheduledJobId).toBeUndefined();
});

test('started campaigns cannot be restored and scheduled campaigns cannot be edited', async () => {
  const { t, auth, broadcastId, segmentId } = await setup();
  await auth.mutation(api.broadcasts.schedule, { broadcastId, scheduledAt: Date.now() + 60_000 });
  await expect(auth.mutation(api.broadcasts.update, { broadcastId, segmentId, name: 'X', subject: 'X', body: 'X' })).rejects.toThrow('concept');
  await t.run(ctx => ctx.db.patch(broadcastId, { status: 'cancelled', startedAt: Date.now() }));
  await expect(auth.mutation(api.broadcasts.restoreDraft, { broadcastId })).rejects.toThrow('al gestart');
});

test('unauthorized users cannot edit, restore or reschedule', async () => {
  const { t, broadcastId, segmentId } = await setup();
  await expect(t.mutation(api.broadcasts.update, { broadcastId, segmentId, name: 'X', subject: 'X', body: 'X' })).rejects.toThrow('authenticated');
  await expect(t.mutation(api.broadcasts.restoreDraft, { broadcastId })).rejects.toThrow('authenticated');
  await expect(t.mutation(api.broadcasts.schedule, { broadcastId, scheduledAt: Date.now() + 60_000 })).rejects.toThrow('authenticated');
});

import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { isMailable } from './segmentsLogic';

// Requests are deliberately small enough to persist under Convex's document limit.
export const MAX_BATCH_BYTES = 700_000;
const RETRY_WINDOW = 23 * 60 * 60_000;
const LEASE_MS = 12 * 60_000;
export type MailPayload = { from: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> };

export const enqueue = internalMutation({
  args: { broadcastId: v.id('broadcasts'), recipientIds: v.array(v.id('broadcastRecipients')), payload: v.string(), emailConnectionId: v.optional(v.id('companyEmailConnections')) },
  returns: v.union(v.id('broadcastBatches'), v.null()),
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b || b.status !== 'sending') return null;
    if (!args.recipientIds.length || args.recipientIds.length > 20 || new TextEncoder().encode(args.payload).length > MAX_BATCH_BYTES) throw new Error('Verzendbatch is te groot.');
    const payload = JSON.parse(args.payload) as MailPayload[];
    if (payload.length !== args.recipientIds.length || new Set(args.recipientIds).size !== args.recipientIds.length) throw new Error('Ongeldige verzendbatch.');
    for (const [i, id] of args.recipientIds.entries()) {
      const r = await ctx.db.get(id);
      if (!r || r.broadcastId !== b._id || r.workspaceId !== b.workspaceId || r.status !== 'pending') return null;
      if (payload[i].to !== r.email.trim()) throw new Error('Ontvanger komt niet overeen.');
    }
    const id = await ctx.db.insert('broadcastBatches', { ...args, status: 'pending', attempts: 0, nextAttemptAt: Date.now() });
    for (const recipientId of args.recipientIds) await ctx.db.patch(recipientId, { status: 'sending' });
    await ctx.db.patch(b._id, { lastActivityAt: Date.now(), lastError: undefined });
    await ctx.scheduler.runAfter(0, internal.broadcastDelivery.deliver, { batchId: id });
    return id;
  },
});

export const begin = internalMutation({
  args: { batchId: v.id('broadcastBatches') },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { batchId }) => {
    const job = await ctx.db.get(batchId);
    if (!job || !['pending', 'processing'].includes(job.status) || job.nextAttemptAt > Date.now()) return null;
    if (job.status === 'processing' && Date.now() - (job.lastAttemptAt ?? 0) < LEASE_MS) return null;
    const b = await ctx.db.get(job.broadcastId);
    if (!b || b.status !== 'sending') return null;
    // Before the first request only, honor opt-outs that happened after preparation.
    // Once attempted, the immutable body must remain unchanged for safe retries.
    if (job.firstAttemptAt === undefined) {
      const emails = JSON.parse(job.payload) as MailPayload[];
      const ids = [];
      const allowed = [];
      let skipped = 0;
      for (const [i, id] of job.recipientIds.entries()) {
        const r = await ctx.db.get(id);
        const c = r ? await ctx.db.get(r.contactId) : null;
        if (!r || r.status !== 'sending' || r.broadcastId !== b._id) throw new Error('Ontvangerstatus gewijzigd.');
        if (!c || c.workspaceId !== b.workspaceId || c.deletedAt || !isMailable(c) || c.email?.trim().toLowerCase() !== r.email.trim().toLowerCase()) {
          await ctx.db.patch(r._id, { status: 'failed', errorMessage: 'Overgeslagen: ontvanger is niet meer mailbaar.' });
          skipped++;
        } else { ids.push(id); allowed.push(emails[i]); }
      }
      if (skipped) {
        await ctx.db.patch(b._id, { stats: { ...b.stats, failed: b.stats.failed + skipped } });
        await ctx.db.patch(job._id, { recipientIds: ids, payload: JSON.stringify(allowed) });
        if (!ids.length) {
          await ctx.db.patch(job._id, { status: 'failed', lastError: 'Alle ontvangers overgeslagen.' });
          await ctx.scheduler.runAfter(10_000, internal.broadcasts.runBatch, { broadcastId: b._id });
          return null;
        }
      }
    }
    if (job.firstAttemptAt !== undefined && Date.now() - job.firstAttemptAt >= RETRY_WINDOW) {
      const lastError = 'Verzendbevestiging ontbreekt; controleer deze batch in Resend. Niet automatisch opnieuw versturen.';
      await ctx.db.patch(job._id, { status: 'needs_review', lastError });
      await ctx.db.patch(b._id, { lastError });
      return null;
    }
    const attempt = job.attempts + 1;
    await ctx.db.patch(job._id, { status: 'processing', attempts: attempt, firstAttemptAt: job.firstAttemptAt ?? Date.now(), lastAttemptAt: Date.now(), nextAttemptAt: Date.now() + LEASE_MS });
    return attempt;
  },
});

export const load = internalQuery({
  args: { batchId: v.id('broadcastBatches') },
  returns: v.union(v.null(), v.object({ _id: v.id('broadcastBatches'), _creationTime: v.number(), broadcastId: v.id('broadcasts'), recipientIds: v.array(v.id('broadcastRecipients')), payload: v.string(), emailConnectionId: v.optional(v.id('companyEmailConnections')), status: v.union(v.literal('pending'), v.literal('processing'), v.literal('sent'), v.literal('failed'), v.literal('needs_review')), attempts: v.number(), firstAttemptAt: v.optional(v.number()), lastAttemptAt: v.optional(v.number()), nextAttemptAt: v.number(), lastError: v.optional(v.string()) })),
  handler: async (ctx, { batchId }) => ctx.db.get(batchId),
});

/** Commit provider receipts and schedule continuation in ONE transaction. */
export const complete = internalMutation({
  args: { batchId: v.id('broadcastBatches'), attempt: v.number(), ids: v.optional(v.array(v.string())), error: v.optional(v.string()), rejectedRecipient: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.batchId);
    if (!job || job.status !== 'processing' || job.attempts !== args.attempt) return null;
    const b = await ctx.db.get(job.broadcastId);
    if (!b) return null;
    const payload = JSON.parse(job.payload) as MailPayload[];
    if (args.ids && (args.ids.length !== job.recipientIds.length || args.ids.some(id => !id))) throw new Error('Onvolledige verzendbevestiging.');
    if (!args.ids && !args.rejectedRecipient) throw new Error('Geen definitief verzendresultaat.');
    let sent = 0;
    let failed = 0;
    for (const [i, recipientId] of job.recipientIds.entries()) {
      const r = await ctx.db.get(recipientId);
      if (!r || r.broadcastId !== b._id || r.status !== 'sending') continue;
      const externalMessageId = args.ids?.[i];
      const status = externalMessageId ? 'sent' as const : 'failed' as const;
      await ctx.db.patch(r._id, { status, externalMessageId, errorMessage: args.error });
      await ctx.db.insert('messages', { workspaceId: b.workspaceId, emailConnectionId: job.emailConnectionId, contactId: r.contactId, channel: 'email', direction: 'outbound', status, externalMessageId, to: r.email, subject: payload[i].subject, body: '', relatedEntityType: 'broadcast', relatedEntityId: b._id, sentAt: externalMessageId ? Date.now() : undefined, errorMessage: args.error });
      if (externalMessageId) sent++; else failed++;
    }
    await ctx.db.patch(job._id, { status: args.ids ? 'sent' : 'failed', lastError: args.error });
    await ctx.db.patch(b._id, { stats: { ...b.stats, sent: b.stats.sent + sent, failed: b.stats.failed + failed }, lastActivityAt: Date.now() });
    if (b.status === 'sending') await ctx.scheduler.runAfter(10_000, internal.broadcasts.runBatch, { broadcastId: b._id });
    return null;
  },
});

/** Split ONLY an explicitly rejected recipient-validation request, never a timeout. */
export const splitRejected = internalMutation({
  args: { batchId: v.id('broadcastBatches'), attempt: v.number(), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.batchId);
    if (!job || job.status !== 'processing' || job.attempts !== args.attempt) return null;
    const b = await ctx.db.get(job.broadcastId);
    if (!b || b.status !== 'sending') return null;
    const emails = JSON.parse(job.payload) as MailPayload[];
    if (emails.length < 2) throw new Error('Enkele ontvanger kan niet worden gesplitst.');
    const mid = Math.ceil(emails.length / 2);
    for (const [index, start] of [0, mid].entries()) {
      const end = index === 0 ? mid : emails.length;
      const id = await ctx.db.insert('broadcastBatches', { broadcastId: job.broadcastId, emailConnectionId: job.emailConnectionId, recipientIds: job.recipientIds.slice(start, end), payload: JSON.stringify(emails.slice(start, end)), status: 'pending', attempts: 0, nextAttemptAt: Date.now() + index * 10_000 });
      await ctx.scheduler.runAfter(index * 10_000, internal.broadcastDelivery.deliver, { batchId: id });
    }
    await ctx.db.patch(job._id, { status: 'failed', lastError: args.error });
    return null;
  },
});

export const retry = internalMutation({
  args: { batchId: v.id('broadcastBatches'), attempt: v.number(), error: v.string(), retryable: v.boolean(), delayMs: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.batchId);
    if (!job || job.status !== 'processing' || job.attempts !== args.attempt) return null;
    const b = await ctx.db.get(job.broadcastId);
    const delay = Math.max(args.delayMs ?? 0, Math.min(60 * 60_000, 30_000 * 2 ** (job.attempts - 1)));
    const retryable = args.retryable && job.attempts < 6 && Date.now() + delay - (job.firstAttemptAt ?? Date.now()) < RETRY_WINDOW;
    await ctx.db.patch(job._id, { status: retryable ? 'pending' : 'needs_review', lastError: args.error, nextAttemptAt: Date.now() + delay });
    if (b) await ctx.db.patch(b._id, { lastError: args.error, lastActivityAt: Date.now() });
    if (retryable && b?.status === 'sending') await ctx.scheduler.runAfter(delay, internal.broadcastDelivery.deliver, { batchId: job._id });
    return null;
  },
});

export const deliver = internalAction({
  args: { batchId: v.id('broadcastBatches') },
  returns: v.null(),
  handler: async (ctx, { batchId }): Promise<null> => {
    const attempt: number | null = await ctx.runMutation(internal.broadcastDelivery.begin, { batchId });
    if (attempt === null) return null;
    const job: Doc<'broadcastBatches'> | null = await ctx.runQuery(internal.broadcastDelivery.load, { batchId });
    if (!job) return null;
    try {
      const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: job.broadcastId });
      if (!b || b.status !== 'sending') return null;
      if (b.emailConnectionId !== job.emailConnectionId) {
        await ctx.runMutation(internal.broadcastDelivery.retry, { batchId, attempt, retryable: false, error: 'E-mailkoppeling gewijzigd tijdens verzending. Controleer de batch.' });
        return null;
      }
      const res = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${b.emailApiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `broadcast-batch-${batchId}` }, body: job.payload });
      if (!res.ok) {
        const body = await res.text();
        const error = `Resend ${res.status}: ${body.slice(0, 300)}`;
        const recipientError = res.status === 422 && /invalid.*(?:`to`|"to"|recipient)/i.test(body);
        if (recipientError) {
          if (job.recipientIds.length > 1) await ctx.runMutation(internal.broadcastDelivery.splitRejected, { batchId, attempt, error });
          else await ctx.runMutation(internal.broadcastDelivery.complete, { batchId, attempt, rejectedRecipient: true, error });
        } else {
          const retryAfterHeader = res.headers.get('retry-after');
          const retryAfter = retryAfterHeader && /^\d+(\.\d+)?$/.test(retryAfterHeader)
            ? Number(retryAfterHeader) * 1000
            : retryAfterHeader ? Date.parse(retryAfterHeader) - Date.now() : NaN;
          await ctx.runMutation(internal.broadcastDelivery.retry, { batchId, attempt, error, retryable: res.status === 429 || res.status >= 500 || res.status === 408, delayMs: Number.isFinite(retryAfter) ? Math.max(0, retryAfter) : undefined });
        }
        return null;
      }
      const data = await res.json() as { data?: Array<{ id?: string }> };
      if (!Array.isArray(data.data) || data.data.length !== job.recipientIds.length || data.data.some(r => typeof r.id !== 'string' || !r.id)) throw new Error('Resend gaf een onvolledige verzendbevestiging; resultaat wordt gecontroleerd met dezelfde verzendsleutel.');
      await ctx.runMutation(internal.broadcastDelivery.complete, { batchId, attempt, ids: data.data.map(r => r.id!) });
    } catch (err) {
      await ctx.runMutation(internal.broadcastDelivery.retry, { batchId, attempt, retryable: true, error: err instanceof Error ? err.message.slice(0, 400) : 'Verzendbevestiging ontbreekt.' });
    }
    return null;
  },
});

/** Bounded crash recovery; requests older than the provider window are quarantined. */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const status of ['pending', 'processing'] as const) {
      const jobs = await ctx.db.query('broadcastBatches').withIndex('by_status_nextAttemptAt', q => q.eq('status', status).lte('nextAttemptAt', Date.now())).take(100);
      for (const job of jobs) {
        const b = await ctx.db.get(job.broadcastId);
        if (!b || b.status !== 'sending') {
          await ctx.db.patch(job._id, { status: 'needs_review', lastError: 'Campagne gestopt; controleer eventueel lopende verzending.' });
          continue;
        }
        await ctx.scheduler.runAfter(0, internal.broadcastDelivery.deliver, { batchId: job._id });
        // Duplicate callbacks are harmless: begin checks the due time and lease.
      }
    }
    return null;
  },
});

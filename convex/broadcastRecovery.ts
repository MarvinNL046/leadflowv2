import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { requireWorkspacePermission } from './lib/permissions';

/** Operations-only: restart a legacy request confirmed rejected in Resend's log.
 * The caller must match the log timestamp to the campaign's terminal failure.
 * Unknown outcomes and accepted requests must use reconcileVerified instead.
 */
export const retryVerifiedRejected = internalMutation({
  args: { broadcastId: v.id('broadcasts'), recipientIds: v.array(v.id('broadcastRecipients')), rejectedAt: v.number(), expectedCompletedAt: v.number(), resendLogId: v.string() },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, args) => {
    if (!args.recipientIds.length || args.recipientIds.length > 100 || new Set(args.recipientIds).size !== args.recipientIds.length || !/^[0-9a-f-]{36}$/.test(args.resendLogId)) throw new Error('Ongeldige herstelbevestiging.');
    const b = await ctx.db.get(args.broadcastId);
    if (!b || b.status !== 'failed' || b.completedAt !== args.expectedCompletedAt || b.recipientsReady === false || b.stats.total === 0) throw new Error('Campagnestatus is gewijzigd of verzendlijst is onvolledig.');
    if (args.rejectedAt > args.expectedCompletedAt || args.expectedCompletedAt - args.rejectedAt > 30_000) throw new Error('Resend-log valt buiten het foutmoment.');
    if (b.stats.failed < args.recipientIds.length) throw new Error('Fouttelling komt niet overeen.');
    for (const id of args.recipientIds) {
      const r = await ctx.db.get(id);
      if (!r || r.broadcastId !== b._id || r.workspaceId !== b.workspaceId || r.status !== 'failed' || r.externalMessageId || r.errorMessage !== 'Resend batch-call mislukt') throw new Error('Ontvanger heeft geen bevestigde oude batchfout.');
      await ctx.db.patch(id, { status: 'pending', errorMessage: undefined });
    }
    await ctx.db.patch(b._id, { status: 'sending', completedAt: undefined, recipientsReady: true, lastError: undefined, lastActivityAt: Date.now(), stats: { ...b.stats, failed: b.stats.failed - args.recipientIds.length } });
    console.info('Restored rejected broadcast request', { broadcastId: b._id, resendLogId: args.resendLogId, recipients: args.recipientIds.length });
    await ctx.scheduler.runAfter(0, internal.broadcasts.runBatch, { broadcastId: b._id });
    return { requeued: args.recipientIds.length };
  },
});

/** Resume only recipients that have never been claimed. Ambiguous attempts stay isolated. */
export const resumePending = mutation({
  args: { broadcastId: v.id('broadcasts') },
  returns: v.null(),
  handler: async (ctx, { broadcastId }) => {
    const b = await ctx.db.get(broadcastId);
    if (!b) throw new Error('Campagne niet gevonden.');
    await requireWorkspacePermission(ctx, b.workspaceId, 'manage');
    if (b.status !== 'failed' && b.status !== 'sending') throw new Error('Deze campagne kan niet worden hervat.');
    if (b.recipientsReady === false || b.stats.total === 0) throw new Error('De verzendlijst is niet volledig voorbereid. Controle nodig.');
    const pending = await ctx.db.query('broadcastRecipients').withIndex('by_broadcast_status', q => q.eq('broadcastId', b._id).eq('status', 'pending')).first();
    if (!pending) throw new Error('Geen wachtende ontvangers. Controleer ontbrekende verzendbevestigingen.');
    await ctx.db.patch(b._id, { status: 'sending', completedAt: undefined, lastError: undefined, lastActivityAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.broadcasts.runBatch, { broadcastId });
    return null;
  },
});

export const health = query({
  args: { broadcastId: v.id('broadcasts') },
  returns: v.object({ hasPending: v.boolean(), hasUnconfirmed: v.boolean(), batches: v.array(v.object({ id: v.id('broadcastBatches'), status: v.string(), attempts: v.number(), recipients: v.number(), nextAttemptAt: v.number(), error: v.union(v.string(), v.null()) })) }),
  handler: async (ctx, { broadcastId }) => {
    const b = await ctx.db.get(broadcastId);
    if (!b) throw new Error('Campagne niet gevonden.');
    await requireWorkspacePermission(ctx, b.workspaceId, 'crm');
    const pending = await ctx.db.query('broadcastRecipients').withIndex('by_broadcast_status', q => q.eq('broadcastId', b._id).eq('status', 'pending')).first();
    const sending = await ctx.db.query('broadcastRecipients').withIndex('by_broadcast_status', q => q.eq('broadcastId', b._id).eq('status', 'sending')).first();
    const batches = (await Promise.all((['pending', 'processing', 'needs_review'] as const).map(status => ctx.db.query('broadcastBatches').withIndex('by_broadcastId_status', q => q.eq('broadcastId', b._id).eq('status', status)).take(20)))).flat();
    return { hasPending: !!pending, hasUnconfirmed: !!sending, batches: batches.filter(j => j.status === 'pending' || j.status === 'processing' || j.status === 'needs_review').slice(0, 20).map(j => ({ id: j._id, status: j.status, attempts: j.attempts, recipients: j.recipientIds.length, nextAttemptAt: j.nextAttemptAt, error: j.lastError ?? null })) };
  },
});

/** Operations-only reconciliation. Call ONLY with individually verified Resend receipts. */
export const reconcileVerified = internalMutation({
  args: { broadcastId: v.id('broadcasts'), receipts: v.array(v.object({ recipientId: v.id('broadcastRecipients'), externalMessageId: v.string(), email: v.string(), subject: v.string(), sentAt: v.number(), outcome: v.union(v.literal('delivered'), v.literal('opened'), v.literal('suppressed')) })) },
  returns: v.object({ repaired: v.number() }),
  handler: async (ctx, args) => {
    if (args.receipts.length > 100) throw new Error('Maximaal 100 bevestigingen per keer.');
    const b = await ctx.db.get(args.broadcastId);
    if (!b || b.startedAt === undefined) throw new Error('Campagne is niet gestart.');
    let repaired = 0;
    const stats = { ...b.stats };
    for (const receipt of args.receipts) {
      const r = await ctx.db.get(receipt.recipientId);
      if (!r || r.broadcastId !== b._id || r.workspaceId !== b.workspaceId || r.email.trim().toLowerCase() !== receipt.email.trim().toLowerCase() || b.subject !== receipt.subject) throw new Error('Bevestiging hoort niet bij deze ontvanger en campagne.');
      if (!Number.isFinite(receipt.sentAt) || receipt.sentAt < b.startedAt - 60_000 || receipt.sentAt > b.startedAt + 24 * 60 * 60_000) throw new Error('Verzenddatum valt buiten de gecontroleerde campagne.');
      if (r.status === 'sent' && r.externalMessageId === receipt.externalMessageId) continue;
      if (r.status !== 'sending' || r.externalMessageId) throw new Error('Ontvanger heeft al een ander resultaat.');
      const message = await ctx.db.query('messages').withIndex('by_external_id', q => q.eq('externalMessageId', receipt.externalMessageId)).first();
      if (message) throw new Error('Resend-bevestiging is al gekoppeld aan een bericht.');
      const suppressed = receipt.outcome === 'suppressed';
      await ctx.db.patch(r._id, { status: 'sent', externalMessageId: receipt.externalMessageId, errorMessage: suppressed ? 'Resend heeft dit adres onderdrukt; niet opnieuw versturen.' : undefined });
      await ctx.db.insert('messages', { workspaceId: b.workspaceId, contactId: r.contactId, channel: 'email', direction: 'outbound', status: suppressed ? 'failed' : receipt.outcome === 'opened' ? 'read' : 'delivered', externalMessageId: receipt.externalMessageId, to: r.email, subject: receipt.subject, body: '', relatedEntityType: 'broadcast', relatedEntityId: b._id, sentAt: receipt.sentAt, deliveryReceiptAt: suppressed ? undefined : Date.now(), readAt: receipt.outcome === 'opened' ? Date.now() : undefined, errorMessage: suppressed ? 'Resend suppressed' : undefined });
      stats.sent++;
      if (!suppressed) stats.delivered++;
      if (receipt.outcome === 'opened') stats.opened = (stats.opened ?? 0) + 1;
      repaired++;
    }
    await ctx.db.patch(b._id, { stats, lastActivityAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.broadcasts.finishSending, { broadcastId: b._id });
    return { repaired };
  },
});

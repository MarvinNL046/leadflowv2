import { v } from 'convex/values';
import { action, internalAction, internalQuery, internalMutation, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

export const config = internalQuery({
  args: { broadcastId: v.id('broadcasts') },
  returns: v.object({ workspaceId: v.id('workspaces'), segmentId: v.id('segments'), rules: v.object({ match: v.union(v.literal('all'), v.literal('any')), conditions: v.array(v.object({ field: v.string(), op: v.string(), value: v.any() })) }) }),
  handler: async (ctx, { broadcastId }) => {
    const b = await ctx.db.get(broadcastId);
    if (!b) throw new Error('Campagne niet gevonden.');
    const segment = await ctx.db.get(b.segmentId);
    if (!segment || segment.workspaceId !== b.workspaceId) throw new Error('De doelgroep van deze campagne bestaat niet meer. Kies bij Mail bewerken een geldige doelgroep.');
    return { workspaceId: b.workspaceId, segmentId: b.segmentId, rules: segment.rules };
  },
});

export const saveCount = internalMutation({
  args: { broadcastId: v.id('broadcasts'), segmentId: v.id('segments'), rules: v.string(), count: v.number(), countedAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    const segment = await ctx.db.get(args.segmentId);
    if (!b || b.segmentId !== args.segmentId || !segment || segment.workspaceId !== b.workspaceId || JSON.stringify(segment.rules) !== args.rules) return false;
    if ((b.audienceCountedAt ?? 0) > args.countedAt) return false;
    await ctx.db.patch(b._id, { audienceCount: args.count, audienceCountedAt: args.countedAt, audienceRules: args.rules, audienceError: undefined });
    return true;
  },
});

export const recordError = internalMutation({
  args: { broadcastId: v.id('broadcasts'), startedAt: v.number(), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (b && (b.status === 'draft' || b.status === 'scheduled') && (b.audienceCountedAt ?? 0) <= args.startedAt) {
      await ctx.db.patch(b._id, { audienceError: args.error.slice(0, 400), audienceCount: undefined, audienceCountedAt: undefined });
    }
    return null;
  },
});

/** Complete paginated count, using exactly the sending resolver and normalized dedupe. */
export const count = action({
  args: { broadcastId: v.id('broadcasts') },
  returns: v.object({ count: v.number(), countedAt: v.number() }),
  handler: async (ctx, args): Promise<{ count: number; countedAt: number }> => {
    await ctx.runQuery(internal.broadcasts.assertBroadcastAccess, args);
    const startedAt = Date.now();
    try { return await calculate(ctx, args.broadcastId); }
    catch (err) {
      await ctx.runMutation(internal.broadcastAudience.recordError, { ...args, startedAt, error: err instanceof Error ? err.message : 'Ontvangers tellen mislukt.' });
      throw err;
    }
  },
});

export const refresh = internalAction({
  args: { broadcastId: v.id('broadcasts') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const startedAt = Date.now();
    try { await calculate(ctx, args.broadcastId); }
    catch (err) { await ctx.runMutation(internal.broadcastAudience.recordError, { ...args, startedAt, error: err instanceof Error ? err.message : 'Ontvangers tellen mislukt.' }); }
    return null;
  },
});

async function calculate(ctx: ActionCtx, broadcastId: Id<'broadcasts'>): Promise<{ count: number; countedAt: number }> {
    const config = await ctx.runQuery(internal.broadcastAudience.config, { broadcastId });
    const countedAt = Date.now();
    const addresses = new Set<string>();
    let cursor: string | null = null;
    let scannedPages = 0;
    do {
      const page: { recipients: Array<{ contactId: Id<'contacts'>; email: string }>; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.segments.resolvePage, { workspaceId: config.workspaceId, rules: config.rules, cursor, numItems: 200 });
      for (const r of page.recipients) addresses.add(r.email.trim().toLowerCase());
      if (page.isDone) break;
      cursor = page.continueCursor;
      if (++scannedPages > 500) throw new Error('Deze doelgroep is te groot om nu volledig te tellen. Er is geen gedeeltelijk aantal opgeslagen.');
    } while (true);
    const saved = await ctx.runMutation(internal.broadcastAudience.saveCount, { broadcastId, segmentId: config.segmentId, rules: JSON.stringify(config.rules), count: addresses.size, countedAt });
    if (!saved) throw new Error('De doelgroep is tijdens het tellen gewijzigd. Bereken het aantal opnieuw.');
    return { count: addresses.size, countedAt };
}

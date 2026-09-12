import { v } from 'convex/values';
import { internalMutation, query, type MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { requireAdmin } from './admin';

const DAY = 86_400_000;
type Counter = 'views' | 'starts' | 'submitted' | 'verified';

export async function countHomepageEvent(ctx: MutationCtx, apiKeyId: Id<'marketplaceApiKeys'>, event: Counter) {
  const day = Math.floor(Date.now() / DAY) * DAY;
  const row = await ctx.db.query('leadgenDailyMetrics')
    .withIndex('by_source_day', q => q.eq('apiKeyId', apiKeyId).eq('day', day)).unique();
  if (row) await ctx.db.patch(row._id, { [event]: row[event] + 1 });
  else await ctx.db.insert('leadgenDailyMetrics', { apiKeyId, day, views: 0, starts: 0, submitted: 0, verified: 0, [event]: 1 });
}

export const recordBrowserEvent = internalMutation({
  args: { apiKeyId: v.id('marketplaceApiKeys'), event: v.union(v.literal('views'), v.literal('starts')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.apiKeyId);
    if (!key?.isActive) throw new Error('invalid_api_key');
    await countHomepageEvent(ctx, args.apiKeyId, args.event);
    return null;
  },
});

export const homepageFunnel = query({
  args: { sourceId: v.id('marketplaceApiKeys') },
  returns: v.object({ views: v.number(), starts: v.number(), submitted: v.number(), verified: v.number(), since: v.number(), firstMeasuredDay: v.union(v.number(),v.null()) }),
  handler: async (ctx, { sourceId }) => {
    await requireAdmin(ctx);
    const since = Math.floor(Date.now() / DAY) * DAY - 29 * DAY;
    const rows = await ctx.db.query('leadgenDailyMetrics')
      .withIndex('by_source_day', q => q.eq('apiKeyId', sourceId).gte('day', since)).take(31);
    return { since, firstMeasuredDay: rows[0]?.day ?? null,
      views: rows.reduce((sum,r) => sum+r.views,0), starts: rows.reduce((sum,r) => sum+r.starts,0),
      submitted: rows.reduce((sum,r) => sum+r.submitted,0), verified: rows.reduce((sum,r) => sum+r.verified,0) };
  },
});

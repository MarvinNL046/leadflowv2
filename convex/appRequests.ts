import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query, mutation } from './_generated/server';
import { requireWorkspacePermission } from './lib/permissions';
import { hasWorkspaceProviders } from './companyProviders';
import { requireAdmin } from './marketplace/admin';

export const product = v.union(v.literal('frostwork'), v.literal('cashflow'));
const state = v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected'));
const decision = v.union(v.literal('approved'), v.literal('rejected'));
const reviewFields = { status: state, reviewNote: v.union(v.string(), v.null()), reviewedAt: v.union(v.number(), v.null()), revision: v.number() };
// An application or approval is never a subscription or product entitlement.
export const status = query({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({ canRequest: v.boolean(), existingSuite: v.boolean(), requested: v.array(product), active: v.array(product), requests: v.array(v.object({ product, ...reviewFields })) }),
  handler: async (ctx, { workspaceId }) => {
    const { orgId, membership } = await requireWorkspacePermission(ctx, workspaceId);
    const rows = await ctx.db.query('appRequests').withIndex('by_orgId_and_product', q => q.eq('orgId', orgId)).take(3);
    const bindings = await ctx.db.query('suiteBindings').withIndex('by_orgId_and_product', q => q.eq('orgId', orgId)).take(3);
    return { canRequest: membership.role === 'owner', existingSuite: await hasWorkspaceProviders(ctx, workspaceId), requested: rows.map(r => r.product), active: bindings.filter(b => b.enabled && b.validUntil > Date.now()).map(b => b.product), requests: rows.map(r => ({ product: r.product, status: r.status ?? 'pending', reviewNote: r.reviewNote ?? null, reviewedAt: r.reviewedAt ?? null, revision: r.revision ?? 0 })) };
  },
});
export const request = mutation({
  args: { workspaceId: v.id('workspaces'), product }, returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId, membership } = await requireWorkspacePermission(ctx, args.workspaceId);
    if (membership.role !== 'owner') throw new ConvexError('Alleen de bedrijfseigenaar kan uitbreidingen aanvragen');
    if (await hasWorkspaceProviders(ctx, args.workspaceId)) return null;
    const existing = await ctx.db.query('appRequests').withIndex('by_orgId_and_product', q => q.eq('orgId', orgId).eq('product', args.product)).unique();
    if (!existing) await ctx.db.insert('appRequests', { orgId, product: args.product, requestedBy: userId, requestedAt: Date.now(), status: 'pending', revision: 0 });
    return null;
  },
});
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(v.object({ id: v.id('appRequests'), company: v.string(), product, requestedAt: v.number(), ...reviewFields })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db.query('appRequests').order('desc').paginate({ ...args.paginationOpts, numItems: Math.min(50, args.paginationOpts.numItems) });
    const page = await Promise.all(result.page.map(async r => ({ id: r._id, company: (await ctx.db.get(r.orgId))?.name ?? 'Verwijderd bedrijf', product: r.product, requestedAt: r.requestedAt, status: r.status ?? 'pending' as const, reviewNote: r.reviewNote ?? null, reviewedAt: r.reviewedAt ?? null, revision: r.revision ?? 0 })));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
export const review = mutation({
  args: { requestId: v.id('appRequests'), status: decision, note: v.string(), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const row = await ctx.db.get(args.requestId);
    if (!row) throw new ConvexError('Aanvraag niet gevonden');
    if ((row.revision ?? 0) !== args.expectedRevision) throw new ConvexError('Aanvraag is inmiddels gewijzigd. Bekijk de nieuwste beoordeling.');
    const note = args.note.trim();
    if (note.length < 5 || note.length > 500) throw new ConvexError('Gebruik een toelichting van 5 tot 500 tekens');
    const reviewedAt = Date.now(), revision = (row.revision ?? 0) + 1;
    await ctx.db.patch(row._id, { status: args.status, reviewNote: note, reviewedBy: actor, reviewedAt, revision });
    await ctx.db.insert('appRequestReviews', { requestId: row._id, actor, reviewedAt, status: args.status, note, revision });
    return null;
  },
});

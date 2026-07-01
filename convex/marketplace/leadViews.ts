import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireMarketplaceAccess } from "./access";

/**
 * Lead-view dedup tracking (ported from v1 src/lib/marketplace/
 * view-tracking.ts).
 *
 * v1 was a plain server helper called from a server component with
 * (leadId, orgId, userId) args. In Convex this MUST be a mutation
 * (queries can't write) and the orgId/userId are derived server-side from
 * the access gate — never accepted as client args. Inserts a view row
 * only if no view by the same (lead, user) was recorded in the last 5
 * minutes (prevents log bloat from rapid re-opens).
 */
export const trackLeadView = mutation({
	args: { leadId: v.id("marketplaceLeads") },
	handler: async (ctx, { leadId }): Promise<null> => {
		const { userId, orgId } = await requireMarketplaceAccess(ctx);
		const cutoff = Date.now() - 5 * 60 * 1000;

		const dup = await ctx.db
			.query("marketplaceLeadViews")
			.withIndex("by_lead_user", (q) =>
				q.eq("leadId", leadId).eq("userId", userId).gte("viewedAt", cutoff),
			)
			.first();
		if (dup) return null;

		await ctx.db.insert("marketplaceLeadViews", {
			leadId,
			orgId,
			userId,
			viewedAt: Date.now(),
		});
		return null;
	},
});

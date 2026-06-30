import type { QueryCtx } from "../_generated/server";
import type { Niche } from "./types";

/**
 * True if a lead with the same phone + niche arrived in the last 24
 * hours. Intake flags those as status='duplicate' so they don't clutter
 * the buyer feed.
 *
 * Ported from v1 src/lib/marketplace/dedup.ts. v1's drizzle query
 * filtered on `createdAt`; here we use the `by_phone_niche` index and
 * filter the 24h window on `_creationTime` (Convex's system timestamp,
 * which replaces the dropped `createdAt` column).
 */
export async function isDuplicateWithin24h(
	ctx: QueryCtx,
	phone: string,
	niche: Niche,
): Promise<boolean> {
	const cutoff = Date.now() - 24 * 60 * 60 * 1000;
	const existing = await ctx.db
		.query("marketplaceLeads")
		.withIndex("by_phone_niche", (q) =>
			q.eq("phone", phone).eq("niche", niche),
		)
		.filter((q) => q.gte(q.field("_creationTime"), cutoff))
		.first();
	return existing !== null;
}

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
	type MutationCtx,
	type QueryCtx,
	internalQuery,
	mutation,
	query,
} from "../_generated/server";

/**
 * Marketplace access gate (ported from v1 src/lib/marketplace/access.ts).
 *
 * v1 used a single resolved `ctx.org` from the request session. v2 is
 * multi-org per user, so we resolve the buyer org server-side: the first
 * org (by membership) whose `marketplaceEnabled` flag is true. We then
 * pick that org's default workspace (the auto-copy-to-CRM target in
 * Fase C). Every public marketplace query/mutation MUST call this FIRST.
 *
 * `orgId`/`userId`/`workspaceId` are derived from the authenticated
 * identity server-side — NEVER accepted as client args.
 */

export interface MarketplaceContext {
	userId: Id<"users">;
	orgId: Id<"orgs">;
	workspaceId: Id<"workspaces">;
}

/**
 * Throws if the current user has no marketplace-enabled org. Returns the
 * resolved buyer context on success.
 */
export async function requireMarketplaceAccess(
	ctx: QueryCtx,
): Promise<MarketplaceContext> {
	const userId = await getAuthUserId(ctx);
	if (!userId) {
		throw new Error("Not authenticated");
	}

	const memberships = await ctx.db
		.query("memberships")
		.withIndex("by_user_org", (q) => q.eq("userId", userId))
		.collect();

	for (const m of memberships) {
		const org = await ctx.db.get(m.orgId);
		if (!org?.marketplaceEnabled) continue;

		// Resolve the buyer workspace: the membership's own workspace if it
		// has one, else the org's default workspace.
		let workspaceId: Id<"workspaces"> | null = m.workspaceId ?? null;
		if (!workspaceId) {
			const defaultWorkspace = await ctx.db
				.query("workspaces")
				.withIndex("by_org", (q) => q.eq("orgId", org._id))
				.filter((q) => q.eq(q.field("isDefault"), true))
				.first();
			workspaceId = defaultWorkspace?._id ?? null;
		}
		if (!workspaceId) continue;

		return { userId, orgId: org._id, workspaceId };
	}

	throw new Error("marketplace_access_denied");
}

/**
 * Org-scoped membership guard sibling (mirrors contacts.ts
 * requireWorkspaceMembership). Asserts the current user is a member of
 * `orgId` and returns the membership for role checks. Throws otherwise.
 */
export async function requireOrgMembership(
	ctx: QueryCtx,
	orgId: Id<"orgs">,
) {
	const userId = await getAuthUserId(ctx);
	if (!userId) {
		throw new Error("Not authenticated");
	}
	const membership = await ctx.db
		.query("memberships")
		.withIndex("by_user_org", (q) =>
			q.eq("userId", userId).eq("orgId", orgId),
		)
		.first();
	if (!membership) {
		throw new Error("Not a member of this org");
	}
	return { userId, membership };
}

/**
 * Non-throwing boolean variant used by route layouts to decide whether
 * to redirect. Returns `{ ok: true, orgId }` when access is granted, else
 * `{ ok: false }`. Safe to expose — leaks no PII.
 */
export const marketplaceAccess = query({
	args: {},
	handler: async (
		ctx,
	): Promise<{ ok: true; orgId: Id<"orgs"> } | { ok: false }> => {
		try {
			const c = await requireMarketplaceAccess(ctx);
			return { ok: true as const, orgId: c.orgId };
		} catch {
			return { ok: false as const };
		}
	},
});

/**
 * Internal context resolver for the Stripe top-up action (`stripe.ts`).
 * Actions have no `ctx.db`, so the `"use node"` action calls this via
 * `ctx.runQuery` to resolve the authenticated buyer org/user/workspace
 * server-side. Identity is derived from the auth token inside the query —
 * never trusted from the action's client args.
 */
export const requireBuyer = internalQuery({
	args: {},
	handler: async (ctx): Promise<MarketplaceContext> => {
		return await requireMarketplaceAccess(ctx);
	},
});

/**
 * Enable the marketplace for the caller's org (owner/admin only). Sets
 * the `marketplaceEnabled` flag and creates an empty buyer-preferences
 * row so /feed/onboarding has a base to upsert into.
 *
 * v2 is multi-org: the caller passes the target `orgId`, and we assert
 * owner/admin membership on it (no client-trusted role).
 */
export const enableMarketplaceForCurrentOrg = mutation({
	args: { orgId: v.id("orgs") },
	handler: async (
		ctx: MutationCtx,
		{ orgId },
	): Promise<
		{ success: true } | { success: false; error: "forbidden" }
	> => {
		const { membership } = await requireOrgMembership(ctx, orgId);
		if (membership.role !== "owner" && membership.role !== "admin") {
			return { success: false as const, error: "forbidden" };
		}

		await ctx.db.patch(orgId, { marketplaceEnabled: true });

		// Create the empty preferences row if absent (single-row per org).
		const existing = await ctx.db
			.query("marketplaceBuyerPreferences")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.unique();
		if (!existing) {
			await ctx.db.insert("marketplaceBuyerPreferences", {
				orgId,
				niches: [],
				segments: ["b2c", "b2b"],
				preferredMode: "both",
				notifyOnNewLead: true,
				notifyChannel: "email",
				updatedAt: Date.now(),
			});
		}

		return { success: true as const };
	},
});

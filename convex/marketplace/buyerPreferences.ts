import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { type MutationCtx, mutation, query } from "../_generated/server";
import { requireMarketplaceAccess, requireMarketplaceManagement } from "./access";

/**
 * Buyer feed preferences + onboarding flag (ported from v1
 * src/lib/actions/marketplace/buyer-preferences.ts).
 *
 * One row per org (single-row enforced in the upsert via by_org lookup).
 * Array fields preserve v1's `undefined`(=accept all) vs `[]`(=accept
 * none) distinction — only fields present in the patch are written, so an
 * omitted optional array stays untouched.
 *
 * v1's `revalidatePath("/feed")` calls are dropped — Convex reactive
 * `useQuery` refreshes the UI automatically.
 */

const patchArgs = {
	niches: v.optional(v.array(v.string())),
	serviceTypes: v.optional(v.union(v.array(v.string()), v.null())),
	segments: v.optional(v.array(v.string())),
	regions: v.optional(v.array(v.string())),
	provinces: v.optional(v.union(v.array(v.string()), v.null())),
	postalCodePrefixes: v.optional(v.array(v.string())),
	preferredMode: v.optional(
		v.union(
			v.literal("exclusive"),
			v.literal("shared"),
			v.literal("both"),
		),
	),
	notifyOnNewLead: v.optional(v.boolean()),
	notifyChannel: v.optional(
		v.union(
			v.literal("email"),
			v.literal("whatsapp"),
			v.literal("both"),
			v.literal("none"),
		),
	),
};

type PatchArgs = {
	niches?: string[];
	serviceTypes?: string[] | null;
	segments?: string[];
	regions?: string[];
	provinces?: string[] | null;
	postalCodePrefixes?: string[];
	preferredMode?: "exclusive" | "shared" | "both";
	notifyOnNewLead?: boolean;
	notifyChannel?: "email" | "whatsapp" | "both" | "none";
};

/** Read the caller-org's preferences row (or null if none yet). */
export const getBuyerPreferences = query({
	args: {},
	handler: async (ctx): Promise<Doc<"marketplaceBuyerPreferences"> | null> => {
		const { orgId } = await requireMarketplaceAccess(ctx);
		return await ctx.db
			.query("marketplaceBuyerPreferences")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.unique();
	},
});

/**
 * Shared upsert helper so updateBuyerPreferences + completeOnboarding
 * share one transaction-safe write path. Only patches the fields present
 * in `patch` (preserving the undefined/[] distinction). Inserts defaults
 * on first write.
 */
async function upsertPreferences(
	ctx: MutationCtx,
	orgId: import("../_generated/dataModel").Id<"orgs">,
	patch: PatchArgs,
): Promise<void> {
	const existing = await ctx.db
		.query("marketplaceBuyerPreferences")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.unique();

	if (existing) {
		const {serviceTypes: _serviceTypes, provinces: _provinces, ...rest} = patch;
		await ctx.db.patch(existing._id, { ...rest,
			...(patch.serviceTypes !== undefined ? {serviceTypes: patch.serviceTypes ?? undefined} : {}),
			...(patch.provinces !== undefined ? {provinces: patch.provinces ?? undefined} : {}),
			...(patch.notifyOnNewLead === true ? {emailAlertsActivatedAt:Date.now()} : {}),
			updatedAt: Date.now() });
		return;
	}

	await ctx.db.insert("marketplaceBuyerPreferences", {
		orgId,
		niches: patch.niches ?? [],
		// Optional arrays: only set when explicitly given (undefined = all).
		...(patch.serviceTypes !== undefined
			? { serviceTypes: patch.serviceTypes ?? undefined }
			: {}),
		segments: patch.segments ?? ["b2c", "b2b"],
		...(patch.regions !== undefined ? { regions: patch.regions } : {}),
		...(patch.provinces !== undefined ? { provinces: patch.provinces ?? undefined } : {}),
		...(patch.postalCodePrefixes !== undefined
			? { postalCodePrefixes: patch.postalCodePrefixes }
			: {}),
		preferredMode: patch.preferredMode ?? "both",
		notifyOnNewLead: patch.notifyOnNewLead ?? true,
		emailAlertsActivatedAt: patch.notifyOnNewLead === true ? Date.now() : undefined,
		notifyChannel: patch.notifyChannel ?? "email",
		updatedAt: Date.now(),
	});
}

/** Upsert the caller-org's preferences (single-row per org). */
export const updateBuyerPreferences = mutation({
	args: patchArgs,
	handler: async (ctx, patch): Promise<{ success: true }> => {
		const { orgId } = await requireMarketplaceManagement(ctx);
		await upsertPreferences(ctx, orgId, patch);
		return { success: true as const };
	},
});

/**
 * Onboarding completion: requires ≥1 niche, upserts the prefs, then sets
 * `onboardingCompletedAt`. Throws if niches is empty (the form enforces
 * this; this is the server-side guard).
 */
export const completeOnboarding = mutation({
	args: {
		niches: v.array(v.string()),
		preferredMode: v.union(
			v.literal("exclusive"),
			v.literal("shared"),
			v.literal("both"),
		),
		serviceTypes: v.optional(v.union(v.array(v.string()),v.null())),
		provinces: v.optional(v.union(v.array(v.string()),v.null())),
		segments: v.optional(v.array(v.string())),
		regions: v.optional(v.array(v.string())),
	},
	handler: async (ctx, values): Promise<{ success: true }> => {
		const { orgId } = await requireMarketplaceManagement(ctx);
		if (values.niches.length === 0) {
			throw new Error("Kies minimaal één niche");
		}
		await upsertPreferences(ctx, orgId, values);

		// The upsert just guaranteed the row exists — fetch + stamp.
		const row = await ctx.db
			.query("marketplaceBuyerPreferences")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.unique();
		if (row) {
			await ctx.db.patch(row._id, { onboardingCompletedAt: Date.now() });
		}
		return { success: true as const };
	},
});

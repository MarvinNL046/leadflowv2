import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type QueryCtx, query } from "../_generated/server";
import { requireMarketplaceAccess } from "./access";
import { maskEmail, maskName, maskPhone } from "./mask";
import {
	type BuyerIntention,
	type JobSize,
	type LeadScore,
	NICHE_LABELS,
	type Niche,
	SEGMENT_LABELS,
	SERVICE_TYPE_LABELS,
	type Segment,
	type ServiceType,
} from "./types";

/**
 * Buyer feed (ported from v1 src/lib/actions/marketplace/buyer-feed.ts).
 *
 * Masking happens INSIDE these queries — raw firstName/lastName/email/
 * phone/full-postalCode NEVER appear in the returned DTO. Only the masked
 * forms + the postal-code PREFIX (first 4 chars) + full city leave the
 * server pre-purchase.
 *
 * The access gate (requireMarketplaceAccess) runs FIRST in every export.
 */

type BuyerMode = "exclusive" | "shared" | "both";

export interface MaskedLead {
	id: Id<"marketplaceLeads">;
	niche: Niche;
	nicheLabel: string;
	serviceType: ServiceType | null;
	serviceTypeLabel: string | null;
	segment: Segment;
	segmentLabel: string;
	region: string | null;
	score: LeadScore;
	city: string | null;
	postalCodePrefix: string | null;
	urgency: string | null;
	message: string | null;
	maskedName: string;
	maskedPhone: string;
	maskedEmail: string | null;
	phoneVerifiedAt: number | null;
	emailVerifiedAt: number | null;
	priceExclusiveCents: number;
	priceSharedCents: number;
	maxSharedBuyers: number;
	sharedSlotsAvailable: number;
	allowExclusive: boolean;
	allowShared: boolean;
	createdAt: number;
	projectType: string | null;
	projectDescription: string | null;
	jobSize: JobSize | null;
	buyerIntention: BuyerIntention | null;
	nicheData: Record<string, unknown> | null;
	photos: string[] | null;
	// pro-dashboard annotations (defaulted at the assembly site)
	purchaseCount: number;
	buyerStatus: string | null;
	purchaseId: Id<"marketplacePurchases"> | null;
}

/**
 * Build a masked DTO from a raw lead row. Strips all raw PII; only the
 * masked forms + postal-code prefix + full city survive.
 */
function toMaskedLead(
	lead: Doc<"marketplaceLeads">,
	sharedSlotsAvailable: number,
	allowExclusive: boolean,
	allowShared: boolean,
): MaskedLead {
	const serviceType = (lead.serviceType ?? null) as ServiceType | null;
	const segment = lead.segment as Segment;
	return {
		id: lead._id,
		niche: lead.niche as Niche,
		nicheLabel: NICHE_LABELS[lead.niche as Niche],
		serviceType,
		serviceTypeLabel: serviceType ? SERVICE_TYPE_LABELS[serviceType] : null,
		segment,
		segmentLabel: SEGMENT_LABELS[segment],
		region: lead.region ?? null,
		score: lead.score as LeadScore,
		city: lead.city ?? null,
		postalCodePrefix: lead.postalCode?.slice(0, 4) ?? null,
		urgency: lead.urgency ?? null,
		message: lead.message ?? null,
		maskedName: maskName(lead.firstName, lead.lastName),
		maskedPhone: maskPhone(lead.phone),
		maskedEmail: maskEmail(lead.email),
		phoneVerifiedAt: lead.phoneVerifiedAt ?? null,
		emailVerifiedAt: lead.emailVerifiedAt ?? null,
		priceExclusiveCents: lead.priceExclusiveCents,
		priceSharedCents: lead.priceSharedCents,
		maxSharedBuyers: lead.maxSharedBuyers,
		sharedSlotsAvailable,
		allowExclusive,
		allowShared,
		createdAt: lead._creationTime,
		projectType: lead.projectType ?? null,
		projectDescription: lead.projectDescription ?? null,
		jobSize: (lead.jobSize ?? null) as JobSize | null,
		buyerIntention: (lead.buyerIntention ?? null) as BuyerIntention | null,
		nicheData: (lead.nicheData ?? null) as Record<string, unknown> | null,
		photos: (lead.photos ?? null) as string[] | null,
		purchaseCount: 0,
		buyerStatus: null,
		purchaseId: null,
	};
}

/** Count shared/exclusive purchases for a lead (by_lead index). */
async function countPurchasesByMode(
	ctx: QueryCtx,
	leadId: Id<"marketplaceLeads">,
): Promise<{ exclusive: number; shared: number }> {
	const rows = await ctx.db
		.query("marketplacePurchases")
		.withIndex("by_lead", (q) => q.eq("leadId", leadId))
		.collect();
	let exclusive = 0;
	let shared = 0;
	for (const r of rows) {
		if (r.mode === "exclusive") exclusive++;
		else shared++;
	}
	return { exclusive, shared };
}

const feedArgs = {
	tab: v.optional(
		v.union(v.literal("beschikbaar"), v.literal("ontgrendeld")),
	),
	from: v.optional(v.string()),
	to: v.optional(v.string()),
	q: v.optional(v.string()),
	limit: v.optional(v.number()),
	offset: v.optional(v.number()),
};

export const getBuyerFeed = query({
	args: feedArgs,
	handler: async (ctx, options): Promise<MaskedLead[]> => {
		const { orgId } = await requireMarketplaceAccess(ctx);
		const limit = options.limit ?? 30;
		const offset = options.offset ?? 0;
		const tab = options.tab ?? "beschikbaar";

		const prefs = await ctx.db
			.query("marketplaceBuyerPreferences")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.unique();

		if (tab === "ontgrendeld") {
			return getOntgrendeldFeed(ctx, orgId, {
				limit,
				offset,
				from: options.from,
				to: options.to,
				q: options.q,
			});
		}

		const buyerNiches = (prefs?.niches as Niche[] | undefined) ?? [];
		// Empty niches → hard stop (onboarding enforces ≥1).
		if (buyerNiches.length === 0) return [];

		const preferredMode: BuyerMode =
			(prefs?.preferredMode as BuyerMode | undefined) ?? "both";
		const buyerServiceTypes =
			(prefs?.serviceTypes as ServiceType[] | undefined) ?? null;
		const buyerSegments =
			(prefs?.segments as Segment[] | undefined) ?? ["b2c", "b2b"];
		const buyerProvinces =
			(prefs?.provinces as string[] | undefined) ?? null;

		return getBeschikbaarFeed(
			ctx,
			orgId,
			{ limit, offset, from: options.from, to: options.to, q: options.q },
			{
				buyerNiches,
				preferredMode,
				buyerServiceTypes,
				buyerSegments,
				buyerProvinces,
			},
		);
	},
});

interface BeschikbaarPrefs {
	buyerNiches: Niche[];
	preferredMode: BuyerMode;
	buyerServiceTypes: ServiceType[] | null;
	buyerSegments: Segment[];
	buyerProvinces: string[] | null;
}

/** Parse a yyyy-mm-dd lower bound to epoch-ms (start of day). */
function fromBound(from?: string): number | undefined {
	if (!from) return undefined;
	const t = Date.parse(from);
	return Number.isNaN(t) ? undefined : t;
}

/** Parse a yyyy-mm-dd upper bound to epoch-ms (+1 day, exclusive-ish). */
function toBound(to?: string): number | undefined {
	if (!to) return undefined;
	const t = Date.parse(to);
	return Number.isNaN(t) ? undefined : t + 24 * 60 * 60 * 1000;
}

async function getBeschikbaarFeed(
	ctx: QueryCtx,
	orgId: Id<"orgs">,
	opts: { limit: number; offset: number; from?: string; to?: string; q?: string },
	prefs: BeschikbaarPrefs,
): Promise<MaskedLead[]> {
	// Step A — leads this org already purchased (excluded from feed).
	const purchased = await ctx.db
		.query("marketplacePurchases")
		.withIndex("by_buyer_purchased", (q) => q.eq("buyerOrgId", orgId))
		.collect();
	const purchasedIds = new Set(purchased.map((p) => p.leadId));

	const nicheSet = new Set<string>(prefs.buyerNiches);
	const segmentSet = new Set<string>(prefs.buyerSegments);
	const provinceSet =
		prefs.buyerProvinces && prefs.buyerProvinces.length > 0
			? new Set(prefs.buyerProvinces)
			: null;
	const qLower = opts.q ? opts.q.toLowerCase() : null;
	const lo = fromBound(opts.from);
	const hi = toBound(opts.to);

	// Step B — candidate scan. v1 used a single SQL query with
	// `status IN (published, sold_shared)` ordered by publishedAt desc and
	// LIMIT applied at the DB. Convex's index keys one status value, so we
	// scan both statuses (publishedAt desc) and merge-sort, applying every
	// pre-mode filter in JS, then slice [offset, offset+limit]. The LIMIT
	// is applied BEFORE the mode/serviceType post-filter (Step C) to
	// preserve v1's under-fill semantics.
	const STATUSES = ["published", "sold_shared"] as const;
	const matched: Doc<"marketplaceLeads">[] = [];
	for (const status of STATUSES) {
		const rows = await ctx.db
			.query("marketplaceLeads")
			.withIndex("by_status_published", (q) => q.eq("status", status))
			.order("desc")
			.collect();
		for (const lead of rows) {
			if (!nicheSet.has(lead.niche)) continue;
			if (!segmentSet.has(lead.segment)) continue;
			if (provinceSet && !(lead.province && provinceSet.has(lead.province)))
				continue;
			if (purchasedIds.has(lead._id)) continue;
			if (qLower) {
				const fn = (lead.firstName ?? "").toLowerCase();
				const ln = (lead.lastName ?? "").toLowerCase();
				if (!fn.includes(qLower) && !ln.includes(qLower)) continue;
			}
			if (lo !== undefined && lead._creationTime < lo) continue;
			if (hi !== undefined && lead._creationTime >= hi) continue;
			matched.push(lead);
		}
	}

	// Merge-sort the two status streams by publishedAt desc (createdAt as
	// tiebreak), then page BEFORE the mode/serviceType post-filter.
	matched.sort((a, b) => {
		const pa = a.publishedAt ?? a._creationTime;
		const pb = b.publishedAt ?? b._creationTime;
		if (pb !== pa) return pb - pa;
		return b._creationTime - a._creationTime;
	});
	const candidates = matched.slice(opts.offset, opts.offset + opts.limit);
	if (candidates.length === 0) return [];

	// Step C — per-candidate slot computation + mode/serviceType filter.
	const results: MaskedLead[] = [];
	for (const lead of candidates) {
		// service-type post-filter (null serviceType on lead always passes).
		if (
			prefs.buyerServiceTypes &&
			prefs.buyerServiceTypes.length > 0 &&
			lead.serviceType &&
			!prefs.buyerServiceTypes.includes(lead.serviceType as ServiceType)
		) {
			continue;
		}

		const counts = await countPurchasesByMode(ctx, lead._id);
		const maxShared = lead.maxSharedBuyers ?? 4;
		const sharedSlotsAvailable = Math.max(0, maxShared - counts.shared);

		const exclusiveActuallyAllowed = lead.allowExclusive && counts.shared === 0;
		const sharedActuallyAllowed = lead.allowShared && sharedSlotsAvailable > 0;

		if (prefs.preferredMode === "exclusive" && !exclusiveActuallyAllowed)
			continue;
		if (prefs.preferredMode === "shared" && !sharedActuallyAllowed) continue;
		if (!exclusiveActuallyAllowed && !sharedActuallyAllowed) continue;

		const masked = toMaskedLead(
			lead,
			sharedSlotsAvailable,
			exclusiveActuallyAllowed,
			sharedActuallyAllowed,
		);
		masked.purchaseCount = counts.exclusive + counts.shared;
		results.push(masked);
	}
	return results;
}

/**
 * Purchased ("ontgrendeld") tab. Fase C: join `by_buyer_purchased` →
 * leads and return UNMASKED DTOs (the buyer paid, so name/phone/email are
 * revealed) annotated with `buyerStatus` + `purchaseId`. Same `MaskedLead`
 * shape as the beschikbaar tab so the feed list renders uniformly; the
 * `masked*` fields just carry the real values here.
 */
async function getOntgrendeldFeed(
	ctx: QueryCtx,
	orgId: Id<"orgs">,
	opts: { limit: number; offset: number; from?: string; to?: string; q?: string },
): Promise<MaskedLead[]> {
	const purchases = await ctx.db
		.query("marketplacePurchases")
		.withIndex("by_buyer_purchased", (q) => q.eq("buyerOrgId", orgId))
		.order("desc")
		.take(opts.offset + opts.limit + 200);

	const qLower = opts.q ? opts.q.toLowerCase() : null;
	const lo = fromBound(opts.from);
	const hi = toBound(opts.to);

	const results: MaskedLead[] = [];
	for (const p of purchases.slice(opts.offset)) {
		if (results.length >= opts.limit) break;
		const lead = await ctx.db.get(p.leadId);
		if (!lead) continue;
		if (qLower) {
			const fn = (lead.firstName ?? "").toLowerCase();
			const ln = (lead.lastName ?? "").toLowerCase();
			if (!fn.includes(qLower) && !ln.includes(qLower)) continue;
		}
		if (lo !== undefined && p.purchasedAt < lo) continue;
		if (hi !== undefined && p.purchasedAt >= hi) continue;

		// Unmasked DTO (buyer owns it). Reuse the masked builder for the
		// non-PII fields, then overwrite the contact fields with real data.
		const dto = toMaskedLead(lead, 0, false, false);
		dto.maskedName =
			[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—";
		dto.maskedPhone = lead.phone ?? "—";
		dto.maskedEmail = lead.email ?? null;
		dto.buyerStatus = p.buyerStatus;
		dto.purchaseId = p._id;
		results.push(dto);
	}
	return results;
}

/**
 * Single masked lead detail (ported from v1 getMaskedLeadDetail). Returns
 * null if: the lead doesn't exist; the buyer's niche prefs don't cover it
 * (deep-link security); the lead is sold exclusively; or this org already
 * owns a purchase (owned leads are viewed in the purchased view).
 */
export const getMaskedLeadDetail = query({
	args: { leadId: v.id("marketplaceLeads") },
	handler: async (ctx, { leadId }): Promise<MaskedLead | null> => {
		const { orgId } = await requireMarketplaceAccess(ctx);

		const lead = await ctx.db.get(leadId);
		if (!lead) return null;

		const prefs = await ctx.db
			.query("marketplaceBuyerPreferences")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.unique();
		const buyerNiches = (prefs?.niches as Niche[] | undefined) ?? [];
		if (!buyerNiches.includes(lead.niche as Niche)) return null;

		const allPurchases = await ctx.db
			.query("marketplacePurchases")
			.withIndex("by_lead", (q) => q.eq("leadId", leadId))
			.collect();
		const sharedCount = allPurchases.filter((p) => p.mode === "shared").length;
		const hasExclusive = allPurchases.some((p) => p.mode === "exclusive");
		if (hasExclusive) return null;

		const ownPurchase = allPurchases.some((p) => p.buyerOrgId === orgId);
		if (ownPurchase) return null;

		const slotsLeft = Math.max(lead.maxSharedBuyers - sharedCount, 0);
		return toMaskedLead(
			lead,
			slotsLeft,
			lead.allowExclusive && sharedCount === 0,
			lead.allowShared && slotsLeft > 0,
		);
	},
});

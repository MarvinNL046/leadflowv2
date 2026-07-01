import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { isDuplicateWithin24h } from "./dedup";
import { computeLeadScore } from "./leadScore";
import { calculateLeadPrice, FALLBACK_RATE } from "./leadPricing";
import { isValidNlPhone, normalizePhone } from "./phone";
import { lookupProvinceByPostcode } from "./provinces";
import { lookupRegionByPostcode } from "./regions";
import {
	ALL_NICHES,
	isBuyerIntention,
	isJobSize,
	type Niche,
	type Segment,
	type ServiceType,
	nicheHasSubservices,
} from "./types";

/**
 * Core lead insertion (ported from v1 src/lib/marketplace/intake-helpers.ts
 * `insertMarketplaceLead`). Single-source so the http intake route can
 * never diverge on dedup / pricing / scoring. The httpAction does
 * wire-format validation first; this mutation re-validates business
 * rules and writes the row.
 */

const VALID_SERVICE_TYPES: ServiceType[] = ["install", "repair", "maintain"];
const VALID_SEGMENTS: Segment[] = ["b2c", "b2b"];

export const insertLead = internalMutation({
	args: {
		apiKeyId: v.id("marketplaceApiKeys"),
		niche: v.optional(v.string()),
		serviceType: v.optional(v.string()),
		segment: v.optional(v.string()),
		firstName: v.string(),
		lastName: v.string(),
		phone: v.string(),
		postalCode: v.string(),
		email: v.optional(v.string()),
		projectType: v.optional(v.string()),
		projectDescription: v.optional(v.string()),
		jobSize: v.optional(v.string()),
		buyerIntention: v.optional(v.string()),
		nicheData: v.optional(v.any()),
		photos: v.optional(v.array(v.string())),
		urgency: v.optional(v.string()),
		message: v.optional(v.string()),
		city: v.optional(v.string()),
		metadata: v.optional(v.any()),
	},
	handler: async (ctx, p) => {
		// 1. Load apiKey; reject if inactive.
		const apiKey = await ctx.db.get(p.apiKeyId);
		if (!apiKey || !apiKey.isActive) {
			throw new Error("api_key_inactive");
		}

		// 2. Resolve niche; must be a real niche AND in allowedNiches.
		const niche = (p.niche ?? apiKey.defaultNiche) as Niche;
		if (!(ALL_NICHES as string[]).includes(niche)) {
			throw new Error("invalid_niche");
		}
		const allowedNiches =
			apiKey.allowedNiches.length > 0
				? apiKey.allowedNiches
				: [apiKey.defaultNiche];
		if (!allowedNiches.includes(niche)) {
			throw new Error("niche_not_allowed");
		}

		// 3. serviceType — only valid on niches that subdivide.
		let serviceType: ServiceType | undefined;
		if (p.serviceType) {
			if (!VALID_SERVICE_TYPES.includes(p.serviceType as ServiceType)) {
				throw new Error("invalid_service_type");
			}
			if (!nicheHasSubservices(niche)) {
				throw new Error("niche_has_no_service_types");
			}
			serviceType = p.serviceType as ServiceType;
		}

		// segment — default b2c.
		let segment: Segment = "b2c";
		if (p.segment) {
			if (!VALID_SEGMENTS.includes(p.segment as Segment)) {
				throw new Error("invalid_segment");
			}
			segment = p.segment as Segment;
		}

		// names + postal (defense in depth — route checks these too).
		if (!p.firstName.trim() || !p.lastName.trim()) {
			throw new Error("missing_names");
		}
		if (!p.postalCode.trim()) {
			throw new Error("missing_postal_code");
		}

		// 4. Phone normalize + validate (NL mobile).
		const phoneNormalized = normalizePhone(p.phone);
		if (!phoneNormalized || !isValidNlPhone(phoneNormalized)) {
			throw new Error("invalid_phone");
		}

		// 5. Honeypot — metadata.hp_field non-empty string → rejected.
		const hp = (p.metadata as Record<string, unknown> | undefined)?.hp_field;
		const honeypotTripped = typeof hp === "string" && hp.length > 0;

		// 6. Dedup (24h phone + niche).
		const isDup = await isDuplicateWithin24h(ctx, phoneNormalized, niche);

		// 7. Score (3-signal rule). hasPhone is always true here.
		const safeJobSize = isJobSize(p.jobSize) ? p.jobSize : undefined;
		const safeIntent = isBuyerIntention(p.buyerIntention)
			? p.buyerIntention
			: undefined;
		const score = computeLeadScore({
			hasPhone: true,
			hasEmail: !!p.email,
			jobSize: safeJobSize,
			buyerIntention: safeIntent,
		});

		// 8. Status precedence.
		const status = honeypotTripped
			? ("rejected" as const)
			: isDup
				? ("duplicate" as const)
				: score === "low" && !apiKey.trusted
					? ("pending_review" as const)
					: ("published" as const);
		const now = Date.now();

		// 9. Pricing — look up rate via by_combo; fallback if no row.
		const rateRow = await ctx.db
			.query("marketplaceLeadRates")
			.withIndex("by_combo", (q) =>
				q
					.eq("niche", niche)
					.eq("serviceType", p.serviceType ?? "install")
					.eq("segment", p.segment ?? "b2c"),
			)
			.unique();
		const rate = rateRow
			? { minCents: rateRow.minCents, maxCents: rateRow.maxCents }
			: FALLBACK_RATE;
		const pricing = calculateLeadPrice(rate, safeJobSize, safeIntent);

		// 10. region/province/city derivation from postcode.
		const regionMatch = lookupRegionByPostcode(p.postalCode);
		const province = lookupProvinceByPostcode(p.postalCode) ?? undefined;

		// v2-scaffolding fields (validated; stored as undefined when absent).
		const projectType = p.projectType?.trim() || undefined;
		const projectDescription = p.projectDescription?.trim() || undefined;
		const nicheData =
			p.nicheData && typeof p.nicheData === "object" ? p.nicheData : undefined;
		const photos =
			Array.isArray(p.photos) && p.photos.every((u) => typeof u === "string")
				? p.photos
				: undefined;

		// 11. Insert the lead row.
		const leadId = await ctx.db.insert("marketplaceLeads", {
			apiKeyId: apiKey._id,
			niche,
			serviceType,
			segment,
			region: regionMatch?.region ?? undefined,
			province,
			projectType,
			projectDescription,
			jobSize: safeJobSize,
			buyerIntention: safeIntent,
			nicheData,
			photos,
			firstName: p.firstName.trim(),
			lastName: p.lastName.trim(),
			email: p.email?.trim() || undefined,
			phone: phoneNormalized,
			postalCode: p.postalCode.trim(),
			city: regionMatch?.city ?? p.city?.trim() ?? undefined,
			urgency: p.urgency ?? undefined,
			message: p.message?.trim() || undefined,
			metadata: p.metadata ?? undefined,
			score,
			status,
			priceExclusiveCents: pricing.exclusiveCents,
			priceSharedCents: pricing.sharedCents,
			maxSharedBuyers: pricing.maxSharedBuyers,
			allowExclusive: true,
			allowShared: true,
			publishedAt: status === "published" ? now : undefined,
		});

		// Fire-and-forget key-usage timestamp.
		await ctx.db.patch(apiKey._id, { lastUsedAt: now });

		return { ok: true as const, leadId, duplicate: isDup, status };
	},
});

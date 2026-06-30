import type { BuyerIntention, JobSize } from "./types";

/**
 * Lead pricing — the LIVE formula (ported verbatim from v1
 * src/lib/marketplace/lead-pricing.ts).
 *
 * In v1 this function did its own DB lookup of the rate row. Here the
 * rate is passed in (the DB read happens in the calling mutation, where
 * `ctx.db` lives), keeping this module pure + unit-testable. Pricing is
 * keyed on the niche×serviceType×segment rate range + intake signals;
 * score never affects price.
 */

export const BASIS_OFFSET_PCT = 0.21;
export const SIZE_UPLIFT_PCT: Record<JobSize, number> = {
	s: 0,
	m: 0.105,
	l: 0.21,
	xl: 0.21,
};
export const INTENT_UPLIFT_PCT = 0.29;
export const MAX_SHARED_BUYERS = 4;

export const FALLBACK_RATE = { minCents: 1500, maxCents: 3000 };

export type LeadRate = { minCents: number; maxCents: number };

export type LeadPriceOutput = {
	sharedCents: number;
	exclusiveCents: number;
	maxSharedBuyers: number;
};

export function calculateLeadPrice(
	rate: LeadRate,
	jobSize: JobSize | undefined,
	buyerIntention: BuyerIntention | string | undefined,
): LeadPriceOutput {
	const range = rate.maxCents - rate.minCents;
	const basis = rate.minCents + BASIS_OFFSET_PCT * range;
	const sizeUplift = SIZE_UPLIFT_PCT[jobSize ?? "s"] * range;
	const intentUplift = buyerIntention === "yes" ? INTENT_UPLIFT_PCT * range : 0;

	const sharedCents = Math.round(basis + sizeUplift + intentUplift);
	const exclusiveCents = sharedCents * MAX_SHARED_BUYERS; // plain ×4, NOT re-rounded

	return { sharedCents, exclusiveCents, maxSharedBuyers: MAX_SHARED_BUYERS };
}

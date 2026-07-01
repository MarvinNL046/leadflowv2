import type { BuyerIntention, JobSize, LeadScore } from "./types";

/**
 * Lead scoring — 3-signal count → bucket (ported verbatim from v1
 * src/lib/marketplace/lead-score.ts).
 *
 * At intake `hasPhone` is always true (invalid phones are rejected
 * earlier), so in practice `contactVerified ≡ hasEmail`.
 */

export type LeadScoreInput = {
	hasPhone: boolean;
	hasEmail: boolean;
	jobSize?: JobSize;
	buyerIntention?: BuyerIntention;
};

export function computeLeadScore(input: LeadScoreInput): LeadScore {
	const contactVerified = input.hasPhone && input.hasEmail;
	const seriousJob = input.jobSize === "l" || input.jobSize === "xl";
	const seriousIntent = input.buyerIntention === "yes";

	const positives = [contactVerified, seriousJob, seriousIntent].filter(
		Boolean,
	).length;

	if (positives === 3) return "high";
	if (positives === 2) return "medium";
	return "low";
}

import { describe, expect, it } from "vitest";
import {
	calculateLeadPrice,
	FALLBACK_RATE,
	MAX_SHARED_BUYERS,
} from "./leadPricing";

// Locked values from v1 lead-pricing behaviour, airco/install/b2c rate
// (min 1450, max 2830, range 1380). basis = 1450 + 0.21*1380 = 1739.8.
const AIRCO = { minCents: 1450, maxCents: 2830 };

describe("calculateLeadPrice — airco install/b2c (min1450 max2830)", () => {
	it("{s, no intent} → shared 1740", () => {
		const r = calculateLeadPrice(AIRCO, "s", undefined);
		expect(r.sharedCents).toBe(1740);
		expect(r.exclusiveCents).toBe(1740 * 4);
	});

	it("{m, no intent} → shared 1885", () => {
		expect(calculateLeadPrice(AIRCO, "m", undefined).sharedCents).toBe(1885);
	});

	it("{l, no intent} → shared 2030", () => {
		expect(calculateLeadPrice(AIRCO, "l", undefined).sharedCents).toBe(2030);
	});

	it("{s, yes intent} → shared 2140", () => {
		expect(calculateLeadPrice(AIRCO, "s", "yes").sharedCents).toBe(2140);
	});

	it("{l, yes intent} → shared 2430", () => {
		expect(calculateLeadPrice(AIRCO, "l", "yes").sharedCents).toBe(2430);
	});

	it("{xl, yes intent} → shared 2430 (xl uplift == l uplift)", () => {
		expect(calculateLeadPrice(AIRCO, "xl", "yes").sharedCents).toBe(2430);
	});
});

describe("calculateLeadPrice — invariants", () => {
	it("exclusive = shared × 4 always (plain multiply, not re-rounded)", () => {
		for (const jobSize of ["s", "m", "l", "xl"] as const) {
			for (const intent of [undefined, "no", "unknown", "yes"] as const) {
				const r = calculateLeadPrice(AIRCO, jobSize, intent);
				expect(r.exclusiveCents).toBe(r.sharedCents * 4);
				expect(r.maxSharedBuyers).toBe(MAX_SHARED_BUYERS);
			}
		}
	});

	it("undefined jobSize behaves like 's'", () => {
		expect(calculateLeadPrice(AIRCO, undefined, undefined).sharedCents).toBe(
			calculateLeadPrice(AIRCO, "s", undefined).sharedCents,
		);
	});

	it("undefined / 'no' / 'unknown' intent → no uplift (== 's' baseline)", () => {
		const base = calculateLeadPrice(AIRCO, "s", undefined).sharedCents;
		expect(calculateLeadPrice(AIRCO, "s", "no").sharedCents).toBe(base);
		expect(calculateLeadPrice(AIRCO, "s", "unknown").sharedCents).toBe(base);
		expect(calculateLeadPrice(AIRCO, "s", undefined).sharedCents).toBe(base);
	});
});

describe("calculateLeadPrice — FALLBACK_RATE (1500-3000)", () => {
	// range 1500; basis = 1500 + 0.21*1500 = 1815.
	it("{s, no intent} on fallback → shared 1815", () => {
		expect(
			calculateLeadPrice(FALLBACK_RATE, "s", undefined).sharedCents,
		).toBe(1815);
	});
	it("FALLBACK_RATE constant is 1500-3000", () => {
		expect(FALLBACK_RATE).toEqual({ minCents: 1500, maxCents: 3000 });
	});
});

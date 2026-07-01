import { internalMutation } from "../_generated/server";
import type { Niche, Segment, ServiceType } from "./types";

/**
 * Lead-rate seed (ported from v1 src/data/homedeal-rates.ts).
 *
 * Each row = a (niche × serviceType × segment) min/max cents range that
 * calculateLeadPrice() reads. `seedLeadRates` upserts idempotently on the
 * `by_combo` index (patch if the combo exists, else insert) so it is safe
 * to re-run. Niches with NO row here fall back to FALLBACK_RATE
 * (1500-3000) at pricing time: klusjesman, klusser, installateur.
 */

export type LeadRateSeed = {
	niche: Niche;
	serviceType: ServiceType;
	segment: Segment;
	minCents: number;
	maxCents: number;
};

export const HOMEDEAL_LEAD_RATES: LeadRateSeed[] = [
	// === Airco ===
	{ niche: "airco", serviceType: "install", segment: "b2c", minCents: 1450, maxCents: 2830 },
	{ niche: "airco", serviceType: "repair", segment: "b2c", minCents: 1200, maxCents: 1950 },
	{ niche: "airco", serviceType: "maintain", segment: "b2c", minCents: 1200, maxCents: 1950 },
	{ niche: "airco", serviceType: "install", segment: "b2b", minCents: 1450, maxCents: 2830 },
	{ niche: "airco", serviceType: "repair", segment: "b2b", minCents: 1600, maxCents: 2450 },
	{ niche: "airco", serviceType: "maintain", segment: "b2b", minCents: 1600, maxCents: 2450 },

	// === Architect ===
	{ niche: "architect", serviceType: "install", segment: "b2c", minCents: 1950, maxCents: 2900 },

	// === Asbest ===
	{ niche: "asbest", serviceType: "install", segment: "b2c", minCents: 1900, maxCents: 2850 },
	{ niche: "asbest", serviceType: "maintain", segment: "b2c", minCents: 1500, maxCents: 2350 },

	// === Badkamer verbouwen ===
	{ niche: "badkamer_verbouwen", serviceType: "install", segment: "b2c", minCents: 2400, maxCents: 3500 },
	{ niche: "badkamer_verbouwen", serviceType: "repair", segment: "b2c", minCents: 1350, maxCents: 2150 },

	// === Carport ===
	{ niche: "carport", serviceType: "install", segment: "b2c", minCents: 1650, maxCents: 2500 },

	// === CV-ketel ===
	{ niche: "cv_ketel", serviceType: "install", segment: "b2c", minCents: 1900, maxCents: 2850 },
	{ niche: "cv_ketel", serviceType: "maintain", segment: "b2c", minCents: 1250, maxCents: 2000 },
	{ niche: "cv_ketel", serviceType: "repair", segment: "b2c", minCents: 1250, maxCents: 2000 },

	// === Dakdekker ===
	{ niche: "dakdekker", serviceType: "install", segment: "b2c", minCents: 2150, maxCents: 3150 },
	{ niche: "dakdekker", serviceType: "repair", segment: "b2c", minCents: 1250, maxCents: 2000 },
	{ niche: "dakdekker", serviceType: "maintain", segment: "b2c", minCents: 1750, maxCents: 2650 },

	// === Dakkapel ===
	{ niche: "dakkapel", serviceType: "install", segment: "b2c", minCents: 2900, maxCents: 3900 },

	// === Elektricien ===
	{ niche: "elektricien", serviceType: "repair", segment: "b2c", minCents: 1150, maxCents: 1850 },
	{ niche: "elektricien", serviceType: "install", segment: "b2c", minCents: 1650, maxCents: 2500 },

	// === Garagedeur ===
	{ niche: "garagedeur", serviceType: "install", segment: "b2c", minCents: 1500, maxCents: 2350 },

	// === Gevelwerk ===
	{ niche: "gevelwerk", serviceType: "install", segment: "b2c", minCents: 1600, maxCents: 3090 },
	{ niche: "gevelwerk", serviceType: "maintain", segment: "b2c", minCents: 1900, maxCents: 2850 },

	// === Glaszetter ===
	{ niche: "glaszetter", serviceType: "install", segment: "b2c", minCents: 1500, maxCents: 2950 },
	{ niche: "glaszetter", serviceType: "repair", segment: "b2c", minCents: 950, maxCents: 1600 },

	// === Hekwerk ===
	{ niche: "hekwerk", serviceType: "install", segment: "b2c", minCents: 1650, maxCents: 2500 },

	// === Alarmsysteem ===
	{ niche: "alarmsysteem", serviceType: "install", segment: "b2c", minCents: 2000, maxCents: 3000 },
	{ niche: "alarmsysteem", serviceType: "install", segment: "b2b", minCents: 2900, maxCents: 3900 },

	// === Isolatie ===
	{ niche: "isolatie", serviceType: "install", segment: "b2c", minCents: 2500, maxCents: 3900 },

	// === Kozijnen ===
	{ niche: "kozijnen", serviceType: "install", segment: "b2c", minCents: 1800, maxCents: 3900 },

	// === Laadpaal ===
	{ niche: "laadpaal", serviceType: "install", segment: "b2b", minCents: 2400, maxCents: 3500 },
	{ niche: "laadpaal", serviceType: "install", segment: "b2c", minCents: 2400, maxCents: 3500 },

	// === Ongedierte ===
	{ niche: "ongedierte", serviceType: "install", segment: "b2c", minCents: 1500, maxCents: 2350 },

	// === Schilder ===
	{ niche: "schilder", serviceType: "install", segment: "b2c", minCents: 1600, maxCents: 3350 },

	// === Serre ===
	{ niche: "serre", serviceType: "install", segment: "b2c", minCents: 2400, maxCents: 3500 },

	// === Stukadoor ===
	{ niche: "stukadoor", serviceType: "install", segment: "b2c", minCents: 1360, maxCents: 3090 },

	// === Tegelzetter ===
	{ niche: "tegelzetter", serviceType: "install", segment: "b2c", minCents: 1190, maxCents: 2900 },

	// === Thuisbatterij ===
	{ niche: "thuisbatterij", serviceType: "install", segment: "b2c", minCents: 1700, maxCents: 2600 },
	// Optional completeness rows (match airco pattern; covers b2b + repair/maintain
	// intakes for thuisbatterij, which is a NICHES_WITH_SUBSERVICES niche).
	{ niche: "thuisbatterij", serviceType: "install", segment: "b2b", minCents: 1700, maxCents: 2600 },
	{ niche: "thuisbatterij", serviceType: "repair", segment: "b2c", minCents: 1400, maxCents: 2100 },
	{ niche: "thuisbatterij", serviceType: "maintain", segment: "b2c", minCents: 1400, maxCents: 2100 },

	// === Timmerman ===
	{ niche: "timmerman", serviceType: "install", segment: "b2c", minCents: 1300, maxCents: 2050 },

	// === Traprenovatie ===
	{ niche: "traprenovatie", serviceType: "install", segment: "b2c", minCents: 1900, maxCents: 2850 },

	// === Tuin (split across niches) ===
	{ niche: "hovenier", serviceType: "install", segment: "b2c", minCents: 2000, maxCents: 3800 },
	{ niche: "hovenier", serviceType: "maintain", segment: "b2c", minCents: 1250, maxCents: 2500 },
	{ niche: "tuinadvies", serviceType: "install", segment: "b2c", minCents: 2000, maxCents: 3800 },
	{ niche: "stratenmaker", serviceType: "install", segment: "b2c", minCents: 1600, maxCents: 3090 },

	// === Ventilatie ===
	{ niche: "ventilatie", serviceType: "install", segment: "b2c", minCents: 1800, maxCents: 2700 },
	{ niche: "ventilatie", serviceType: "repair", segment: "b2c", minCents: 1500, maxCents: 2350 },
	{ niche: "ventilatie", serviceType: "maintain", segment: "b2c", minCents: 1500, maxCents: 2350 },

	// === Verbouwing + aanbouw ===
	{ niche: "verbouwing", serviceType: "install", segment: "b2c", minCents: 2400, maxCents: 3500 },
	{ niche: "aanbouw", serviceType: "install", segment: "b2c", minCents: 2400, maxCents: 3500 },

	// === Gietvloer ===
	{ niche: "gietvloer", serviceType: "install", segment: "b2c", minCents: 1500, maxCents: 2350 },

	// === Vloerverwarming ===
	{ niche: "vloerverwarming", serviceType: "install", segment: "b2c", minCents: 1450, maxCents: 2830 },

	// === Vochtbestrijding ===
	{ niche: "vochtbestrijding", serviceType: "install", segment: "b2c", minCents: 1500, maxCents: 2350 },
	{ niche: "vochtbestrijding", serviceType: "repair", segment: "b2c", minCents: 900, maxCents: 1550 },

	// === Warmtepomp ===
	{ niche: "warmtepomp", serviceType: "install", segment: "b2c", minCents: 2800, maxCents: 3900 },
	{ niche: "warmtepomp", serviceType: "maintain", segment: "b2c", minCents: 1000, maxCents: 1700 },

	// === Loodgieter ===
	{ niche: "loodgieter", serviceType: "install", segment: "b2c", minCents: 1500, maxCents: 2350 },
	{ niche: "loodgieter", serviceType: "repair", segment: "b2c", minCents: 1500, maxCents: 2350 },

	// === Zonnepanelen ===
	{ niche: "zonnepanelen", serviceType: "install", segment: "b2c", minCents: 3350, maxCents: 3900 },
	{ niche: "zonnepanelen", serviceType: "maintain", segment: "b2c", minCents: 1000, maxCents: 1700 },

	// === Zonwering ===
	{ niche: "zonwering", serviceType: "install", segment: "b2c", minCents: 1600, maxCents: 2930 },
	{ niche: "zonwering", serviceType: "maintain", segment: "b2c", minCents: 1900, maxCents: 2850 },

	// === Niches without a HomeDeal source — FALLBACK-equivalent values ===
	{ niche: "rioolservice", serviceType: "repair", segment: "b2c", minCents: 1500, maxCents: 3000 },
	{ niche: "rioolservice", serviceType: "maintain", segment: "b2c", minCents: 1500, maxCents: 3000 },
	{ niche: "schoorsteenveger", serviceType: "maintain", segment: "b2c", minCents: 1500, maxCents: 3000 },
	{ niche: "slotenmaker", serviceType: "install", segment: "b2c", minCents: 1500, maxCents: 3000 },
	{ niche: "slotenmaker", serviceType: "repair", segment: "b2c", minCents: 1500, maxCents: 3000 },
	{ niche: "verhuizen", serviceType: "install", segment: "b2c", minCents: 1500, maxCents: 3000 },
	{ niche: "glazenwasser", serviceType: "maintain", segment: "b2c", minCents: 1500, maxCents: 3000 },
	{ niche: "veranda", serviceType: "install", segment: "b2c", minCents: 2400, maxCents: 3500 },
	{ niche: "waterontharder", serviceType: "install", segment: "b2c", minCents: 1500, maxCents: 3000 },
];

/**
 * Idempotent seed of the lead-rate matrix. Upserts each row on the
 * `by_combo` index (Convex has no unique constraint → lookup-before-write).
 * Re-running patches existing combos in place. Returns the insert/update
 * tally so the caller can verify the seed.
 */
export const seedLeadRates = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		let inserted = 0;
		let updated = 0;

		for (const rate of HOMEDEAL_LEAD_RATES) {
			const existing = await ctx.db
				.query("marketplaceLeadRates")
				.withIndex("by_combo", (q) =>
					q
						.eq("niche", rate.niche)
						.eq("serviceType", rate.serviceType)
						.eq("segment", rate.segment),
				)
				.unique();

			if (existing) {
				await ctx.db.patch(existing._id, {
					minCents: rate.minCents,
					maxCents: rate.maxCents,
					updatedAt: now,
				});
				updated++;
			} else {
				await ctx.db.insert("marketplaceLeadRates", {
					niche: rate.niche,
					serviceType: rate.serviceType,
					segment: rate.segment,
					minCents: rate.minCents,
					maxCents: rate.maxCents,
					updatedAt: now,
				});
				inserted++;
			}
		}

		return { inserted, updated, total: HOMEDEAL_LEAD_RATES.length };
	},
});

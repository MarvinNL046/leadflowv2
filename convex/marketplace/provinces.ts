/**
 * NL province constants + PC4 lookup (ported from v1
 * src/lib/marketplace/provinces.ts).
 *
 * Lookup is O(1) via PC4_TO_PROVINCE Record (9000 explicit entries
 * covering [1000, 9999] inclusive). PC4s in INFERRED_PC4S didn't appear
 * in the source scrape and were assigned via nearest-neighbor — these
 * correspond to PC4 numbers that aren't actually used in the Dutch postal
 * system, so in practice no real lead will hit them.
 */
import { INFERRED_PC4S, PC4_TO_PROVINCE } from "./provincesData";

export type NlProvince =
	| "Groningen"
	| "Friesland"
	| "Drenthe"
	| "Overijssel"
	| "Flevoland"
	| "Gelderland"
	| "Utrecht"
	| "Noord-Holland"
	| "Zuid-Holland"
	| "Zeeland"
	| "Noord-Brabant"
	| "Limburg";

export const ALL_NL_PROVINCES: NlProvince[] = [
	"Groningen",
	"Friesland",
	"Drenthe",
	"Overijssel",
	"Flevoland",
	"Gelderland",
	"Utrecht",
	"Noord-Holland",
	"Zuid-Holland",
	"Zeeland",
	"Noord-Brabant",
	"Limburg",
];

export function lookupProvinceByPostcode(
	postalCode: string | null | undefined,
): NlProvince | null {
	if (!postalCode) return null;
	const digits = postalCode.trim().replace(/\D/g, "").slice(0, 4);
	if (digits.length !== 4) return null;
	return PC4_TO_PROVINCE[digits] ?? null;
}

export function isNlProvince(value: string): value is NlProvince {
	return (ALL_NL_PROVINCES as string[]).includes(value);
}

/** True if the PC4 was inferred via nearest-neighbor (not in source). */
export function isInferredPc4(pc4: string): boolean {
	return INFERRED_PC4S.has(pc4);
}

// Re-export for callers that want direct Record access (e.g. pre-computed
// buckets in feed queries).
export { INFERRED_PC4S, PC4_TO_PROVINCE };

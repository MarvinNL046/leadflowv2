/**
 * NL phone normalisation + validation (ported verbatim from v1
 * src/lib/marketplace/phone.ts). Used by the intake API to reject bogus
 * numbers and to store everything in a canonical +31xxxxxxxxx format so
 * dedup queries work.
 *
 * NB this is the marketplace-specific strict validator (requires an NL
 * MOBILE number). It is intentionally separate from convex/lib/phone.ts,
 * which is the lenient CRM E.164 normaliser used elsewhere.
 */

export function normalizePhone(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const digits = raw.replace(/[^\d+]/g, "");
	if (!digits) return null;

	let result: string;
	if (digits.startsWith("+31")) {
		result = digits;
	} else if (digits.startsWith("0031")) {
		result = `+${digits.slice(2)}`;
	} else if (digits.startsWith("31") && digits.length >= 11) {
		result = `+${digits}`;
	} else if (digits.startsWith("0") && digits.length >= 10) {
		result = `+31${digits.slice(1)}`;
	} else {
		return null;
	}

	if (!/^\+31\d{9}$/.test(result)) return null;
	return result;
}

export function isValidNlPhone(normalized: string | null): boolean {
	if (!normalized) return false;
	// NL mobile numbers: +316xxxxxxxx
	return /^\+316\d{8}$/.test(normalized);
}

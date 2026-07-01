/**
 * Pure masking helpers used server-side to produce the "blurred" lead
 * view that buyers see before purchase. Masking happens server-side —
 * full contact data NEVER leaves the server unless the purchase check
 * passes. Ported VERBATIM from v1 src/lib/marketplace/mask.ts.
 */

export function maskName(
	firstName?: string | null,
	lastName?: string | null,
): string {
	const f = (firstName ?? "").trim();
	const l = (lastName ?? "").trim();
	if (!f && !l) return "—";
	const mf = f ? `${f[0]}${"*".repeat(Math.max(f.length - 1, 2))}` : "";
	const ml = l ? `${l[0]}${"*".repeat(Math.max(l.length - 1, 2))}` : "";
	return [mf, ml].filter(Boolean).join(" ");
}

export function maskPhone(phone?: string | null): string {
	const p = (phone ?? "").trim();
	if (!p) return "—";
	if (p.length < 6) return "***";

	if (p.startsWith("+31")) {
		const rest = p.slice(3).replace(/\D/g, "");
		const last2 = rest.slice(-2);
		const firstDigit = rest[0] ?? "";
		return `+31 ${firstDigit}****${last2}`;
	}

	const digits = p.replace(/\D/g, "");
	const last2 = digits.slice(-2);
	const prefix = digits.slice(0, 2);
	return `${prefix}****${last2}`;
}

export function maskEmail(email?: string | null): string | null {
	if (!email) return null;
	const [local, domain] = email.split("@");
	if (!local || !domain) return email;
	return `${local[0]}**@${domain}`;
}

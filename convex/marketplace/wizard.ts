import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { hashApiKey } from "./apiKeys";

/**
 * Wizard-OTP backend (v1-compat). De SEO-sites (aircooffertelimburg.nl
 * e.d.) praten via hun eigen /api/lead/* proxies tegen
 * /api/intake/wizard/{start,send-code,verify} — die http-routes leven in
 * http.ts en roepen deze internal functies aan. Semantiek is 1:1 geport
 * van v1 (wetryleadflow) zodat de sites alleen LEADFLOW_BASE_URL +
 * LEADFLOW_API_KEY hoeven om te zetten.
 *
 * Codes staan uitsluitend als sha256-hash in de rij. Met env
 * WIZARD_DEBUG=1 (alleen dev!) komen de klare codes in het
 * send-code-response terug, zodat de flow zonder echte SMS/mail te
 * testen is — spiegel van v1's NODE_ENV-gedrag.
 */

export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_RESENDS = 3;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
const START_RATE_LIMIT_PER_HOUR = 5;

/** Crypto-random 6-cijferige code die nooit met 0 begint (v1-parity). */
export function generateCode(): string {
	const digits = crypto.getRandomValues(new Uint8Array(OTP_CODE_LENGTH));
	const first = 1 + (digits[0] % 9);
	let rest = "";
	for (let i = 1; i < OTP_CODE_LENGTH; i++) rest += (digits[i] % 10).toString();
	return `${first}${rest}`;
}

/** sha256-hex van een OTP-code — zelfde vorm als v1's hashCode. */
export function hashCode(code: string): Promise<string> {
	return hashApiKey(code);
}

/** amount_rooms → jobSize (v1's deriveJobSize, wizard-only verrijking). */
export function deriveJobSize(
	amountRooms: unknown,
): "s" | "m" | "l" | "xl" | null {
	if (typeof amountRooms !== "number" || amountRooms < 1) return null;
	if (amountRooms === 1) return "s";
	if (amountRooms === 2) return "m";
	if (amountRooms <= 4) return "l";
	return "xl";
}

// ── START ────────────────────────────────────────────────────────────────

/**
 * Maakt de verificatierij aan (nog géén dispatch — dat doet send-code,
 * zodat verlaten funnels geen SMS kosten). Retourneert rateLimited bij
 * >5 starts/uur vanaf hetzelfde IP (v1-parity).
 */
export const start = internalMutation({
	args: {
		apiKeyId: v.id("marketplaceApiKeys"),
		niche: v.string(),
		phone: v.string(), // reeds genormaliseerd door de http-route
		email: v.string(), // reeds genormaliseerd (lowercase)
		payload: v.any(),
		metadata: v.optional(v.any()),
		ip: v.optional(v.string()),
		userAgent: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Rate-limit per IP: max 5 starts in het afgelopen uur.
		if (args.ip) {
			const hourAgo = Date.now() - 60 * 60 * 1000;
			const recent = await ctx.db
				.query("leadVerifications")
				.withIndex("by_ip", (q) => q.eq("ip", args.ip))
				.order("desc")
				.take(START_RATE_LIMIT_PER_HOUR + 1);
			const inWindow = recent.filter((r) => r._creationTime > hourAgo);
			if (inWindow.length >= START_RATE_LIMIT_PER_HOUR) {
				return { rateLimited: true as const };
			}
		}

		const token = crypto.randomUUID();
		const code = generateCode();
		const codeHash = await hashCode(code);
		const expiresAt = Date.now() + OTP_TTL_MINUTES * 60 * 1000;

		await ctx.db.insert("leadVerifications", {
			token,
			apiKeyId: args.apiKeyId,
			niche: args.niche,
			phone: args.phone,
			email: args.email,
			codeHash,
			payload: args.payload,
			metadata: args.metadata,
			expiresAt,
			attempts: 0,
			resends: 0,
			ip: args.ip,
			userAgent: args.userAgent,
		});

		return { rateLimited: false as const, token, expiresAt };
	},
});

// ── SEND-CODE ────────────────────────────────────────────────────────────

export const getByToken = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, { token }) =>
		ctx.db
			.query("leadVerifications")
			.withIndex("by_token", (q) => q.eq("token", token))
			.unique(),
});

/** Slaat nieuwe code-hashes op na een (deels) geslaagde dispatch. */
export const recordDispatch = internalMutation({
	args: {
		verificationId: v.id("leadVerifications"),
		phoneCodeHash: v.string(),
		emailCodeHash: v.string(),
		smsOk: v.boolean(),
		emailOk: v.boolean(),
	},
	handler: async (ctx, a) => {
		const row = await ctx.db.get(a.verificationId);
		if (!row) return;
		const sentAt = Date.now();
		await ctx.db.patch(a.verificationId, {
			...(a.smsOk ? { codeHash: a.phoneCodeHash, lastSentAt: sentAt } : {}),
			...(a.emailOk
				? { emailCodeHash: a.emailCodeHash, emailCodeSentAt: sentAt }
				: {}),
			resends: row.resends + 1,
		});
	},
});

// ── VERIFY ───────────────────────────────────────────────────────────────

/**
 * Atomair: attempts++, code vergelijken tegen beide kanalen, en de
 * uitkomst teruggeven. Promotie naar marketplaceLeads gebeurt daarna in
 * de http-route via intake.insertLead (hergebruik van dedup/score/prijs),
 * gevolgd door markPromoted.
 */
export const attemptVerify = internalMutation({
	args: {
		token: v.string(),
		apiKeyId: v.id("marketplaceApiKeys"),
		codeHash: v.string(),
	},
	handler: async (ctx, a) => {
		const row = await ctx.db
			.query("leadVerifications")
			.withIndex("by_token", (q) => q.eq("token", a.token))
			.unique();
		if (!row || row.apiKeyId !== a.apiKeyId) {
			return { outcome: "not_found" as const };
		}
		if (row.verifiedAt && row.phoneVerifiedAt && row.emailVerifiedAt) {
			return { outcome: "already_verified" as const };
		}
		if (row.expiresAt <= Date.now()) {
			return { outcome: "expired" as const };
		}
		if (row.attempts >= OTP_MAX_ATTEMPTS) {
			return { outcome: "too_many_attempts" as const };
		}

		const phoneMatch = a.codeHash === row.codeHash;
		const emailMatch = !!row.emailCodeHash && a.codeHash === row.emailCodeHash;
		await ctx.db.patch(row._id, { attempts: row.attempts + 1 });

		if (!phoneMatch && !emailMatch) {
			return {
				outcome: "invalid_code" as const,
				attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - (row.attempts + 1)),
			};
		}

		const matchedChannel = phoneMatch ? ("phone" as const) : ("email" as const);
		const verifiedTimestamp = Date.now();

		// Tweede kanaal op een al gepromoveerde lead: alleen stempels bijzetten.
		if (row.verifiedAt && row.promotedLeadId) {
			await ctx.db.patch(row._id, {
				...(phoneMatch && !row.phoneVerifiedAt
					? { phoneVerifiedAt: verifiedTimestamp }
					: {}),
				...(emailMatch && !row.emailVerifiedAt
					? { emailVerifiedAt: verifiedTimestamp }
					: {}),
			});
			const lead = await ctx.db.get(row.promotedLeadId);
			if (lead) {
				await ctx.db.patch(row.promotedLeadId, {
					...(phoneMatch ? { phoneVerifiedAt: verifiedTimestamp } : {}),
					...(emailMatch ? { emailVerifiedAt: verifiedTimestamp } : {}),
				});
			}
			return {
				outcome: "second_channel" as const,
				leadId: row.promotedLeadId,
				niche: row.niche,
				matchedChannel,
			};
		}

		return {
			outcome: "match" as const,
			verificationId: row._id,
			matchedChannel,
			niche: row.niche,
			payload: row.payload as Record<string, unknown>,
			metadata: row.metadata as Record<string, unknown> | undefined,
		};
	},
});

/** Zet na promotie de verified-stempels op verificatie én lead. */
export const markPromoted = internalMutation({
	args: {
		verificationId: v.id("leadVerifications"),
		leadId: v.id("marketplaceLeads"),
		matchedChannel: v.union(v.literal("phone"), v.literal("email")),
	},
	handler: async (ctx, a) => {
		const verifiedTimestamp = Date.now();
		const phoneMatch = a.matchedChannel === "phone";
		await ctx.db.patch(a.verificationId, {
			verifiedAt: verifiedTimestamp,
			...(phoneMatch
				? { phoneVerifiedAt: verifiedTimestamp }
				: { emailVerifiedAt: verifiedTimestamp }),
			promotedLeadId: a.leadId,
		});
		const lead = await ctx.db.get(a.leadId);
		if (lead) {
			await ctx.db.patch(a.leadId, {
				...(phoneMatch
					? { phoneVerifiedAt: verifiedTimestamp }
					: { emailVerifiedAt: verifiedTimestamp }),
			});
		}
	},
});

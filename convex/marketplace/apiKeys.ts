import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
	internalQuery,
	mutation,
	type QueryCtx,
} from "../_generated/server";
import { ALL_NICHES, marketplaceNiche } from "./types";

/**
 * Marketplace API key helpers (ported from v1 src/lib/marketplace/
 * api-keys.ts). Keys are stored hashed — we can verify an incoming bearer
 * but can't recover it once lost (GitHub PAT model).
 *
 * v1 used node `crypto.createHash`/`randomBytes`; here we use the Web
 * Crypto API (crypto.subtle / crypto.getRandomValues), which runs in
 * Convex' default V8 runtime — NO "use node".
 */

/** SHA-256 hex of the raw key (Web Crypto). */
export async function hashApiKey(raw: string): Promise<string> {
	const buf = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(raw),
	);
	return [...new Uint8Array(buf)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Raw key = "lmk_" + 32 hex chars (16 random bytes). */
function generateRawKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `lmk_${hex}`;
}

/** Throws unless the caller is an authenticated super-admin. */
async function requireSuperAdmin(ctx: QueryCtx) {
	const userId = await getAuthUserId(ctx);
	if (!userId) {
		throw new Error("Not authenticated");
	}
	const profile = await ctx.db
		.query("userProfiles")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.unique();
	if (!profile?.isSuperAdmin) {
		throw new Error("Super-admin only");
	}
	return userId;
}

/**
 * Mint a new platform intake API key. Super-admin only. Returns the raw
 * key ONCE — it is never stored in plaintext and can't be re-shown.
 */
export const mintApiKey = mutation({
	args: {
		name: v.string(),
		defaultNiche: marketplaceNiche,
		allowedNiches: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await requireSuperAdmin(ctx);

		// allowedNiches must all be real niches.
		const allowed = new Set(ALL_NICHES as string[]);
		for (const n of args.allowedNiches) {
			if (!allowed.has(n)) {
				throw new Error(`Unknown niche in allowedNiches: ${n}`);
			}
		}
		// defaultNiche should be reachable through allowedNiches (if any
		// were given). Empty allowedNiches = "only the defaultNiche".
		const allowedNiches =
			args.allowedNiches.length > 0
				? args.allowedNiches
				: [args.defaultNiche];

		// Generate a raw key whose hash doesn't collide (no unique
		// constraint → lookup-before-insert; regenerate on the rare hit).
		let rawKey = generateRawKey();
		let keyHash = await hashApiKey(rawKey);
		let collision = await ctx.db
			.query("marketplaceApiKeys")
			.withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
			.unique();
		while (collision) {
			rawKey = generateRawKey();
			keyHash = await hashApiKey(rawKey);
			collision = await ctx.db
				.query("marketplaceApiKeys")
				.withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
				.unique();
		}

		const keyPrefix = rawKey.slice(0, 12); // "lmk_xxxxxxxx" for display

		await ctx.db.insert("marketplaceApiKeys", {
			keyHash,
			keyPrefix,
			name: args.name,
			defaultNiche: args.defaultNiche,
			allowedNiches,
			isActive: true,
			createdByUserId: userId,
		});

		return { rawKey, keyPrefix };
	},
});

/** Deactivate a key. Super-admin only. */
export const revokeApiKey = mutation({
	args: { apiKeyId: v.id("marketplaceApiKeys") },
	handler: async (ctx, { apiKeyId }) => {
		await requireSuperAdmin(ctx);
		await ctx.db.patch(apiKeyId, { isActive: false });
		return { ok: true };
	},
});

/**
 * Internal lookup for the intake httpAction: find an ACTIVE key by its
 * sha256 hash. Returns the full row or null. (The httpAction hashes the
 * raw bearer with crypto.subtle, then calls this.)
 */
export const findActiveByHash = internalQuery({
	args: { keyHash: v.string() },
	handler: async (ctx, { keyHash }): Promise<Doc<"marketplaceApiKeys"> | null> => {
		const key = await ctx.db
			.query("marketplaceApiKeys")
			.withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
			.unique();
		if (!key || !key.isActive) return null;
		return key;
	},
});

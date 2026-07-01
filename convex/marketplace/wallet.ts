import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMarketplaceAccess } from "./access";

/**
 * Wallet model (ported from v1 src/lib/marketplace/wallet.ts).
 *
 * 1 credit = 1 cent. Currency is implicitly EUR (no `currency` column).
 * v1 ran the wallet read + balance update + ledger insert as a
 * non-atomic neon-http sequence with a reconciliation comment. In Convex
 * a single mutation IS the transaction, so `applyWalletDelta` is a plain
 * async helper that takes the caller's `ctx` and shares its transaction —
 * the debit, the wallet patch, and the ledger insert all commit together
 * (or not at all). It must NEVER be a separate mutation / ctx.runMutation,
 * which would reopen the race the spec is closing.
 */

/**
 * Threshold below which a wallet is considered "inactive" for the buyer
 * dashboard. At or below this balance the top-up banner is shown and the
 * purchase CTA is effectively unusable (typical lead prices are €15+).
 */
export const WALLET_INACTIVE_THRESHOLD_CENTS = 500;

/** Top-up bounds (cents): €10 min, €5000 max. */
export const TOPUP_MIN_CENTS = 1000;
export const TOPUP_MAX_CENTS = 500000;

export function isWalletInactive(balanceCents: number): boolean {
	return balanceCents <= WALLET_INACTIVE_THRESHOLD_CENTS;
}

export interface WalletDelta {
	orgId: Id<"orgs">;
	type: "topup" | "purchase" | "refund" | "admin_adjustment";
	/** SIGNED: positive = credit, negative = debit. */
	amountCents: number;
	referenceType?: string;
	referenceId?: string;
	notes?: string;
	createdByUserId?: Id<"users">;
}

/**
 * Fetch the wallet row for an org, lazily creating it (balance 0) if it
 * doesn't exist yet. MUTATION-only (queries can't write). Single-row per
 * org enforced via the `by_org` lookup (no unique constraint in Convex).
 */
export async function getOrCreateWallet(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
): Promise<Doc<"marketplaceWallets">> {
	const existing = await ctx.db
		.query("marketplaceWallets")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.unique();
	if (existing) return existing;

	const id = await ctx.db.insert("marketplaceWallets", {
		orgId,
		balanceCents: 0,
		updatedAt: Date.now(),
	});
	const created = await ctx.db.get(id);
	if (!created) throw new Error("wallet_create_failed");
	return created;
}

/**
 * Apply a signed delta to a wallet + append an audit row, IN the caller's
 * transaction (plain helper, NOT a mutation). Throws
 * `ConvexError({code:"insufficient_credits", shortfallCents})` if the
 * resulting balance would go negative — the caller catches it and maps to
 * a purchase error with shortfall info. Returns the new balance.
 */
export async function applyWalletDelta(
	ctx: MutationCtx,
	delta: WalletDelta,
): Promise<number> {
	const wallet = await getOrCreateWallet(ctx, delta.orgId);
	const newBalance = wallet.balanceCents + delta.amountCents;
	if (newBalance < 0) {
		throw new ConvexError({
			code: "insufficient_credits" as const,
			shortfallCents: -newBalance,
		});
	}

	const now = Date.now();
	await ctx.db.patch(wallet._id, {
		balanceCents: newBalance,
		updatedAt: now,
	});
	await ctx.db.insert("marketplaceWalletTransactions", {
		orgId: delta.orgId,
		type: delta.type,
		amountCents: delta.amountCents,
		balanceAfterCents: newBalance,
		referenceType: delta.referenceType,
		referenceId: delta.referenceId,
		notes: delta.notes,
		createdByUserId: delta.createdByUserId,
	});

	return newBalance;
}

/**
 * Credit a Stripe top-up to a wallet — IDEMPOTENT. The idempotency check
 * (lookup `by_ref` on referenceType="stripe_payment" + sessionId) and the
 * credit happen in the SAME mutation, so Convex OCC guarantees Stripe's
 * at-least-once webhook delivery can never double-credit: a concurrent
 * retry's read-set conflicts on the just-inserted ledger row and re-runs,
 * now seeing `alreadyProcessed`.
 *
 * Called only from the marketplace-stripe webhook (internal-first). The
 * webhook passes the Convex org/user `_id` strings from session metadata.
 */
export const creditTopupIdempotent = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.optional(v.id("users")),
		amountCents: v.number(),
		sessionId: v.string(),
	},
	handler: async (
		ctx,
		{ orgId, userId, amountCents, sessionId },
	): Promise<{ alreadyProcessed: boolean; balanceCents?: number }> => {
		const existing = await ctx.db
			.query("marketplaceWalletTransactions")
			.withIndex("by_ref", (q) =>
				q.eq("referenceType", "stripe_payment").eq("referenceId", sessionId),
			)
			.first();
		if (existing) {
			return { alreadyProcessed: true };
		}

		const balanceCents = await applyWalletDelta(ctx, {
			orgId,
			type: "topup",
			amountCents,
			referenceType: "stripe_payment",
			referenceId: sessionId,
			notes: `Stripe Checkout opwaardering €${(amountCents / 100).toFixed(2)}`,
			createdByUserId: userId,
		});
		return { alreadyProcessed: false, balanceCents };
	},
});

export interface WalletView {
	wallet: { balanceCents: number; isInactive: boolean };
	transactions: Array<{
		id: Id<"marketplaceWalletTransactions">;
		type: string;
		amountCents: number;
		balanceAfterCents: number;
		referenceType: string | null;
		notes: string | null;
		createdAt: number;
	}>;
}

/**
 * Read-only wallet view for the buyer (balance + last 50 ledger rows).
 * A QUERY — it does NOT lazy-create the row (queries can't write); an
 * org with no wallet yet reads `balanceCents: 0`. The row is materialized
 * on the first top-up/purchase mutation.
 */
export const getWallet = query({
	args: {},
	handler: async (ctx): Promise<WalletView> => {
		const { orgId } = await requireMarketplaceAccess(ctx);

		const row = await ctx.db
			.query("marketplaceWallets")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.unique();
		const balanceCents = row?.balanceCents ?? 0;

		const txns = await ctx.db
			.query("marketplaceWalletTransactions")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.order("desc")
			.take(50);

		return {
			wallet: { balanceCents, isInactive: isWalletInactive(balanceCents) },
			transactions: txns.map((t) => ({
				id: t._id,
				type: t.type,
				amountCents: t.amountCents,
				balanceAfterCents: t.balanceAfterCents,
				referenceType: t.referenceType ?? null,
				notes: t.notes ?? null,
				createdAt: t._creationTime,
			})),
		};
	},
});

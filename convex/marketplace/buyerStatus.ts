import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireMarketplaceAccess } from "./access";

/**
 * Buyer-status lifecycle for a purchased lead (ported VERBATIM from v1
 * src/lib/marketplace/buyer-status.ts). The value lives on
 * `marketplacePurchases.buyerStatus` and is edited from the
 * status-change modal on the purchased-leads view.
 *
 * Transitions are constrained to a simple lifecycle:
 *   new        -> contacted | no_contact | rejected
 *   contacted  -> appointment | completed | no_contact | rejected
 *   appointment-> completed | rejected
 *   no_contact -> contacted
 *   completed, rejected -> terminal
 *
 * `isValidTransition` is a pure function (co-located test). `setBuyerStatus`
 * is the public mutation: it loads the purchase, asserts caller-org
 * ownership, validates the transition, and patches.
 */

export const BUYER_STATUSES = [
	"new",
	"contacted",
	"appointment",
	"completed",
	"no_contact",
	"rejected",
] as const;

export type BuyerStatus = (typeof BUYER_STATUSES)[number];

export const BUYER_STATUS_LABELS: Record<BuyerStatus, string> = {
	new: "Nieuw",
	contacted: "Contact gelegd",
	appointment: "Afspraak",
	completed: "Afgerond",
	no_contact: "Geen contact",
	rejected: "Afgewezen",
};

const TRANSITIONS: Record<BuyerStatus, BuyerStatus[]> = {
	new: ["contacted", "no_contact", "rejected"],
	contacted: ["appointment", "completed", "no_contact", "rejected"],
	appointment: ["completed", "rejected"],
	no_contact: ["contacted"],
	completed: [],
	rejected: [],
};

/** Pure state-machine guard. Same-state transitions are rejected. */
export function isValidTransition(from: BuyerStatus, to: BuyerStatus): boolean {
	if (from === to) return false;
	return TRANSITIONS[from].includes(to);
}

export function isBuyerStatus(value: unknown): value is BuyerStatus {
	return (
		typeof value === "string" &&
		(BUYER_STATUSES as readonly string[]).includes(value)
	);
}

/**
 * Update the buyer-status on a purchased lead. Validates the transition
 * (pure `isValidTransition`) before patching. Only the org that owns the
 * purchase may change it.
 */
export const setBuyerStatus = mutation({
	args: {
		purchaseId: v.id("marketplacePurchases"),
		status: v.union(
			v.literal("new"),
			v.literal("contacted"),
			v.literal("appointment"),
			v.literal("completed"),
			v.literal("no_contact"),
			v.literal("rejected"),
		),
	},
	handler: async (
		ctx,
		{ purchaseId, status },
	): Promise<
		{ success: true } | { success: false; error: "invalid_transition" }
	> => {
		const { orgId } = await requireMarketplaceAccess(ctx);

		const purchase = await ctx.db.get(purchaseId);
		if (!purchase || purchase.buyerOrgId !== orgId) {
			throw new Error("purchase_not_found");
		}

		const from = (
			isBuyerStatus(purchase.buyerStatus) ? purchase.buyerStatus : "new"
		) as BuyerStatus;
		if (!isValidTransition(from, status)) {
			return { success: false as const, error: "invalid_transition" };
		}

		await ctx.db.patch(purchaseId, {
			buyerStatus: status,
			buyerStatusUpdatedAt: Date.now(),
		});
		return { success: true as const };
	},
});

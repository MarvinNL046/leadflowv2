"use node";

import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { getSiteUrl, requireEnv } from "../lib/env";
import { TOPUP_MAX_CENTS, TOPUP_MIN_CENTS } from "./wallet";

/**
 * Stripe wallet top-up (ported from v1 src/lib/marketplace/
 * stripe-checkout.ts). Uses the Stripe SDK, so this file is the ONLY
 * marketplace module with `"use node"` — actions can cross into the Node
 * runtime. The webhook stays in the default V8 runtime (it uses
 * `constructEventAsync`, WebCrypto).
 *
 * Inline `price_data` (dynamic `unit_amount`) means we never pre-register
 * a Stripe Product — the buyer picks any amount €10–€5000 and Checkout
 * charges exactly that. The session `metadata` is what the webhook trusts
 * to credit the right wallet — NEVER the client form values.
 */

export const createTopup = action({
	args: { amountCents: v.number() },
	handler: async (ctx, { amountCents }): Promise<{ url: string }> => {
		// 1. Resolve org + user server-side (auth derived inside the query).
		const buyer = await ctx.runQuery(internal.marketplace.access.requireBuyer, {});

		// 2. Validate amount (defense in depth — the UI offers fixed amounts).
		if (
			!Number.isInteger(amountCents) ||
			amountCents < TOPUP_MIN_CENTS ||
			amountCents > TOPUP_MAX_CENTS
		) {
			throw new ConvexError({
				code: "invalid_amount" as const,
				minCents: TOPUP_MIN_CENTS,
				maxCents: TOPUP_MAX_CENTS,
			});
		}

		const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
		const siteUrl = getSiteUrl();

		// 3. Create the Checkout Session (inline price_data, no product).
		const session = await stripe.checkout.sessions.create({
			mode: "payment",
			line_items: [
				{
					price_data: {
						currency: "eur",
						product_data: {
							name: `LeadFlow Marketplace — ${(amountCents / 100).toFixed(2)} credits`,
							description:
								"Credit-opwaardering voor marketplace lead-aankopen (1 credit = €0,01)",
						},
						unit_amount: amountCents,
					},
					quantity: 1,
				},
			],
			metadata: {
				marketplaceOrgId: String(buyer.orgId),
				marketplaceUserId: String(buyer.userId),
				kind: "marketplace_topup",
			},
			success_url: `${siteUrl}/feed/wallet?topup=success&session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${siteUrl}/feed/wallet?topup=cancelled`,
		});

		if (!session.url) {
			throw new ConvexError({ code: "stripe_no_url" as const });
		}
		return { url: session.url };
	},
});

import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, mutation, query } from "../_generated/server";
import { requireMarketplaceAccess } from "./access";
import { type Niche, NICHE_LABELS } from "./types";
import { applyWalletDelta } from "./wallet";

/**
 * Lead purchase (ported from v1 src/lib/actions/marketplace/purchase.ts).
 *
 * ATOMICITY: load + re-check + debit + auto-copy + purchase-insert +
 * lead-status-patch ALL run in ONE mutation. Convex makes the mutation a
 * serializable transaction, so the wallet charge and the contact copy and
 * the purchase row commit together or not at all — there is no window
 * where credits are deducted without a lead, or a lead is sold twice.
 *
 * CONCURRENCY: every gate (lead status, exclusivity, shared slots,
 * buy-once-per-org) is re-asserted against the DB right before writing.
 * Two simultaneous exclusive buys both read the lead as available in
 * step 1, but only one commits — the other's read-set conflicts on the
 * patched lead / inserted purchase, Convex auto-retries it, and the
 * re-run sees `sold_exclusive` / `hasExclusive` → `lead_not_available`.
 * The explicit re-checks make the failure deterministic; OCC handles the
 * rest. NEVER split the debit / copy / insert across mutations or
 * `ctx.runMutation` — that reopens the race.
 */

export type PurchaseError =
	| "lead_not_available"
	| "mode_not_allowed"
	| "already_purchased"
	| "insufficient_credits"
	| "niche_not_allowed";

export interface FullLead {
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	phone: string | null;
	city: string | null;
	postalCode: string | null;
}

export interface PurchaseResult {
	success: boolean;
	purchaseId?: Id<"marketplacePurchases">;
	contactId?: Id<"contacts">;
	/** When insufficient_credits: how many cents short the buyer is. */
	shortfallCents?: number;
	/** When insufficient_credits: current wallet balance. */
	currentBalanceCents?: number;
	error?: PurchaseError;
	fullLead?: FullLead;
}

export const purchaseLead = mutation({
	args: {
		leadId: v.id("marketplaceLeads"),
		mode: v.union(v.literal("exclusive"), v.literal("shared")),
	},
	handler: async (ctx, { leadId, mode }): Promise<PurchaseResult> => {
		const { orgId, workspaceId, userId } = await requireMarketplaceAccess(ctx);

		// 1. Load lead + re-check status against the DB.
		const lead = await ctx.db.get(leadId);
		if (!lead) return { success: false, error: "lead_not_available" };
		if (lead.status !== "published" && lead.status !== "sold_shared") {
			return { success: false, error: "lead_not_available" };
		}

		// 2. Load purchases + re-assert availability (exclusivity / slots).
		const allPurchases = await ctx.db
			.query("marketplacePurchases")
			.withIndex("by_lead", (q) => q.eq("leadId", leadId))
			.collect();
		const hasExclusive = allPurchases.some((p) => p.mode === "exclusive");
		const sharedCount = allPurchases.filter((p) => p.mode === "shared").length;
		if (hasExclusive) return { success: false, error: "lead_not_available" };

		// 3. Mode gate (re-asserted against DB state).
		if (mode === "exclusive") {
			if (!lead.allowExclusive || sharedCount > 0) {
				return { success: false, error: "mode_not_allowed" };
			}
		} else {
			if (!lead.allowShared || sharedCount >= lead.maxSharedBuyers) {
				return { success: false, error: "mode_not_allowed" };
			}
		}

		// 4. Buy-once-per-org guard.
		if (allPurchases.some((p) => p.buyerOrgId === orgId)) {
			return { success: false, error: "already_purchased" };
		}

		// 5. Price.
		const priceCents =
			mode === "exclusive" ? lead.priceExclusiveCents : lead.priceSharedCents;

		// 6. Debit credits (inlined applyWalletDelta — same transaction).
		//    On insufficient_credits return the shortfall + current balance;
		//    NO write has happened yet, so returning here cleanly aborts.
		try {
			await applyWalletDelta(ctx, {
				orgId,
				type: "purchase",
				amountCents: -priceCents,
				referenceType: "purchase",
				referenceId: `lead_${leadId}_${Date.now()}`,
				notes: `Koop lead ${leadId} (${mode})`,
				createdByUserId: userId,
			});
		} catch (e) {
			if (
				e instanceof ConvexError &&
				typeof e.data === "object" &&
				e.data !== null &&
				(e.data as { code?: string }).code === "insufficient_credits"
			) {
				const shortfallCents = (e.data as { shortfallCents: number })
					.shortfallCents;
				const wallet = await ctx.db
					.query("marketplaceWallets")
					.withIndex("by_org", (q) => q.eq("orgId", orgId))
					.unique();
				return {
					success: false,
					error: "insufficient_credits",
					shortfallCents,
					currentBalanceCents: wallet?.balanceCents ?? 0,
				};
			}
			throw e;
		}

		// 7. Auto-copy the lead into the buyer's CRM (same transaction).
		const contactId = await copyLeadToContact(ctx, lead, {
			workspaceId,
		});

		// 8. Insert purchase + patch lead status.
		const purchaseId = await ctx.db.insert("marketplacePurchases", {
			leadId,
			buyerOrgId: orgId,
			buyerWorkspaceId: workspaceId,
			buyerUserId: userId,
			mode,
			priceCents,
			contactId,
			purchasedAt: Date.now(),
			buyerStatus: "new",
		});
		await ctx.db.patch(leadId, {
			status: mode === "exclusive" ? "sold_exclusive" : "sold_shared",
		});

		return {
			success: true,
			purchaseId,
			contactId,
			fullLead: {
				firstName: lead.firstName ?? null,
				lastName: lead.lastName ?? null,
				email: lead.email ?? null,
				phone: lead.phone ?? null,
				city: lead.city ?? null,
				postalCode: lead.postalCode ?? null,
			},
		};
	},
});

/**
 * Auto-copy a purchased lead into the buyer's CRM as a contact + lead-
 * attribution + opportunity + note, then fire speed-to-lead workflows.
 * Mirrors `internal.websiteLeads.ingestWebsiteLead` exactly (decision Q4:
 * dedup within the buyer workspace) so the unlocked lead surfaces in the
 * Kanban and the buyer's follow-up automations fire — runs INSIDE
 * `purchaseLead` so the charge + contact copy are atomic.
 */
async function copyLeadToContact(
	ctx: MutationCtx,
	lead: Doc<"marketplaceLeads">,
	{ workspaceId }: { workspaceId: Id<"workspaces"> },
): Promise<Id<"contacts">> {
	// 1. Normalize (same rules as ingestWebsiteLead).
	const normalizedEmail = lead.email?.toLowerCase().trim() || undefined;
	const normalizedPhone = lead.phone
		? lead.phone.replace(/[^\d+]/g, "")
		: undefined;
	const nicheLabel = NICHE_LABELS[lead.niche as Niche] ?? lead.niche;

	// 2. Dedup within the buyer workspace: email-match first, then phone.
	let contact = normalizedEmail
		? await ctx.db
				.query("contacts")
				.withIndex("by_workspace_email", (q) =>
					q.eq("workspaceId", workspaceId).eq("email", normalizedEmail),
				)
				.first()
		: null;
	if (!contact && normalizedPhone) {
		contact = await ctx.db
			.query("contacts")
			.withIndex("by_workspace_phone", (q) =>
				q.eq("workspaceId", workspaceId).eq("phone", normalizedPhone),
			)
			.first();
	}

	const tags = ["marketplace", lead.niche];
	let contactId: Id<"contacts">;
	if (contact) {
		// 3a. Merge: fill empty fields only; union the marketplace tags.
		const merged: Record<string, unknown> = {};
		if (!contact.firstName && lead.firstName) merged.firstName = lead.firstName;
		if (!contact.lastName && lead.lastName) merged.lastName = lead.lastName;
		if (!contact.email && normalizedEmail) merged.email = normalizedEmail;
		if (!contact.phone && normalizedPhone) merged.phone = normalizedPhone;
		if (!contact.city && lead.city) merged.city = lead.city;
		if (!contact.postalCode && lead.postalCode)
			merged.postalCode = lead.postalCode;
		const existingTags = contact.tags ?? [];
		const mergedTags = [
			...existingTags,
			...tags.filter((t) => !existingTags.includes(t)),
		];
		if (mergedTags.length !== existingTags.length) merged.tags = mergedTags;
		if (Object.keys(merged).length > 0) {
			await ctx.db.patch(contact._id, merged);
		}
		contactId = contact._id;
	} else {
		// 3b. Insert a fresh contact.
		contactId = await ctx.db.insert("contacts", {
			workspaceId,
			firstName: lead.firstName,
			lastName: lead.lastName,
			email: normalizedEmail,
			phone: normalizedPhone,
			city: lead.city,
			postalCode: lead.postalCode,
			tags,
			callCount: 0,
		});
	}

	// 4. Attribution → 'marketplace' source badge (source "api").
	await ctx.db.insert("leadAttribution", {
		contactId,
		workspaceId,
		source: "api",
		utmSource: "marketplace",
	});

	// 5. Fresh opportunity in the default-pipeline's first non-won/lost
	//    stage (exactly ingestWebsiteLead) → shows in the Kanban.
	const pipeline = await ctx.db
		.query("pipelines")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.filter((q) => q.eq(q.field("isDefault"), true))
		.first();
	if (pipeline) {
		const stages = await ctx.db
			.query("pipelineStages")
			.withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
			.collect();
		const stage = stages.find((s) => !s.isWonStage && !s.isLostStage) ?? null;
		if (stage) {
			const c = await ctx.db.get(contactId);
			const title =
				(c && [c.firstName, c.lastName].filter(Boolean).join(" ")) ||
				c?.email ||
				c?.phone ||
				"Nieuwe lead";
			const oppId = await ctx.db.insert("opportunities", {
				workspaceId,
				contactId,
				pipelineId: pipeline._id,
				stageId: stage._id,
				title,
			});
			await ctx.db.insert("opportunityStageHistory", {
				opportunityId: oppId,
				toStageId: stage._id,
			});
		}
	}

	// 6. Note for traceability.
	const noteLines = ["📋 Marketplace-aankoop", `• Niche: ${nicheLabel}`];
	if (lead.city) noteLines.push(`• Woonplaats: ${lead.city}`);
	await ctx.db.insert("notes", {
		workspaceId,
		contactId,
		body: noteLines.join("\n"),
	});

	// 7. Speed-to-lead workflows + AI-reactie fire (scheduled, post-commit).
	await ctx.scheduler.runAfter(
		0,
		internal.workflowEngine.triggerContactCreated,
		{ workspaceId, contactId },
	);

	return contactId;
}

export interface PurchasedLeadDTO {
	purchaseId: Id<"marketplacePurchases">;
	leadId: Id<"marketplaceLeads">;
	contactId: Id<"contacts"> | null;
	mode: "exclusive" | "shared";
	priceCents: number;
	purchasedAt: number;
	buyerStatus: string;
	niche: string;
	nicheLabel: string;
	serviceType: string | null;
	segment: string;
	city: string | null;
	postalCode: string | null;
	region: string | null;
	score: string;
	projectType: string | null;
	projectDescription: string | null;
	message: string | null;
	// Unmasked — visible because the buyer paid for it.
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	phone: string | null;
}

/**
 * List the caller-org's purchased leads with UNMASKED contact data
 * (post-purchase). Powers the "ontgrendeld" tab + the purchased-leads
 * view. `by_buyer_purchased` desc → join lead rows.
 */
export const listMyPurchases = query({
	args: {},
	handler: async (ctx): Promise<PurchasedLeadDTO[]> => {
		const { orgId } = await requireMarketplaceAccess(ctx);

		const purchases = await ctx.db
			.query("marketplacePurchases")
			.withIndex("by_buyer_purchased", (q) => q.eq("buyerOrgId", orgId))
			.order("desc")
			.take(200);

		const out: PurchasedLeadDTO[] = [];
		for (const p of purchases) {
			const lead = await ctx.db.get(p.leadId);
			if (!lead) continue;
			out.push({
				purchaseId: p._id,
				leadId: p.leadId,
				contactId: p.contactId ?? null,
				mode: p.mode,
				priceCents: p.priceCents,
				purchasedAt: p.purchasedAt,
				buyerStatus: p.buyerStatus,
				niche: lead.niche,
				nicheLabel: NICHE_LABELS[lead.niche as Niche] ?? lead.niche,
				serviceType: lead.serviceType ?? null,
				segment: lead.segment,
				city: lead.city ?? null,
				postalCode: lead.postalCode ?? null,
				region: lead.region ?? null,
				score: lead.score,
				projectType: lead.projectType ?? null,
				projectDescription: lead.projectDescription ?? null,
				message: lead.message ?? null,
				firstName: lead.firstName ?? null,
				lastName: lead.lastName ?? null,
				email: lead.email ?? null,
				phone: lead.phone ?? null,
			});
		}
		return out;
	},
});

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { hashApiKey } from "./apiKeys";
import { ALL_NICHES, marketplaceNiche } from "./types";
import { MAX_SHARED_BUYERS } from "./leadPricing";

/** Explicitly authorized pilot setup; does not send notifications for old leads. */
export const configureStaycoolPilot = internalMutation({
  args:{orgId:v.id('orgs')},returns:v.object({orgId:v.id('orgs'),email:v.union(v.string(),v.null())}),
  handler:async(ctx,{orgId})=>{
    const org=await ctx.db.get(orgId);
    if(org?.name!=='Staycool Airconditioning') throw new Error('unexpected_pilot_org');
    const prefs=await ctx.db.query('marketplaceBuyerPreferences').withIndex('by_org',q=>q.eq('orgId',orgId)).unique();
    const values={niches:['airco'],serviceTypes:['install'],provinces:['Limburg'],segments:['b2c','b2b'],preferredMode:'both' as const,notifyOnNewLead:true,notifyChannel:'email' as const,emailAlertsActivatedAt:Date.now(),updatedAt:Date.now()};
    if(prefs) await ctx.db.patch(prefs._id,{...values,regions:undefined,postalCodePrefixes:undefined});
    else await ctx.db.insert('marketplaceBuyerPreferences',{orgId,...values,onboardingCompletedAt:Date.now()});
    await ctx.db.patch(orgId,{marketplaceEnabled:true});
    const owner=await ctx.db.get(org.ownerId);
    return {orgId,email:owner?.email??null};
  },
});

export const setAircoInstallPolicy = internalMutation({
  args:{expiryDays:v.union(v.literal(7),v.literal(14),v.null())},returns:v.null(),
  handler:async(ctx,{expiryDays})=>{
    const row=await ctx.db.query('marketplacePolicies').withIndex('by_niche_serviceType',q=>q.eq('niche','airco').eq('serviceType','install')).unique();
    const values={niche:'airco' as const,serviceType:'install' as const,expiryDays:expiryDays??undefined,followUpHours:24,updatedAt:Date.now()};
    if(row) await ctx.db.patch(row._id,values);else await ctx.db.insert('marketplacePolicies',values);
    return null;
  },
});

export const capUnpurchasedLeads = internalMutation({
  args:{cursor:v.optional(v.union(v.string(),v.null()))},returns:v.object({changed:v.number(),isDone:v.boolean(),cursor:v.string()}),
  handler:async(ctx,{cursor})=>{
    const page=await ctx.db.query('marketplaceLeads').withIndex('by_status_published',q=>q.eq('status','published')).paginate({cursor:cursor??null,numItems:100});
    let changed=0;
    for(const lead of page.page){
      if(lead.maxSharedBuyers<=MAX_SHARED_BUYERS) continue;
      const purchase=await ctx.db.query('marketplacePurchases').withIndex('by_lead',q=>q.eq('leadId',lead._id)).first();
      if(!purchase){await ctx.db.patch(lead._id,{maxSharedBuyers:MAX_SHARED_BUYERS});changed++;}
    }
    return {changed,isDone:page.isDone,cursor:page.continueCursor};
  },
});

/**
 * Internal, CLI-only setup helpers for marketplace go-live / buyer onboarding.
 * NOT exposed to clients (internalMutation) — invoked via
 * `npx convex run internal.marketplace.adminCli.*`. They exist because the
 * lean-scope port has no admin UI yet: enabling the first buyer org and
 * minting the first intake key otherwise require an authenticated super-admin
 * session that the CLI can't provide.
 */

/** Raw key = "lmk_" + 32 hex chars (16 random bytes). Mirrors apiKeys.ts. */
function generateRawKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `lmk_${hex}`;
}

/** Enable an org as a marketplace buyer + upsert onboarded buyer-prefs. */
export const enableBuyer = internalMutation({
	args: { orgId: v.id("orgs"), niches: v.array(v.string()) },
	handler: async (ctx, { orgId, niches }) => {
		const org = await ctx.db.get(orgId);
		if (!org) throw new Error("org not found");
		await ctx.db.patch(orgId, { marketplaceEnabled: true });

		const now = Date.now();
		const existing = await ctx.db
			.query("marketplaceBuyerPreferences")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, {
				niches,
				onboardingCompletedAt: existing.onboardingCompletedAt ?? now,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("marketplaceBuyerPreferences", {
				orgId,
				niches,
				segments: ["b2c", "b2b"],
				preferredMode: "both",
				notifyOnNewLead: true,
				notifyChannel: "email",
				onboardingCompletedAt: now,
				updatedAt: now,
			});
		}
		return { ok: true, orgId, niches };
	},
});

/** Mint an intake API key (no auth gate; CLI-only). Returns the raw key ONCE. */
export const mintKey = internalMutation({
	args: {
		name: v.string(),
		defaultNiche: marketplaceNiche,
		allowedNiches: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const allowed = new Set(ALL_NICHES as string[]);
		for (const n of args.allowedNiches) {
			if (!allowed.has(n)) throw new Error(`Unknown niche: ${n}`);
		}
		const allowedNiches =
			args.allowedNiches.length > 0 ? args.allowedNiches : [args.defaultNiche];

		let rawKey = generateRawKey();
		let keyHash = await hashApiKey(rawKey);
		while (
			await ctx.db
				.query("marketplaceApiKeys")
				.withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
				.unique()
		) {
			rawKey = generateRawKey();
			keyHash = await hashApiKey(rawKey);
		}

		await ctx.db.insert("marketplaceApiKeys", {
			keyHash,
			keyPrefix: rawKey.slice(0, 12),
			name: args.name,
			defaultNiche: args.defaultNiche,
			allowedNiches,
			isActive: true,
		});
		return { rawKey, keyPrefix: rawKey.slice(0, 12) };
	},
});

/** Flag an intake key as trusted/first-party (low-score leads auto-publish). */
export const setKeyTrusted = internalMutation({
	args: { apiKeyId: v.id("marketplaceApiKeys"), trusted: v.boolean() },
	handler: async (ctx, { apiKeyId, trusted }) => {
		const key = await ctx.db.get(apiKeyId);
		if (!key) throw new Error("api key not found");
		await ctx.db.patch(apiKeyId, { trusted });
		return { ok: true, apiKeyId, trusted };
	},
});

/** Retire an explicitly labelled, unpurchased smoke-test lead without deleting history. */
export const archiveTestLead = internalMutation({
  args: { leadId: v.id('marketplaceLeads') },
  returns: v.null(),
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead || lead.lastName !== 'TESTAANVRAAG') throw new Error('not_a_test_lead');
    const purchased = await ctx.db.query('marketplacePurchases').withIndex('by_lead', q => q.eq('leadId', leadId)).first();
    if (purchased) throw new Error('lead_already_purchased');
    await ctx.db.patch(leadId, {status:'rejected',followUpStatus:'done',followUpUpdatedAt:Date.now(),adminNotes:'Geautoriseerde testaanvraag; uit verkoop gehaald na controle.'});
    return null;
  },
});

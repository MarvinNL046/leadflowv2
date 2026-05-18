import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * ⚠ ETL helpers — PUBLIEK tijdens migratie-fase, GEEN auth-check binnen.
 *
 * Reden: scripts/migrate-contacts.ts moet bulk-upserts doen vanaf Node
 * zonder admin-key (Convex's deploy-key CLI is in nieuwere versie
 * anders gestructureerd). Voor MVP eenmalige migratie acceptabel risk.
 *
 * REMOVAL: na succesvolle migratie + cutover MOETEN deze functies
 * verwijderd worden (geen publiek bulk-insert endpoint in productie
 * laten staan). Verwacht: cleanup-commit met `git rm convex/migration.ts`.
 *
 * Idempotent via legacyContactId index: rerun is veilig — bestaande
 * rows worden gepatcht in plaats van gedupliceerd.
 */

/** Vind het workspace-id voor Staycool (default workspace). */
export const getStaycoolWorkspaceId = query({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "staycool"))
      .unique();
    if (!org) return null;

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    return workspace?._id ?? null;
  },
});

/**
 * DEBUG — pak een metaLeadRaw + bijbehorende contact + attribution op
 * leadgenId. Voor verifiëren van live webhook-tests. Verwijder bij
 * cleanup (samen met de rest van migration.ts).
 */
export const debugLookupByLeadgenId = query({
  args: { leadgenId: v.string() },
  handler: async (ctx, args) => {
    const raw = await ctx.db
      .query("metaLeadRaw")
      .withIndex("by_leadgenId", (q) => q.eq("leadgenId", args.leadgenId))
      .first();
    if (!raw) return { raw: null };

    const contact = raw.contactId ? await ctx.db.get(raw.contactId) : null;

    const attribution = await ctx.db
      .query("leadAttribution")
      .withIndex("by_metaLeadgenId", (q) =>
        q.eq("metaLeadgenId", args.leadgenId),
      )
      .first();

    return {
      raw: {
        status: raw.status,
        retryCount: raw.retryCount,
        errorMessage: raw.errorMessage,
        formId: raw.formId,
        fetchedAt: raw.fetchedAt,
        processedAt: raw.processedAt,
      },
      contact: contact
        ? {
            id: contact._id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            city: contact.city,
          }
        : null,
      attribution: attribution
        ? {
            source: attribution.source,
            metaFormId: attribution.metaFormId,
            metaAdId: attribution.metaAdId,
          }
        : null,
    };
  },
});

/** Vind het org-id voor Staycool — nodig voor metaLeadRaw (FK naar orgs). */
export const getStaycoolOrgId = query({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "staycool"))
      .unique();
    return org?._id ?? null;
  },
});

/** Aantal al-gemigreerde contacts (via legacyContactId aanwezigheid). */
export const countMigratedContacts = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();
    return rows.filter((r) => r.legacyContactId !== undefined).length;
  },
});

const contactDocValidator = v.object({
  legacyContactId: v.number(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  company: v.optional(v.string()),
  position: v.optional(v.string()),
  street: v.optional(v.string()),
  houseNumber: v.optional(v.string()),
  houseNumberAddition: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  city: v.optional(v.string()),
  province: v.optional(v.string()),
  country: v.optional(v.string()),
  messengerPsid: v.optional(v.string()),
  messengerPageId: v.optional(v.string()),
  callCount: v.number(),
  lastCallAt: v.optional(v.number()),
  lastCallResult: v.optional(v.string()),
  nextFollowUpAt: v.optional(v.number()),
  tags: v.optional(v.array(v.string())),
  outsideArea: v.optional(v.boolean()),
  externalId: v.optional(v.string()),
});

/**
 * Batch-upsert contacts vanuit Neon. Lookup per legacyContactId voor
 * dedup, anders insert. Werkt per workspace.
 *
 * Returnt teller {inserted, updated, skipped} zodat de Node-script
 * voortgang kan loggen.
 */
export const upsertContactsBatch = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    docs: v.array(contactDocValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const doc of args.docs) {
      const existing = await ctx.db
        .query("contacts")
        .withIndex("by_legacyContactId", (q) =>
          q.eq("legacyContactId", doc.legacyContactId),
        )
        .first();

      if (existing) {
        // Update bestaande row — patch alle velden behalve workspaceId
        // (workspace-move is geen migratie-use-case)
        await ctx.db.patch(existing._id, {
          firstName: doc.firstName,
          lastName: doc.lastName,
          email: doc.email,
          phone: doc.phone,
          company: doc.company,
          position: doc.position,
          street: doc.street,
          houseNumber: doc.houseNumber,
          houseNumberAddition: doc.houseNumberAddition,
          postalCode: doc.postalCode,
          city: doc.city,
          province: doc.province,
          country: doc.country,
          messengerPsid: doc.messengerPsid,
          messengerPageId: doc.messengerPageId,
          callCount: doc.callCount,
          lastCallAt: doc.lastCallAt,
          lastCallResult: doc.lastCallResult,
          nextFollowUpAt: doc.nextFollowUpAt,
          tags: doc.tags,
          outsideArea: doc.outsideArea,
          externalId: doc.externalId,
        });
        updated++;
      } else {
        await ctx.db.insert("contacts", {
          ...doc,
          workspaceId: args.workspaceId,
        });
        inserted++;
      }
    }

    return { inserted, updated, total: args.docs.length };
  },
});

// ──────────────────────────────────────────────────────────────────────
// LEAD ATTRIBUTION ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedLeadAttributions = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("leadAttribution").collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const leadAttributionDocValidator = v.object({
  legacyId: v.number(),
  legacyContactId: v.number(),
  source: v.union(v.literal("meta"), v.literal("api"), v.literal("manual")),
  metaPageId: v.optional(v.string()),
  metaFormId: v.optional(v.string()),
  metaLeadgenId: v.optional(v.string()),
  metaAdId: v.optional(v.string()),
  metaCampaignId: v.optional(v.string()),
  metaAdsetId: v.optional(v.string()),
  rawPayload: v.optional(v.any()),
  costPerLead: v.optional(v.number()),
  utmSource: v.optional(v.string()),
  utmMedium: v.optional(v.string()),
  utmCampaign: v.optional(v.string()),
  utmContent: v.optional(v.string()),
  utmTerm: v.optional(v.string()),
});

/**
 * Batch-upsert leadAttribution rows. legacyContactId wordt naar Convex
 * contactId geresolved via de by_legacyContactId index op contacts.
 * Skipt rows zonder match (returnt counter) i.p.v. te crashen — handig
 * als attribution-migratie per ongeluk vóór contacts-migratie loopt.
 */
export const upsertLeadAttributionBatch = mutation({
  args: {
    docs: v.array(leadAttributionDocValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let skippedNoContact = 0;

    for (const doc of args.docs) {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_legacyContactId", (q) =>
          q.eq("legacyContactId", doc.legacyContactId),
        )
        .first();
      if (!contact) {
        skippedNoContact++;
        continue;
      }

      const existing = await ctx.db
        .query("leadAttribution")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        contactId: contact._id,
        source: doc.source,
        metaPageId: doc.metaPageId,
        metaFormId: doc.metaFormId,
        metaLeadgenId: doc.metaLeadgenId,
        metaAdId: doc.metaAdId,
        metaCampaignId: doc.metaCampaignId,
        metaAdsetId: doc.metaAdsetId,
        rawPayload: doc.rawPayload,
        costPerLead: doc.costPerLead,
        utmSource: doc.utmSource,
        utmMedium: doc.utmMedium,
        utmCampaign: doc.utmCampaign,
        utmContent: doc.utmContent,
        utmTerm: doc.utmTerm,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("leadAttribution", {
          ...patch,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return {
      inserted,
      updated,
      skippedNoContact,
      total: args.docs.length,
    };
  },
});

// ──────────────────────────────────────────────────────────────────────
// META LEAD RAW ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedMetaLeadRaws = query({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    // Klein volume (v1 = 352 rows totaal), full scan is acceptabel.
    const rows = await ctx.db.query("metaLeadRaw").collect();
    return rows.filter((r) => r.orgId === args.orgId).length;
  },
});

const metaLeadStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("skipped"),
);

const metaLeadRawDocValidator = v.object({
  leadgenId: v.string(),
  pageId: v.string(),
  formId: v.optional(v.string()),
  adId: v.optional(v.string()),
  adgroupId: v.optional(v.string()),
  campaignId: v.optional(v.string()),
  payload: v.any(),
  fieldData: v.optional(v.any()),
  status: metaLeadStatusValidator,
  legacyContactId: v.optional(v.number()),  // resolve to contactId
  errorMessage: v.optional(v.string()),
  retryCount: v.number(),
  fetchedAt: v.number(),
  processingStartedAt: v.optional(v.number()),
  processedAt: v.optional(v.number()),
});

/**
 * Batch-upsert metaLeadRaw rows. Idempotency-key = leadgenId (al unique
 * in Neon, en al via by_leadgenId index in Convex). orgId is fixed voor
 * Staycool en als arg meegegeven.
 *
 * contactId/opportunityId zijn FK's naar Convex tabellen — contactId
 * resolven we via by_legacyContactId; opportunityId skippen we (geen
 * opportunities-migratie nog).
 */
export const upsertMetaLeadRawBatch = mutation({
  args: {
    orgId: v.id("orgs"),
    docs: v.array(metaLeadRawDocValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const doc of args.docs) {
      let contactId: Id<"contacts"> | undefined;
      if (doc.legacyContactId !== undefined) {
        const contact = await ctx.db
          .query("contacts")
          .withIndex("by_legacyContactId", (q) =>
            q.eq("legacyContactId", doc.legacyContactId),
          )
          .first();
        contactId = contact?._id;
      }

      const existing = await ctx.db
        .query("metaLeadRaw")
        .withIndex("by_leadgenId", (q) => q.eq("leadgenId", doc.leadgenId))
        .first();

      const fields = {
        orgId: args.orgId,
        pageId: doc.pageId,
        formId: doc.formId,
        adId: doc.adId,
        adgroupId: doc.adgroupId,
        campaignId: doc.campaignId,
        payload: doc.payload,
        fieldData: doc.fieldData,
        status: doc.status,
        contactId,
        errorMessage: doc.errorMessage,
        retryCount: doc.retryCount,
        fetchedAt: doc.fetchedAt,
        processingStartedAt: doc.processingStartedAt,
        processedAt: doc.processedAt,
      };

      if (existing) {
        await ctx.db.patch(existing._id, fields);
        updated++;
      } else {
        await ctx.db.insert("metaLeadRaw", {
          ...fields,
          leadgenId: doc.leadgenId,
        });
        inserted++;
      }
    }

    return { inserted, updated, total: args.docs.length };
  },
});

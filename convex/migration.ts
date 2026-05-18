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
 * Auth-less seed van Staycool's default Sales pipeline (+ 5 stages) +
 * 3 test-opportunities op recente contacts. Voor dev-bootstrap; weg
 * bij cleanup.
 */
const SEED_STAGES = [
  { name: "Lead", color: "#94a3b8", isWonStage: false, isLostStage: false },
  { name: "Contact", color: "#60a5fa", isWonStage: false, isLostStage: false },
  { name: "Voorstel", color: "#a78bfa", isWonStage: false, isLostStage: false },
  { name: "Gewonnen", color: "#34d399", isWonStage: true, isLostStage: false },
  { name: "Verloren", color: "#f87171", isWonStage: false, isLostStage: true },
];

export const seedStaycoolPipeline = mutation({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "staycool"))
      .unique();
    if (!org) throw new Error("Staycool org niet gevonden");
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!workspace) throw new Error("Geen default workspace");

    // Idempotent: skip als er al een default pipeline is
    const existing = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (existing) {
      const oppsCount = await ctx.db
        .query("opportunities")
        .withIndex("by_workspace_stage", (q) =>
          q.eq("workspaceId", workspace._id),
        )
        .collect();
      return {
        pipelineId: existing._id,
        created: false,
        opportunities: oppsCount.length,
      };
    }

    const pipelineId = await ctx.db.insert("pipelines", {
      workspaceId: workspace._id,
      name: "Sales",
      isDefault: true,
    });
    const stageIds: Array<Id<"pipelineStages">> = [];
    for (let i = 0; i < SEED_STAGES.length; i++) {
      const s = SEED_STAGES[i];
      const id = await ctx.db.insert("pipelineStages", {
        pipelineId,
        name: s.name,
        order: i,
        color: s.color,
        isWonStage: s.isWonStage,
        isLostStage: s.isLostStage,
      });
      stageIds.push(id);
    }

    // 3 test-opps op de 3 meest recente contacts (niet outside-area)
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", workspace._id),
      )
      .order("desc")
      .take(20);
    const eligible = contacts.filter((c) => !c.outsideArea).slice(0, 3);
    for (let i = 0; i < eligible.length; i++) {
      const c = eligible[i];
      const name =
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        c.email ||
        "Onbekend";
      // Spread over Lead/Contact/Voorstel (eerste 3 stages)
      const targetStage = stageIds[Math.min(i, 2)];
      const oppId = await ctx.db.insert("opportunities", {
        workspaceId: workspace._id,
        contactId: c._id,
        pipelineId,
        stageId: targetStage,
        title: `Airco-installatie — ${name}`,
        value: 2500 + i * 500,
        currency: "EUR",
      });
      await ctx.db.insert("opportunityStageHistory", {
        opportunityId: oppId,
        toStageId: targetStage,
      });
    }

    return {
      pipelineId,
      created: true,
      opportunities: eligible.length,
    };
  },
});

/**
 * Auth-less seed van Staycool's "Snelle Response" workflow.
 *
 *   contact_created ─→ delay 3min ─→ send_email ╮
 *                                              ├ (parallel)
 *                                  ─→ send_whatsapp ╯
 *
 * Idempotent: skip als workflow met deze naam al bestaat.
 * Verwijder bij cleanup.
 */
export const seedSnelleResponse = mutation({
  args: {
    delaySeconds: v.optional(v.number()),  // override voor test (default 180)
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "staycool"))
      .unique();
    if (!org) throw new Error("Staycool org niet gevonden");
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!workspace) throw new Error("Geen default workspace");

    const existing = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspace._id),
      )
      .filter((q) => q.eq(q.field("name"), "Snelle Response"))
      .first();
    if (existing) {
      return { workflowId: existing._id, created: false };
    }

    const workflowId = await ctx.db.insert("workflows", {
      workspaceId: workspace._id,
      name: "Snelle Response",
      description:
        "Direct na nieuwe lead: na 3 min een welkomstmail + WhatsApp",
      status: "active",
      triggerConfig: [{ type: "contact_created", nodeId: "trigger-1" }],
      version: 1,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
    });

    // Nodes
    await ctx.db.insert("workflowNodes", {
      workflowId,
      nodeId: "trigger-1",
      type: "trigger",
      subType: "contact_created",
      positionX: 0,
      positionY: 0,
      config: {},
      label: "Nieuw contact",
    });
    await ctx.db.insert("workflowNodes", {
      workflowId,
      nodeId: "delay-1",
      type: "delay",
      positionX: 200,
      positionY: 0,
      config: { delaySeconds: args.delaySeconds ?? 180 },
      label: `Wacht ${args.delaySeconds ?? 180}s`,
    });
    await ctx.db.insert("workflowNodes", {
      workflowId,
      nodeId: "email-1",
      type: "action",
      subType: "send_email",
      positionX: 400,
      positionY: -80,
      config: {
        subject: "Bedankt voor je aanvraag bij Staycool Airconditioning",
        body:
          "Hoi {{contact.firstName}},\n\n" +
          "Bedankt voor je interesse in Staycool Airconditioning! " +
          "We nemen binnenkort contact met je op om je vraag te bespreken.\n\n" +
          "Met vriendelijke groet,\nStaycool Airconditioning",
      },
      label: "Welkomstmail",
    });
    await ctx.db.insert("workflowNodes", {
      workflowId,
      nodeId: "wa-1",
      type: "action",
      subType: "send_whatsapp",
      positionX: 400,
      positionY: 80,
      config: {
        body:
          "Hoi {{contact.firstName}}! 👋\n\n" +
          "Bedankt voor je interesse in Staycool. " +
          "We bellen je binnenkort terug.",
      },
      label: "WhatsApp",
    });

    // Edges
    await ctx.db.insert("workflowEdges", {
      workflowId,
      sourceNodeId: "trigger-1",
      targetNodeId: "delay-1",
    });
    await ctx.db.insert("workflowEdges", {
      workflowId,
      sourceNodeId: "delay-1",
      targetNodeId: "email-1",
    });
    await ctx.db.insert("workflowEdges", {
      workflowId,
      sourceNodeId: "delay-1",
      targetNodeId: "wa-1",
    });

    return { workflowId, created: true };
  },
});

/**
 * Auth-less wrapper rond contacts.mergeInto voor cleanup-scripts.
 * Verwijder bij productie-cleanup.
 */
export const adminMergeContacts = mutation({
  args: {
    loserId: v.id("contacts"),
    winnerId: v.id("contacts"),
  },
  handler: async (ctx, args): Promise<{
    winnerId: Id<"contacts">;
    loserId: Id<"contacts">;
    counts: {
      messages: number;
      notes: number;
      leadAttribution: number;
      opportunities: number;
      metaLeadRaw: number;
    };
  }> => {
    if (args.loserId === args.winnerId) {
      throw new Error("Cannot merge contact into itself");
    }
    const loser = await ctx.db.get(args.loserId);
    const winner = await ctx.db.get(args.winnerId);
    if (!loser || !winner) throw new Error("Contact not found");
    if (loser.workspaceId !== winner.workspaceId) {
      throw new Error("Contacts not in same workspace");
    }

    const counts = {
      messages: 0,
      notes: 0,
      leadAttribution: 0,
      opportunities: 0,
      metaLeadRaw: 0,
    };

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_contact_sent", (q) => q.eq("contactId", args.loserId))
      .collect();
    for (const m of messages) {
      await ctx.db.patch(m._id, { contactId: args.winnerId });
      counts.messages++;
    }

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", args.loserId))
      .collect();
    for (const n of notes) {
      await ctx.db.patch(n._id, { contactId: args.winnerId });
      counts.notes++;
    }

    const attrs = await ctx.db
      .query("leadAttribution")
      .withIndex("by_contact", (q) => q.eq("contactId", args.loserId))
      .collect();
    for (const a of attrs) {
      await ctx.db.patch(a._id, { contactId: args.winnerId });
      counts.leadAttribution++;
    }

    const opps = await ctx.db
      .query("opportunities")
      .withIndex("by_contact", (q) => q.eq("contactId", args.loserId))
      .collect();
    for (const o of opps) {
      await ctx.db.patch(o._id, { contactId: args.winnerId });
      counts.opportunities++;
    }

    const raws = await ctx.db
      .query("metaLeadRaw")
      .filter((q) => q.eq(q.field("contactId"), args.loserId))
      .collect();
    for (const r of raws) {
      await ctx.db.patch(r._id, { contactId: args.winnerId });
      counts.metaLeadRaw++;
    }

    // Fill empty winner-fields with loser's
    const fields = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "company",
      "position",
      "street",
      "houseNumber",
      "houseNumberAddition",
      "postalCode",
      "city",
      "province",
      "country",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      const wv = winner[f];
      const lv = loser[f];
      if ((wv === undefined || wv === null || wv === "") && lv) {
        patch[f] = lv;
      }
    }
    if ((loser.callCount ?? 0) > 0) {
      patch.callCount = (winner.callCount ?? 0) + (loser.callCount ?? 0);
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.winnerId, patch);
    }

    await ctx.db.patch(args.loserId, { deletedAt: Date.now() });

    return { winnerId: args.winnerId, loserId: args.loserId, counts };
  },
});

/**
 * Backfill contactId voor inbound messages die orphan zijn (contactId
 * undefined). Probeer phone-match met variants (met/zonder + prefix).
 * Wegwerp — verwijderen na productie-cleanup.
 */
export const backfillInboundContactIds = mutation({
  args: {},
  handler: async (ctx) => {
    const inboundMessages = await ctx.db
      .query("messages")
      .filter((q) =>
        q.and(
          q.eq(q.field("direction"), "inbound"),
          q.eq(q.field("contactId"), undefined),
        ),
      )
      .take(500);

    let matched = 0;
    for (const m of inboundMessages) {
      if (!m.from) continue;
      if (m.channel === "email") continue; // alleen sms/wa fix nu

      const digits = m.from.replace(/[^\d+]/g, "");
      const withPlus = digits.startsWith("+") ? digits : `+${digits}`;
      const withoutPlus = digits.startsWith("+") ? digits.slice(1) : digits;

      for (const phone of [withPlus, withoutPlus]) {
        const c = await ctx.db
          .query("contacts")
          .withIndex("by_workspace_phone", (q) =>
            q.eq("workspaceId", m.workspaceId).eq("phone", phone),
          )
          .first();
        if (c) {
          await ctx.db.patch(m._id, { contactId: c._id });
          matched++;
          break;
        }
      }
    }
    return { scanned: inboundMessages.length, matched };
  },
});

/**
 * Update delay op de Snelle Response workflow. Voor test gebruiken we
 * 15s, voor productie 180s. Verwijder na cleanup van migration.ts.
 */
export const updateSnelleResponseDelay = mutation({
  args: { delaySeconds: v.number() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "staycool"))
      .unique();
    if (!org) throw new Error("Staycool org niet gevonden");
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!workspace) throw new Error("Geen default workspace");

    const wf = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspace._id),
      )
      .filter((q) => q.eq(q.field("name"), "Snelle Response"))
      .first();
    if (!wf) throw new Error("Snelle Response workflow niet gevonden");

    const delayNode = await ctx.db
      .query("workflowNodes")
      .withIndex("by_workflow", (q) => q.eq("workflowId", wf._id))
      .filter((q) => q.eq(q.field("nodeId"), "delay-1"))
      .first();
    if (!delayNode) throw new Error("delay-1 node niet gevonden");

    await ctx.db.patch(delayNode._id, {
      config: { delaySeconds: args.delaySeconds },
      label: `Wacht ${args.delaySeconds}s`,
    });

    return { previousDelay: (delayNode.config as { delaySeconds?: number })?.delaySeconds, newDelay: args.delaySeconds };
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

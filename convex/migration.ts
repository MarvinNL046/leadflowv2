import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * ⚠ ETL helpers — INTERNAL (internalMutation/internalQuery), GEEN publiek endpoint.
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

/**
 * Reset test-contact terug naar pre-test state. Wist call-history,
 * outsideArea/unreachable flags, auto-generated notes (Niet bereikt /
 * Ongeldig / Buiten werkgebied), en zet stage van eventuele opps die
 * via die actions naar Verloren zijn gepushed terug naar de eerste
 * niet-won/lost stage.
 *
 * Bedoeld voor manual testing tijdens v2-development. Verwijder vóór
 * cutover-cleanup van migration.ts.
 */
export const resetTestContact = internalMutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact niet gevonden");

    // 1) Wis call-tracking + flags
    await ctx.db.patch(args.contactId, {
      callCount: 0,
      lastCallAt: undefined,
      lastCallResult: undefined,
      nextFollowUpAt: undefined,
      outsideArea: false,
      unreachable: false,
    });

    // 2) Verwijder auto-generated notes (die starten met 🚫 of 📞 of 🔄 of ❌ of ✅)
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    let deletedNotes = 0;
    for (const note of notes) {
      if (/^[🚫📞🔄❌✅]/.test(note.body)) {
        await ctx.db.delete(note._id);
        deletedNotes++;
      }
    }

    // 3) Reset opps die door deze flow naar Verloren zijn verplaatst.
    //    Vind de pipeline + eerste actieve stage als reset-target.
    const opps = await ctx.db
      .query("opportunities")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
    let resetOpps = 0;
    for (const opp of opps) {
      if (!opp.closedAt) continue; // alleen closed-opps resetten
      const pipeline = await ctx.db.get(opp.pipelineId);
      if (!pipeline) continue;
      const stages = await ctx.db
        .query("pipelineStages")
        .withIndex("by_pipeline_order", (q) =>
          q.eq("pipelineId", opp.pipelineId),
        )
        .collect();
      const firstActive = stages
        .sort((a, b) => a.order - b.order)
        .find((s) => !s.isWonStage && !s.isLostStage);
      if (firstActive) {
        await ctx.db.patch(opp._id, {
          stageId: firstActive._id,
          closedAt: undefined,
          closedReason: undefined,
        });
        resetOpps++;
      }
    }

    return {
      deletedNotes,
      resetOpps,
      contactName: [contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(" "),
    };
  },
});

/**
 * Admin-mutation (geen auth) om ALLE inbound messages binnen Staycool's
 * default workspace als gelezen te markeren. Voor de eenmalige bootstrap
 * direct na sync-all: 1750 gemigreerde messages markeren als gelezen
 * zodat alleen nieuwe binnenkomende opvallen.
 *
 * Wordt verwijderd bij cutover-cleanup (samen met de rest van
 * migration.ts).
 */
export const markAllMessagesReadAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "staycool"))
      .unique();
    if (!org) return { error: "Staycool org niet gevonden" };

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!workspace) return { error: "Geen default workspace" };

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", workspace._id),
      )
      .collect();

    let marked = 0;
    const now = Date.now();
    for (const m of rows) {
      if (m.direction !== "inbound") continue;
      if (m.readAt !== undefined) continue;
      await ctx.db.patch(m._id, { readAt: now });
      marked++;
    }
    return { marked, totalRows: rows.length };
  },
});

/**
 * Wrapper rond resetTestContact die per email zoekt — handig voor
 * runtime via `npx convex run migration:resetTestContactByEmail`.
 */
export const resetTestContactByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const contact = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_email")
      .filter((q) => q.eq(q.field("email"), args.email.toLowerCase().trim()))
      .first();
    if (!contact) {
      return { error: `Contact niet gevonden voor email ${args.email}` };
    }

    await ctx.db.patch(contact._id, {
      callCount: 0,
      lastCallAt: undefined,
      lastCallResult: undefined,
      nextFollowUpAt: undefined,
      outsideArea: false,
      unreachable: false,
    });

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
      .collect();
    let deletedNotes = 0;
    for (const note of notes) {
      if (/^[🚫📞🔄❌✅]/.test(note.body)) {
        await ctx.db.delete(note._id);
        deletedNotes++;
      }
    }

    const opps = await ctx.db
      .query("opportunities")
      .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
      .collect();
    let resetOpps = 0;
    for (const opp of opps) {
      if (!opp.closedAt) continue;
      const stages = await ctx.db
        .query("pipelineStages")
        .withIndex("by_pipeline_order", (q) =>
          q.eq("pipelineId", opp.pipelineId),
        )
        .collect();
      const firstActive = stages
        .sort((a, b) => a.order - b.order)
        .find((s) => !s.isWonStage && !s.isLostStage);
      if (firstActive) {
        await ctx.db.patch(opp._id, {
          stageId: firstActive._id,
          closedAt: undefined,
          closedReason: undefined,
        });
        resetOpps++;
      }
    }

    return {
      deletedNotes,
      resetOpps,
      contactName: [contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(" "),
    };
  },
});

/** Vind het workspace-id voor Staycool (default workspace). */
export const getStaycoolWorkspaceId = internalQuery({
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

export const seedStaycoolPipeline = internalMutation({
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
export const seedSnelleResponse = internalMutation({
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
export const adminMergeContacts = internalMutation({
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
export const backfillInboundContactIds = internalMutation({
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
export const updateSnelleResponseDelay = internalMutation({
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
export const debugLookupByLeadgenId = internalQuery({
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
export const getStaycoolOrgId = internalQuery({
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
export const countMigratedContacts = internalQuery({
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
export const upsertContactsBatch = internalMutation({
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
// MONEYBIRD-IMPORT (fase A koepel-cleanup, 2026-07)
// ──────────────────────────────────────────────────────────────────────

const moneybirdContactValidator = v.object({
  moneybirdId: v.string(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  company: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  street: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
});

/**
 * Fase A: Moneybird-klanten die (na offline matching op verse exports)
 * NIET in leadflow bestaan als contact toevoegen. Insert-only — bestaande
 * contacten worden bewust nooit aangeraakt; de match zelf gebeurt offline.
 * externalId = "moneybird:<id>" (traceerbaar + basis voor fase C), tag
 * "moneybird-import" voor segmenten. Chunked aanroepen; elke chunk is
 * transactioneel, dus bij een fout alleen die chunk opnieuw.
 */
export const insertMoneybirdContacts = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    docs: v.array(moneybirdContactValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const doc of args.docs) {
      await ctx.db.insert("contacts", {
        workspaceId: args.workspaceId,
        firstName: doc.firstName,
        lastName: doc.lastName,
        company: doc.company,
        email: doc.email,
        phone: doc.phone,
        street: doc.street,
        postalCode: doc.postalCode,
        city: doc.city,
        country: doc.country,
        callCount: 0,
        tags: ["moneybird-import"],
        externalId: `moneybird:${doc.moneybirdId}`,
      });
      inserted++;
    }
    return { inserted };
  },
});

/** Verificatie-teller voor de Moneybird-import (scan, eenmalig gebruik). */
export const countMoneybirdContacts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("contacts").collect();
    return rows.filter((r) => r.externalId?.startsWith("moneybird:")).length;
  },
});

// ──────────────────────────────────────────────────────────────────────
// LEAD ATTRIBUTION ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedLeadAttributions = internalQuery({
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
export const upsertLeadAttributionBatch = internalMutation({
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

export const countMigratedMetaLeadRaws = internalQuery({
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
export const upsertMetaLeadRawBatch = internalMutation({
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

// ──────────────────────────────────────────────────────────────────────
// NOTES ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedNotes = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("notes")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const noteDocValidator = v.object({
  legacyId: v.number(),
  legacyContactId: v.number(),
  body: v.string(),
  isPinned: v.optional(v.boolean()),
});

/**
 * Batch-upsert notes vanuit Neon. FK contact_id wordt naar Convex
 * contactId geresolved via by_legacyContactId. createdById blijft
 * undefined — v1 users zijn niet 1-op-1 met Convex Auth users.
 */
export const upsertNotesBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    docs: v.array(noteDocValidator),
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
        .query("notes")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        contactId: contact._id,
        body: doc.body,
        isPinned: doc.isPinned,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("notes", {
          ...patch,
          workspaceId: args.workspaceId,
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
// OPPORTUNITIES ETL
// ──────────────────────────────────────────────────────────────────────

/**
 * Helper voor het opportunity-script: geeft de default pipeline + stages
 * van de target workspace terug, met stage-names. Het script gebruikt
 * dat om v1 stage_id → v2 stageId te mappen op naam.
 */
export const getStaycoolPipelineWithStages = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!pipeline) return null;

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
      .collect();

    return {
      pipelineId: pipeline._id,
      stages: stages.map((s) => ({
        _id: s._id,
        name: s.name,
        order: s.order,
        isWonStage: s.isWonStage,
        isLostStage: s.isLostStage,
      })),
    };
  },
});

export const countMigratedOpportunities = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("opportunities")
      .withIndex("by_workspace_stage", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const opportunityDocValidator = v.object({
  legacyId: v.number(),
  legacyContactId: v.number(),
  stageId: v.id("pipelineStages"),
  pipelineId: v.id("pipelines"),
  title: v.string(),
  value: v.optional(v.number()),
  currency: v.optional(v.string()),
  expectedCloseDate: v.optional(v.number()),
  closedAt: v.optional(v.number()),
  closedReason: v.optional(v.string()),
  description: v.optional(v.string()),
});

/**
 * Batch-upsert opportunities. Het script doet de stage-name → stageId
 * mapping client-side (via getStaycoolPipelineWithStages) en stuurt
 * directe Convex IDs door. assignedToId blijft undefined — v1 users
 * zijn niet 1-op-1 met Convex Auth.
 */
export const upsertOpportunitiesBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    docs: v.array(opportunityDocValidator),
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
        .query("opportunities")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        contactId: contact._id,
        pipelineId: doc.pipelineId,
        stageId: doc.stageId,
        title: doc.title,
        value: doc.value,
        currency: doc.currency,
        expectedCloseDate: doc.expectedCloseDate,
        closedAt: doc.closedAt,
        closedReason: doc.closedReason,
        description: doc.description,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("opportunities", {
          ...patch,
          workspaceId: args.workspaceId,
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
// OPPORTUNITY STAGE HISTORY ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedStageHistory = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("opportunityStageHistory").collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const stageHistoryDocValidator = v.object({
  legacyId: v.number(),
  legacyOpportunityId: v.number(),
  fromStageId: v.optional(v.id("pipelineStages")),
  toStageId: v.id("pipelineStages"),
});

/**
 * Batch-upsert opportunity_stage_history. opportunity_id wordt
 * geresolved via by_legacyId op opportunities. Skip-counter voor rows
 * waarvan de opportunity nog niet bestaat (orphan).
 */
export const upsertStageHistoryBatch = internalMutation({
  args: { docs: v.array(stageHistoryDocValidator) },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let skippedNoOpportunity = 0;

    for (const doc of args.docs) {
      const opp = await ctx.db
        .query("opportunities")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyOpportunityId))
        .first();
      if (!opp) {
        skippedNoOpportunity++;
        continue;
      }

      const existing = await ctx.db
        .query("opportunityStageHistory")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        opportunityId: opp._id,
        fromStageId: doc.fromStageId,
        toStageId: doc.toStageId,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("opportunityStageHistory", {
          ...patch,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return {
      inserted,
      updated,
      skippedNoOpportunity,
      total: args.docs.length,
    };
  },
});

// ──────────────────────────────────────────────────────────────────────
// CUSTOM FIELD DEFINITIONS ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedCustomFieldDefs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_workspace_entity", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const customFieldDefDocValidator = v.object({
  legacyId: v.number(),
  entityType: v.union(v.literal("contact"), v.literal("opportunity")),
  key: v.string(),
  label: v.string(),
  fieldType: v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("date"),
    v.literal("select"),
  ),
  selectOptions: v.optional(v.array(v.string())),
  isRequired: v.boolean(),
  sortOrder: v.number(),
});

export const upsertCustomFieldDefsBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    docs: v.array(customFieldDefDocValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const doc of args.docs) {
      const existing = await ctx.db
        .query("customFieldDefinitions")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        entityType: doc.entityType,
        key: doc.key,
        label: doc.label,
        fieldType: doc.fieldType,
        selectOptions: doc.selectOptions,
        isRequired: doc.isRequired,
        sortOrder: doc.sortOrder,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("customFieldDefinitions", {
          ...patch,
          workspaceId: args.workspaceId,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return { inserted, updated, total: args.docs.length };
  },
});

// ──────────────────────────────────────────────────────────────────────
// CUSTOM FIELD VALUES ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedCustomFieldValues = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("customFieldValues").collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const customFieldValueDocValidator = v.object({
  legacyId: v.number(),
  legacyDefinitionId: v.number(),
  entityType: v.union(v.literal("contact"), v.literal("opportunity")),
  // Voor "contact": v1 contacts.id. Voor "opportunity": v1 opportunities.id.
  legacyEntityId: v.number(),
  value: v.any(),
});

/**
 * Batch-upsert customFieldValues. Resolved drie FK's:
 *  - definitionId via by_legacyId op customFieldDefinitions
 *  - entityId via by_legacyContactId (contact) of by_legacyId (opp)
 *
 * Skipt rows met onresolved FK. entityId wordt opgeslagen als string
 * (per v2 schema, voor cross-table use).
 */
export const upsertCustomFieldValuesBatch = internalMutation({
  args: { docs: v.array(customFieldValueDocValidator) },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let skippedNoDefinition = 0;
    let skippedNoEntity = 0;

    for (const doc of args.docs) {
      const definition = await ctx.db
        .query("customFieldDefinitions")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyDefinitionId))
        .first();
      if (!definition) {
        skippedNoDefinition++;
        continue;
      }

      let entityId: string | undefined;
      if (doc.entityType === "contact") {
        const contact = await ctx.db
          .query("contacts")
          .withIndex("by_legacyContactId", (q) =>
            q.eq("legacyContactId", doc.legacyEntityId),
          )
          .first();
        entityId = contact?._id;
      } else {
        const opp = await ctx.db
          .query("opportunities")
          .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyEntityId))
          .first();
        entityId = opp?._id;
      }
      if (!entityId) {
        skippedNoEntity++;
        continue;
      }

      const existing = await ctx.db
        .query("customFieldValues")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        definitionId: definition._id,
        entityType: doc.entityType,
        entityId,
        value: doc.value,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("customFieldValues", {
          ...patch,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return {
      inserted,
      updated,
      skippedNoDefinition,
      skippedNoEntity,
      total: args.docs.length,
    };
  },
});

// ──────────────────────────────────────────────────────────────────────
// MESSAGE LOG ETL (v1 message_log → v2 messages, channel=sms/wa/messenger)
// ──────────────────────────────────────────────────────────────────────

export const countMigratedMessageLog = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Bounded: filter op channel != email + legacyId aanwezig.
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("channel", "sms"),
      )
      .collect();
    const wa = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("channel", "whatsapp"),
      )
      .collect();
    const mes = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("channel", "messenger"),
      )
      .collect();
    return [...rows, ...wa, ...mes].filter((r) => r.legacyId !== undefined).length;
  },
});

const messageLogDocValidator = v.object({
  legacyId: v.number(),
  channel: v.union(
    v.literal("sms"),
    v.literal("whatsapp"),
    v.literal("messenger"),
  ),
  direction: v.union(v.literal("outbound"), v.literal("inbound")),
  status: v.union(
    v.literal("pending"),
    v.literal("sent"),
    v.literal("delivered"),
    v.literal("read"),
    v.literal("failed"),
    v.literal("bounced"),
    v.literal("rate_limited"),
  ),
  externalMessageId: v.optional(v.string()),
  to: v.string(),
  from: v.optional(v.string()),
  body: v.string(),
  mediaUrl: v.optional(v.string()),
  mediaType: v.optional(v.string()),
  templateVariables: v.optional(v.any()),
  errorMessage: v.optional(v.string()),
  legacyContactId: v.optional(v.number()),
  relatedEntityType: v.optional(v.string()),
  relatedEntityId: v.optional(v.string()),
  metadata: v.optional(v.any()),
  sentAt: v.optional(v.number()),
  deliveredAt: v.optional(v.number()),
  readAt: v.optional(v.number()),
});

/**
 * Batch-upsert v1 message_log → v2 messages. workspaceId is verplicht
 * in messages — rows met workspace_id=null in v1 worden door het script
 * geskipt (SQL filter). contact_id via legacyContactId lookup, optional.
 */
export const upsertMessageLogBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    docs: v.array(messageLogDocValidator),
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
        .query("messages")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        contactId,
        channel: doc.channel,
        direction: doc.direction,
        status: doc.status,
        externalMessageId: doc.externalMessageId,
        to: doc.to,
        from: doc.from,
        body: doc.body,
        mediaUrl: doc.mediaUrl,
        mediaType: doc.mediaType,
        templateVariables: doc.templateVariables,
        errorMessage: doc.errorMessage,
        relatedEntityType: doc.relatedEntityType,
        relatedEntityId: doc.relatedEntityId,
        metadata: doc.metadata,
        sentAt: doc.sentAt,
        deliveredAt: doc.deliveredAt,
        readAt: doc.readAt,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("messages", {
          ...patch,
          workspaceId: args.workspaceId,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return { inserted, updated, total: args.docs.length };
  },
});

// ──────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedEmailTemplates = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("emailTemplates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const emailTemplateDocValidator = v.object({
  legacyId: v.number(),
  name: v.string(),
  subject: v.string(),
  body: v.string(),
  description: v.optional(v.string()),
  isSystem: v.boolean(),
});

export const upsertEmailTemplatesBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    docs: v.array(emailTemplateDocValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const doc of args.docs) {
      const existing = await ctx.db
        .query("emailTemplates")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        name: doc.name,
        subject: doc.subject,
        body: doc.body,
        description: doc.description,
        isSystem: doc.isSystem,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("emailTemplates", {
          ...patch,
          workspaceId: args.workspaceId,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return { inserted, updated, total: args.docs.length };
  },
});

// ──────────────────────────────────────────────────────────────────────
// WORKFLOWS ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedWorkflows = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Bounded set: filter op workspaceId, dan check legacyId aanwezigheid
    const draft = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "draft"),
      )
      .collect();
    const active = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "active"),
      )
      .collect();
    const paused = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "paused"),
      )
      .collect();
    const archived = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "archived"),
      )
      .collect();
    return [...draft, ...active, ...paused, ...archived].filter(
      (r) => r.legacyId !== undefined,
    ).length;
  },
});

const workflowDocValidator = v.object({
  legacyId: v.number(),
  name: v.string(),
  description: v.optional(v.string()),
  status: v.union(
    v.literal("draft"),
    v.literal("active"),
    v.literal("paused"),
    v.literal("archived"),
  ),
  triggerConfig: v.array(v.object({ type: v.string(), nodeId: v.string() })),
  version: v.number(),
  totalExecutions: v.number(),
  successfulExecutions: v.number(),
  failedExecutions: v.number(),
  lastExecutedAt: v.optional(v.number()),
});

export const upsertWorkflowsBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    docs: v.array(workflowDocValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const doc of args.docs) {
      const existing = await ctx.db
        .query("workflows")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        name: doc.name,
        description: doc.description,
        status: doc.status,
        triggerConfig: doc.triggerConfig,
        version: doc.version,
        totalExecutions: doc.totalExecutions,
        successfulExecutions: doc.successfulExecutions,
        failedExecutions: doc.failedExecutions,
        lastExecutedAt: doc.lastExecutedAt,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("workflows", {
          ...patch,
          workspaceId: args.workspaceId,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return { inserted, updated, total: args.docs.length };
  },
});

// ──────────────────────────────────────────────────────────────────────
// WORKFLOW NODES ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedWorkflowNodes = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("workflowNodes").collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const workflowNodeDocValidator = v.object({
  legacyId: v.number(),
  legacyWorkflowId: v.number(),
  nodeId: v.string(),
  type: v.union(
    v.literal("trigger"),
    v.literal("action"),
    v.literal("condition"),
    v.literal("delay"),
  ),
  subType: v.optional(v.string()),
  positionX: v.number(),
  positionY: v.number(),
  config: v.any(),
  label: v.optional(v.string()),
});

export const upsertWorkflowNodesBatch = internalMutation({
  args: { docs: v.array(workflowNodeDocValidator) },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let skippedNoWorkflow = 0;

    for (const doc of args.docs) {
      const workflow = await ctx.db
        .query("workflows")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyWorkflowId))
        .first();
      if (!workflow) {
        skippedNoWorkflow++;
        continue;
      }

      const existing = await ctx.db
        .query("workflowNodes")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        workflowId: workflow._id,
        nodeId: doc.nodeId,
        type: doc.type,
        subType: doc.subType,
        positionX: doc.positionX,
        positionY: doc.positionY,
        config: doc.config,
        label: doc.label,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("workflowNodes", {
          ...patch,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return {
      inserted,
      updated,
      skippedNoWorkflow,
      total: args.docs.length,
    };
  },
});

// ──────────────────────────────────────────────────────────────────────
// WORKFLOW EDGES ETL
// ──────────────────────────────────────────────────────────────────────

export const countMigratedWorkflowEdges = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("workflowEdges").collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const workflowEdgeDocValidator = v.object({
  legacyId: v.number(),
  legacyWorkflowId: v.number(),
  sourceNodeId: v.string(),
  targetNodeId: v.string(),
  branchLabel: v.optional(v.string()),
});

export const upsertWorkflowEdgesBatch = internalMutation({
  args: { docs: v.array(workflowEdgeDocValidator) },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let skippedNoWorkflow = 0;

    for (const doc of args.docs) {
      const workflow = await ctx.db
        .query("workflows")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyWorkflowId))
        .first();
      if (!workflow) {
        skippedNoWorkflow++;
        continue;
      }

      const existing = await ctx.db
        .query("workflowEdges")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        workflowId: workflow._id,
        sourceNodeId: doc.sourceNodeId,
        targetNodeId: doc.targetNodeId,
        branchLabel: doc.branchLabel,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("workflowEdges", {
          ...patch,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return {
      inserted,
      updated,
      skippedNoWorkflow,
      total: args.docs.length,
    };
  },
});

// ──────────────────────────────────────────────────────────────────────
// NOTIFICATIONS ETL
// ──────────────────────────────────────────────────────────────────────

/**
 * Helper voor het notifications-script: vind de super-admin user-id om
 * v1 notifications met user_id=25 (Marvin) op te mappen naar v2.
 */
export const getSuperAdminUserId = internalQuery({
  args: {},
  handler: async (ctx) => {
    const profile = await ctx.db
      .query("userProfiles")
      .filter((q) => q.eq(q.field("isSuperAdmin"), true))
      .first();
    return profile?.userId ?? null;
  },
});

export const countMigratedNotifications = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return rows.filter((r) => r.legacyId !== undefined).length;
  },
});

const notificationDocValidator = v.object({
  legacyId: v.number(),
  type: v.string(),
  title: v.string(),
  body: v.optional(v.string()),
  actionUrl: v.optional(v.string()),
  relatedEntityType: v.optional(v.string()),
  relatedEntityId: v.optional(v.string()),
  isRead: v.boolean(),
});

export const upsertNotificationsBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    docs: v.array(notificationDocValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const doc of args.docs) {
      const existing = await ctx.db
        .query("notifications")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", doc.legacyId))
        .first();

      const patch = {
        type: doc.type,
        title: doc.title,
        body: doc.body,
        actionUrl: doc.actionUrl,
        relatedEntityType: doc.relatedEntityType,
        relatedEntityId: doc.relatedEntityId,
        isRead: doc.isRead,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("notifications", {
          ...patch,
          workspaceId: args.workspaceId,
          userId: args.userId,
          legacyId: doc.legacyId,
        });
        inserted++;
      }
    }

    return { inserted, updated, total: args.docs.length };
  },
});

// ════════════════════════════════════════════════════════════════════
// PIPELINE-REBUILD (cutover-prep) — zet de default pipeline op de exacte
// 7-staps v1-belfunnel. Idempotent: bestaande stage met dezelfde naam
// wordt gepatcht (order/flags/color), ontbrekende wordt ingevoegd.
// Verwijdert NIETS (oude stages met opps blijven staan tot na de re-sync;
// daarna prunen via pruneEmptyPipelineStages).
// ════════════════════════════════════════════════════════════════════
const FUNNEL_7 = [
  { name: "Nieuw", order: 0, color: "#3b82f6", isWonStage: false, isLostStage: false },
  { name: "1x Gebeld", order: 1, color: "#6366f1", isWonStage: false, isLostStage: false },
  { name: "2x Gebeld", order: 2, color: "#8b5cf6", isWonStage: false, isLostStage: false },
  { name: "3x Gebeld", order: 3, color: "#a855f7", isWonStage: false, isLostStage: false },
  { name: "Afspraak ingepland", order: 4, color: "#f59e0b", isWonStage: false, isLostStage: false },
  { name: "Gewonnen", order: 5, color: "#22c55e", isWonStage: true, isLostStage: false },
  { name: "Verloren", order: 6, color: "#ef4444", isWonStage: false, isLostStage: true },
];

export const rebuildStaycoolPipeline7Stage = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const pipeline = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!pipeline) throw new Error("Geen default pipeline voor workspace");

    const existing = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
      .collect();
    const byName = new Map(existing.map((s) => [s.name, s]));

    const stages: Record<string, Id<"pipelineStages">> = {};
    for (const d of FUNNEL_7) {
      const ex = byName.get(d.name);
      if (ex) {
        await ctx.db.patch(ex._id, {
          order: d.order,
          color: d.color,
          isWonStage: d.isWonStage,
          isLostStage: d.isLostStage,
        });
        stages[d.name] = ex._id;
      } else {
        stages[d.name] = await ctx.db.insert("pipelineStages", {
          pipelineId: pipeline._id,
          name: d.name,
          order: d.order,
          color: d.color,
          isWonStage: d.isWonStage,
          isLostStage: d.isLostStage,
        });
      }
    }

    const desired = new Set(FUNNEL_7.map((d) => d.name));
    const leftover: Array<{ name: string; stageId: Id<"pipelineStages">; opps: number }> = [];
    for (const s of existing) {
      if (desired.has(s.name)) continue;
      const opps = await ctx.db
        .query("opportunities")
        .withIndex("by_workspace_stage", (q) =>
          q.eq("workspaceId", workspaceId).eq("stageId", s._id),
        )
        .collect();
      leftover.push({ name: s.name, stageId: s._id, opps: opps.length });
    }

    return { pipelineId: pipeline._id, stages, leftover };
  },
});

/** Verwijdert pipeline-stages die NIET in de 7-staps funnel zitten én 0 opps
 * hebben. Draai NA de opp-re-sync (die opps her-mapt naar de 7 stages). */
export const pruneEmptyPipelineStages = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const pipeline = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!pipeline) throw new Error("Geen default pipeline voor workspace");

    const desired = new Set(FUNNEL_7.map((d) => d.name));
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
      .collect();

    const deleted: string[] = [];
    const keptWithOpps: Array<{ name: string; opps: number }> = [];
    for (const s of stages) {
      if (desired.has(s.name)) continue;
      const opps = await ctx.db
        .query("opportunities")
        .withIndex("by_workspace_stage", (q) =>
          q.eq("workspaceId", workspaceId).eq("stageId", s._id),
        )
        .collect();
      if (opps.length === 0) {
        await ctx.db.delete(s._id);
        deleted.push(s.name);
      } else {
        keptWithOpps.push({ name: s.name, opps: opps.length });
      }
    }
    return { deleted, keptWithOpps };
  },
});

/** Ruimt opps op die in een NIET-funnel-stage hangen (oude 5-staps rest):
 * mét legacyId (echte v1-opp) → verplaats naar Nieuw; zónder legacyId
 * (seed/test-opp) → verwijderen. Draai vóór pruneEmptyPipelineStages. */
export const cleanupNonFunnelOpps = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const pipeline = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!pipeline) throw new Error("Geen default pipeline voor workspace");

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
      .collect();
    const funnel = new Set(FUNNEL_7.map((d) => d.name));
    const nieuw = stages.find((s) => s.name === "Nieuw");
    if (!nieuw) throw new Error("Stage 'Nieuw' ontbreekt — draai eerst rebuild");

    const moved: number[] = [];
    const deleted: string[] = [];
    for (const s of stages) {
      if (funnel.has(s.name)) continue;
      const opps = await ctx.db
        .query("opportunities")
        .withIndex("by_workspace_stage", (q) =>
          q.eq("workspaceId", workspaceId).eq("stageId", s._id),
        )
        .collect();
      for (const o of opps) {
        if (o.legacyId != null) {
          await ctx.db.patch(o._id, { stageId: nieuw._id });
          moved.push(o.legacyId);
        } else {
          await ctx.db.delete(o._id);
          deleted.push(o._id);
        }
      }
    }
    return { movedLegacyIds: moved, deletedSeedOpps: deleted.length };
  },
});

// ════════════════════════════════════════════════════════════════════
// CLEAN-SLATE MESSAGES (cutover-keuze Marvin): prod start met lege
// /messages; alleen NIEUWE binnenkomende berichten verschijnen. De
// historische berichten blijven volledig in v1 bestaan (niets verloren).
// ════════════════════════════════════════════════════════════════════
export const deleteWorkspaceMessagesBatch = internalMutation({
  args: { workspaceId: v.id("workspaces"), limit: v.number() },
  handler: async (ctx, { workspaceId, limit }) => {
    const batch = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .take(limit);
    for (const m of batch) await ctx.db.delete(m._id);
    return batch.length;
  },
});

/** Wist ALLE messages van de workspace (gebatcht, idempotent qua effect).
 * Historie blijft in v1. Run: npx convex run migration:clearWorkspaceMessages */
export const clearWorkspaceMessages = internalAction({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }): Promise<{ totalDeleted: number }> => {
    let total = 0;
    for (;;) {
      const n: number = await ctx.runMutation(
        internal.migration.deleteWorkspaceMessagesBatch,
        { workspaceId, limit: 500 },
      );
      total += n;
      if (n < 500) break;
    }
    return { totalDeleted: total };
  },
});

/** Per-stage opp-telling voor de default pipeline — verificatie van de sync. */
export const getStageDistribution = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const pipeline = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!pipeline) throw new Error("Geen default pipeline voor workspace");
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
      .collect();
    const out: Array<{ name: string; order: number; count: number }> = [];
    let total = 0;
    for (const s of stages.sort((a, b) => a.order - b.order)) {
      const opps = await ctx.db
        .query("opportunities")
        .withIndex("by_workspace_stage", (q) =>
          q.eq("workspaceId", workspaceId).eq("stageId", s._id),
        )
        .collect();
      out.push({ name: s.name, order: s.order, count: opps.length });
      total += opps.length;
    }
    return { total, stages: out };
  },
});

/** Herlink een provider-authAccount naar een andere user. Nodig omdat
 * Convex Auth providers NIET automatisch op e-mail koppelt → een 2e login-
 * methode (bv. Google) maakt een duplicate user los van de tenant-eigenaar.
 * Repoint het account naar de originele user; daarna log-uit + opnieuw in. */
export const relinkAuthAccount = internalMutation({
  args: {
    accountId: v.id("authAccounts"),
    toUserId: v.id("users"),
  },
  handler: async (ctx, { accountId, toUserId }) => {
    const acc = await ctx.db.get(accountId);
    if (!acc) throw new Error("authAccount niet gevonden");
    const target = await ctx.db.get(toUserId);
    if (!target) throw new Error("doel-user niet gevonden");
    const from = acc.userId;
    await ctx.db.patch(accountId, { userId: toUserId });
    return { accountId, provider: acc.provider, from, to: toUserId };
  },
});

/** Clerk-cutover: cement de link tussen een bestaande users-rij en het
 * Clerk-account op de gedeelde wetry-instance, VÓÓR de frontend-cutover.
 * Zo landt lib/identity's by_clerk_user-lookup gegarandeerd op de juiste
 * rij (die met profile/membership/org-ownership), ongeacht met welk
 * e-mailadres het Clerk-account binnenkomt — de e-mail-match in
 * ensureUserId blijft puur als vangnet voor toekomstige users. Guard:
 * weigert als het Clerk-id al aan een ándere rij hangt (voorkomt de
 * .unique()-runtime-error in de brug). */
export const setClerkUserId = internalMutation({
  args: {
    userId: v.id("users"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, { userId, clerkUserId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("user niet gevonden");
    const taken = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (taken && taken._id !== userId) {
      throw new Error(`clerkUserId hangt al aan user ${taken._id}`);
    }
    await ctx.db.patch(userId, { clerkUserId });
    return { userId, clerkUserId, email: user.email };
  },
});

/**
 * Eenmalige backfill: zet leadAttribution.workspaceId vanuit het gekoppelde
 * contact. Batched (max 500/call) + idempotent. Run herhaald tot processed===0.
 * Rijen met een onvindbaar contact worden geteld als skipped (blijven over;
 * verwaarloosbaar — de "tot processed===0"-loop stopt zodra alleen orphans resten).
 */
export const backfillLeadAttributionWorkspace = internalMutation({
  args: {},
  handler: async (ctx) => {
    const batch = await ctx.db
      .query("leadAttribution")
      .filter((q) => q.eq(q.field("workspaceId"), undefined))
      .take(500);

    let processed = 0;
    let skipped = 0;
    for (const row of batch) {
      const contact = await ctx.db.get(row.contactId);
      if (!contact) {
        skipped++;
        continue;
      }
      await ctx.db.patch(row._id, { workspaceId: contact.workspaceId });
      processed++;
    }

    const rest = await ctx.db
      .query("leadAttribution")
      .filter((q) => q.eq(q.field("workspaceId"), undefined))
      .take(1);

    return { processed, skipped, remaining: rest.length };
  },
});

// ════════════════════════════════════════════════════════════════════
// REPAIR — contacten met een bel-uitkomst (opgenomen-afspraak, niet
// geïnteresseerd, ongeldig nummer, onbereikbaar 3x, buiten gebied) maar
// nóg open opps in een actieve stage. Historisch verplaatsten de
// disposition-mutaties maar één opp per contact; duplicaten (V1-import /
// re-submissions) bleven in "Nieuw" hangen → lead bleef op het dashboard.
// Idempotent. dryRun: true → alleen tellen, niets wijzigen.
// ════════════════════════════════════════════════════════════════════
export const repairDispositionedOpenOpps = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { workspaceId, dryRun }) => {
    const pipeline = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!pipeline) throw new Error("Geen default pipeline voor workspace");

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
      .collect();
    const lost = stages.find((s) => s.isLostStage);
    const active = stages
      .filter((s) => !s.isWonStage && !s.isLostStage)
      .sort((a, b) => a.order - b.order);
    const qualified = active[active.length - 1]; // "Afspraak ingepland"
    if (!lost || !qualified) {
      throw new Error("Geen lost- of qualified-stage in default pipeline");
    }

    const perReason: Record<string, number> = {};
    let moved = 0;

    for (const stage of active) {
      const opps = await ctx.db
        .query("opportunities")
        .withIndex("by_workspace_stage", (q) =>
          q.eq("workspaceId", workspaceId).eq("stageId", stage._id),
        )
        .collect();
      for (const opp of opps) {
        if (opp.closedAt !== undefined) continue;
        const contact = await ctx.db.get(opp.contactId);
        if (!contact) continue;

        let target: typeof lost | typeof qualified | null = null;
        let reason = "";
        if (contact.lastCallResult === "answered_appointment") {
          target = qualified;
          reason = "repair_answered_appointment";
        } else if (contact.lastCallResult === "answered_not_interested") {
          target = lost;
          reason = "repair_not_interested";
        } else if (contact.lastCallResult === "invalid") {
          target = lost;
          reason = "repair_invalid_number";
        } else if (contact.unreachable) {
          target = lost;
          reason = "repair_unreachable";
        } else if (contact.outsideArea) {
          target = lost;
          reason = "repair_outside_area";
        }
        if (!target || target._id === opp.stageId) continue;

        perReason[reason] = (perReason[reason] ?? 0) + 1;
        moved++;
        if (dryRun) continue;

        const updates: Record<string, unknown> = { stageId: target._id };
        if (target.isLostStage) {
          updates.closedAt = Date.now();
          updates.closedReason = reason;
        }
        await ctx.db.patch(opp._id, updates);
        await ctx.db.insert("opportunityStageHistory", {
          opportunityId: opp._id,
          fromStageId: opp.stageId,
          toStageId: target._id,
        });
      }
    }

    return { dryRun: dryRun ?? false, planned: moved, perReason };
  },
});

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * ETL helpers — alleen via Convex deploy-key callable. Geen auth-check
 * binnen omdat internalMutation per definitie privé is voor het Convex
 * project; runtime-clients (UI) kunnen ze niet aanroepen.
 *
 * Gebruikt door scripts/migrate-contacts.ts (Node-side) om data uit
 * Neon naar Convex te porten. Idempotent via legacyContactId index:
 * rerun is veilig — bestaande rows worden gepatcht in plaats van
 * gedupliceerd.
 */

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

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  buildSourceMap,
  compareContacts,
  contactMatchesSearch,
  normalizeForSearch,
} from "./contactSearch";

/**
 * Read-only contact-API voor de andere wetry-apps (cashflow / frostwork).
 *
 * Leadflow blijft de ENIGE bron van contacten; dit voegt alleen LEZEN toe en
 * raakt de contacts-tabel of de bestaande queries niet. Deze internalQueries
 * draaien bewust GEEN auth-guard — ze zijn uitsluitend aanroepbaar vanuit de
 * HTTP-read-endpoints in http.ts, die met READ_API_KEY beveiligd zijn en de
 * workspace hard op de StayCool-workspace pinnen.
 */

/** Magere projectie die we cross-app teruggeven (geen interne CRM-velden). */
function publicContact(c: Doc<"contacts">) {
  return {
    id: c._id,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    company: c.company ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    street: c.street ?? null,
    houseNumber: c.houseNumber ?? null,
    postalCode: c.postalCode ?? null,
    city: c.city ?? null,
    country: c.country ?? null,
  };
}

/** Zoek contacten binnen de StayCool-workspace (naam / e-mail / telefoon). */
export const searchForStaycool = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const term = args.search ? normalizeForSearch(args.search) : "";
    const attributions = await ctx.db
      .query("leadAttribution")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const sourceMap = buildSourceMap(attributions);

    const matched = all
      .filter((c) => contactMatchesSearch(c, term))
      .sort((a, b) => compareContacts(a, b, "name_asc"));

    const limit = args.limit ?? 25;
    return {
      contacts: matched.slice(0, limit).map((c) => ({
        ...publicContact(c),
        source: sourceMap.get(c._id) ?? null,
      })),
      total: matched.length,
    };
  },
});

/** Eén contact ophalen (geverifieerd dat het in de StayCool-workspace zit). */
export const getDetailForStaycool = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.contactId);
    if (!c || c.workspaceId !== args.workspaceId || c.deletedAt !== undefined) {
      return null;
    }
    const attribution = await ctx.db
      .query("leadAttribution")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .first();
    return { contact: publicContact(c), source: attribution?.source ?? null };
  },
});

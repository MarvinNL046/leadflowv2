import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { publicContact } from "./contactsRead";
import {
  insertContactWithSearchText,
  refreshContactSearchText,
} from "./lib/contactWrite";

/**
 * Write-kant van de cross-app contact-API. De suite-apps (cashflow /
 * frostwork) mogen via het `/api/contacts/create` HTTP-endpoint een NIEUW
 * contact in leadflow aanmaken wanneer een klant telefonisch binnenkwam en
 * dus nog niet in de CRM stond. Zo blijft leadflow de enige bron van
 * contacten, maar hoeft de gebruiker niet weg te klikken uit z'n offerte.
 *
 * Auth + workspace-pinning gebeurt in http.ts (WEBSITE_API_KEY, single
 * tenant Staycool). Deze internalMutation is bewust GEEN volledige
 * lead-ingest: geen opportunity in de pipeline en geen speed-to-lead-
 * trigger — de klant wordt al geoffreerd, dus een AI-auto-reactie zou
 * verkeerd zijn. Wil Marvin er een deal van maken, dan sleept hij 'm in
 * Leadflow zelf de Kanban in.
 *
 * Dedup identiek aan ingestWebsiteLead: e-mail eerst, dan telefoon, binnen
 * de workspace; bij een match worden alleen lege velden aangevuld (nooit
 * overschreven). Retourneert dezelfde publieke projectie als de
 * search/get-endpoints zodat de consument 'm direct kan linken.
 */
export const createContactFromApp = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    street: v.optional(v.string()),
    houseNumber: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error(`Workspace ${args.workspaceId} bestaat niet`);

    const normalizedEmail = args.email?.toLowerCase().trim() || undefined;
    const normalizedPhone = args.phone
      ? args.phone.replace(/[^\d+]/g, "")
      : undefined;

    // Dedup: e-mail-match eerst, dan telefoon-match — beide binnen workspace.
    let contact = normalizedEmail
      ? await ctx.db
          .query("contacts")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", workspace._id).eq("email", normalizedEmail),
          )
          .first()
      : null;
    if (!contact && normalizedPhone) {
      contact = await ctx.db
        .query("contacts")
        .withIndex("by_workspace_phone", (q) =>
          q.eq("workspaceId", workspace._id).eq("phone", normalizedPhone),
        )
        .first();
    }

    if (contact) {
      // Merge: alleen lege velden invullen, niet overschrijven.
      const merged: Record<string, string | undefined> = {};
      if (!contact.firstName && args.firstName) merged.firstName = args.firstName;
      if (!contact.lastName && args.lastName) merged.lastName = args.lastName;
      if (!contact.company && args.company) merged.company = args.company;
      if (!contact.email && normalizedEmail) merged.email = normalizedEmail;
      if (!contact.phone && normalizedPhone) merged.phone = normalizedPhone;
      if (!contact.street && args.street) merged.street = args.street;
      if (!contact.houseNumber && args.houseNumber)
        merged.houseNumber = args.houseNumber;
      if (!contact.postalCode && args.postalCode)
        merged.postalCode = args.postalCode;
      if (!contact.city && args.city) merged.city = args.city;
      if (!contact.country && args.country) merged.country = args.country;
      if (Object.keys(merged).length > 0) {
        await ctx.db.patch(contact._id, merged);
        // Merge kan zoekvelden gevuld hebben → searchText bijwerken.
        await refreshContactSearchText(ctx, contact._id);
      }
      const fresh = await ctx.db.get(contact._id);
      return { contact: publicContact(fresh!), created: false };
    }

    const contactId = await insertContactWithSearchText(ctx, {
      workspaceId: workspace._id,
      firstName: args.firstName,
      lastName: args.lastName,
      company: args.company,
      email: normalizedEmail,
      phone: normalizedPhone,
      street: args.street,
      houseNumber: args.houseNumber,
      postalCode: args.postalCode,
      city: args.city,
      country: args.country,
      callCount: 0,
    });

    // Attribution → herkenbare bron-badge in de CRM (bv. "Cashflow").
    await ctx.db.insert("leadAttribution", {
      contactId,
      workspaceId: workspace._id,
      source: "api",
      utmSource: args.source,
    });

    const created = await ctx.db.get(contactId);
    return { contact: publicContact(created!), created: true };
  },
});

/**
 * Zet één tag op een set BESTAANDE contacten (matcht op contact-id en/of
 * e-mail, binnen de workspace). Gebruikt door het `/api/contacts/tag`-endpoint
 * zodat een suite-app (cashflow) een marketing-segment als tag kan wegschrijven
 * — daarna maakt de eigenaar in leadflow een segment op die tag en verstuurt
 * een broadcast. Idempotent: een contact dat de tag al heeft wordt niet dubbel
 * getagd. Er worden NOOIT nieuwe contacten aangemaakt.
 */
export const tagContactsFromApp = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    tag: v.string(),
    contactIds: v.optional(v.array(v.string())),
    emails: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error(`Workspace ${args.workspaceId} bestaat niet`);
    const tag = args.tag.trim();
    if (!tag) return { tagged: 0, alreadyTagged: 0, notFound: 0 };

    const seen = new Set<string>(); // contact-_id's, dedup over id+email heen
    let tagged = 0;
    let alreadyTagged = 0;
    let notFound = 0;

    const applyTag = async (contact: {
      _id: import("./_generated/dataModel").Id<"contacts">;
      tags?: string[];
    }) => {
      if (seen.has(contact._id)) return;
      seen.add(contact._id);
      const tags = contact.tags ?? [];
      if (tags.includes(tag)) {
        alreadyTagged += 1;
        return;
      }
      await ctx.db.patch(contact._id, { tags: [...tags, tag] });
      tagged += 1;
    };

    for (const id of args.contactIds ?? []) {
      const cid = ctx.db.normalizeId("contacts", id);
      if (!cid) {
        notFound += 1;
        continue;
      }
      const contact = await ctx.db.get(cid);
      if (!contact || contact.workspaceId !== workspace._id) {
        notFound += 1;
        continue;
      }
      await applyTag(contact);
    }

    for (const rawEmail of args.emails ?? []) {
      const email = rawEmail.toLowerCase().trim();
      if (!email) {
        notFound += 1;
        continue;
      }
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_workspace_email", (q) =>
          q.eq("workspaceId", workspace._id).eq("email", email),
        )
        .first();
      if (!contact) {
        notFound += 1;
        continue;
      }
      await applyTag(contact);
    }

    return { tagged, alreadyTagged, notFound };
  },
});

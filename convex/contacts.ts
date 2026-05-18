import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Contacts queries + mutations voor het CRM core.
 *
 * Multi-tenant guard: elke query/mutation valideert dat de current user
 * lid is van de target workspace via memberships. Geen leak tussen
 * workspaces ook al kent een lekkende client een workspaceId.
 */

/**
 * Helper: assert dat de current user member is van de gegeven workspace.
 * Returnt de user-id voor downstream gebruik. Throws op niet-auth of
 * non-member.
 */
async function requireWorkspaceMembership(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Workspace bestaat?
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  // User member van deze org?
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();

  if (!membership) {
    throw new Error("Not a member of this workspace");
  }

  return userId;
}

/**
 * List contacts voor een workspace, nieuwste eerst. Geen filter/paginering
 * in v1 — limit 100 voor de demo. Voor productie: cursor-paginering en
 * tags/search filters later.
 */
export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    return await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .take(100);
  },
});

/**
 * Paginated contacts voor de Contacts-page. usePaginatedQuery in React
 * doet de cursor-paging automatisch (load-more pattern). Pak 25 per page.
 */
export const listPaginated = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    return await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/**
 * Aantal contacts in een workspace — voor list-header counter.
 * Goedkoper dan list().length op grote datasets.
 */
export const count = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const rows = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    return rows.length;
  },
});

/**
 * Incoming leads voor het dashboard. Returnt contacts die werk vergen,
 * met source-attribution voor weergave per lead-card.
 *
 * v1-pattern: drie tabs (all / follow_up / new) — hier de raw data,
 * frontend doet de tab-filtering.
 *
 * Verrijking per lead:
 *  - latest leadAttribution row (source + meta_form_name)
 *  - laatst toegevoegde note (latestNote string)
 *  - opportunity stages (voor follow-up classificatie later)
 */
export const listIncomingLeads = query({
  args: {
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const limit = Math.min(args.limit ?? 50, 200);

    const rawContacts = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(limit * 2);  // overshoot zodat na filter nog ~limit overblijft

    // Filter: skip outside-area + soft-deleted contacts uit het dashboard
    const contacts = rawContacts
      .filter((c) => !c.outsideArea && c.deletedAt === undefined)
      .slice(0, limit);

    // Per contact: laad attribution + latest note in parallel
    const enriched = await Promise.all(
      contacts.map(async (c) => {
        const attribution = await ctx.db
          .query("leadAttribution")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .order("desc")
          .first();

        const latestNote = await ctx.db
          .query("notes")
          .withIndex("by_contact", (q) => q.eq("contactId", c._id))
          .order("desc")
          .first();

        return {
          ...c,
          leadSource: attribution?.source ?? null,
          metaFormId: attribution?.metaFormId ?? null,
          latestNote: latestNote?.body ?? null,
          leadCreatedAt: attribution?._creationTime ?? c._creationTime,
        };
      }),
    );

    return enriched;
  },
});

/**
 * Detail-view query — contact + laatste attribution + laatste raw Meta
 * lead + sample meta_lead_raw payload. Eén query i.p.v. vier voor lagere
 * dashboard-latency en simpeler React.
 */
export const getDetail = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const contact = await ctx.db.get(args.contactId);
    if (!contact) return null;

    // Membership-check
    const workspace = await ctx.db.get(contact.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) throw new Error("Not a member of this workspace");

    const attribution = await ctx.db
      .query("leadAttribution")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .first();

    // Bij Meta-source: pak de bijbehorende raw row voor field_data.
    let metaRaw: {
      fieldData: unknown;
      payload: unknown;
      adName?: string;
      adsetName?: string;
      campaignName?: string;
    } | null = null;
    if (attribution?.metaLeadgenId) {
      const raw = await ctx.db
        .query("metaLeadRaw")
        .withIndex("by_leadgenId", (q) =>
          q.eq("leadgenId", attribution.metaLeadgenId!),
        )
        .first();
      if (raw) {
        const payloadAny = raw.payload as Record<string, unknown> | null;
        metaRaw = {
          fieldData: raw.fieldData,
          payload: raw.payload,
          adName: typeof payloadAny?.ad_name === "string" ? payloadAny.ad_name : undefined,
          adsetName:
            typeof payloadAny?.adset_name === "string" ? payloadAny.adset_name : undefined,
          campaignName:
            typeof payloadAny?.campaign_name === "string"
              ? payloadAny.campaign_name
              : undefined,
        };
      }
    }

    return { contact, attribution, metaRaw };
  },
});

/**
 * Update contact-velden vanaf de detail-page edit-form. Alleen de velden
 * die meegegeven worden, worden gepatcht (undefined velden blijven).
 */
export const update = mutation({
  args: {
    contactId: v.id("contacts"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    position: v.optional(v.string()),
    street: v.optional(v.string()),
    houseNumber: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireMembershipForContact(ctx, args.contactId);

    const { contactId, ...rest } = args;
    // Normalisatie: trim + lowercase email, trim phone
    const patch: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      const trimmed = v.trim();
      patch[k] = trimmed.length === 0 ? undefined : trimmed;
    }
    if (typeof patch.email === "string") patch.email = patch.email.toLowerCase();

    await ctx.db.patch(contactId, patch);
  },
});

/**
 * Per-contact action mutations voor call-flow vanaf het dashboard.
 * Alle vier vereisen workspace-membership voor de contact's workspace.
 */
async function requireMembershipForContact(
  ctx: any,
  contactId: Id<"contacts">,
): Promise<{ contact: any; userId: Id<"users"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const contact = await ctx.db.get(contactId);
  if (!contact) throw new Error("Contact not found");

  const workspace = await ctx.db.get(contact.workspaceId);
  if (!workspace) throw new Error("Workspace not found");

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q: any) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();
  if (!membership) throw new Error("Not a member of this workspace");

  return { contact, userId };
}

/**
 * Markeer dat er gebeld is + uitkomst. Bumpt callCount, set lastCallAt,
 * set lastCallResult. Gebruikt door call-flow modal op /crm dashboard.
 */
export const recordCall = mutation({
  args: {
    contactId: v.id("contacts"),
    result: v.union(
      v.literal("answered"),
      v.literal("not_answered"),
      v.literal("invalid"),
    ),
  },
  handler: async (ctx, args) => {
    const { contact } = await requireMembershipForContact(ctx, args.contactId);
    await ctx.db.patch(args.contactId, {
      callCount: (contact.callCount ?? 0) + 1,
      lastCallAt: Date.now(),
      lastCallResult: args.result,
    });
  },
});

/**
 * Merge duplicate contact: reparent alle child-data (messages, notes,
 * leadAttribution, opportunities, metaLeadRaw) van loser naar winner,
 * vul lege velden op winner op met loser's data, dan soft-delete loser.
 *
 * Beide contacts moeten in dezelfde workspace zitten — anders cross-
 * tenant leak risk.
 */
export const mergeInto = mutation({
  args: {
    loserId: v.id("contacts"),
    winnerId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    if (args.loserId === args.winnerId) {
      throw new Error("Cannot merge contact into itself");
    }
    const loser = await ctx.db.get(args.loserId);
    const winner = await ctx.db.get(args.winnerId);
    if (!loser || !winner) throw new Error("Contact not found");
    if (loser.workspaceId !== winner.workspaceId) {
      throw new Error("Contacts not in same workspace");
    }
    await requireWorkspaceMembership(ctx, winner.workspaceId);

    // Tellers voor return
    const counts = {
      messages: 0,
      notes: 0,
      leadAttribution: 0,
      opportunities: 0,
      metaLeadRaw: 0,
    };

    // 1. Messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_contact_sent", (q) => q.eq("contactId", args.loserId))
      .collect();
    for (const m of messages) {
      await ctx.db.patch(m._id, { contactId: args.winnerId });
      counts.messages++;
    }

    // 2. Notes
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", args.loserId))
      .collect();
    for (const n of notes) {
      await ctx.db.patch(n._id, { contactId: args.winnerId });
      counts.notes++;
    }

    // 3. Lead attribution
    const attrs = await ctx.db
      .query("leadAttribution")
      .withIndex("by_contact", (q) => q.eq("contactId", args.loserId))
      .collect();
    for (const a of attrs) {
      await ctx.db.patch(a._id, { contactId: args.winnerId });
      counts.leadAttribution++;
    }

    // 4. Opportunities
    const opps = await ctx.db
      .query("opportunities")
      .withIndex("by_contact", (q) => q.eq("contactId", args.loserId))
      .collect();
    for (const o of opps) {
      await ctx.db.patch(o._id, { contactId: args.winnerId });
      counts.opportunities++;
    }

    // 5. metaLeadRaw (via filter want geen by_contact index)
    const raws = await ctx.db
      .query("metaLeadRaw")
      .filter((q) => q.eq(q.field("contactId"), args.loserId))
      .collect();
    for (const r of raws) {
      await ctx.db.patch(r._id, { contactId: args.winnerId });
      counts.metaLeadRaw++;
    }

    // 6. Vul lege velden op winner met loser's data (loser wint NIET
    // van winner — winner-bias)
    const fields: Array<keyof typeof loser> = [
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
      "messengerPsid",
      "messengerPageId",
      "externalId",
    ];
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      const wv = winner[f];
      const lv = loser[f];
      if ((wv === undefined || wv === null || wv === "") && lv) {
        patch[f] = lv;
      }
    }
    // Tags merge (union)
    const winnerTags = new Set(winner.tags ?? []);
    for (const t of loser.tags ?? []) winnerTags.add(t);
    if (winnerTags.size > (winner.tags?.length ?? 0)) {
      patch.tags = Array.from(winnerTags);
    }
    // Call-count som
    if ((loser.callCount ?? 0) > 0) {
      patch.callCount = (winner.callCount ?? 0) + (loser.callCount ?? 0);
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.winnerId, patch);
    }

    // 7. Soft-delete loser
    await ctx.db.patch(args.loserId, { deletedAt: Date.now() });

    return { winnerId: args.winnerId, loserId: args.loserId, counts };
  },
});

/**
 * Soft-delete: contact verbergen uit alle list-views maar bewaren in DB
 * voor audit (notes, messages, attribution blijven gekoppeld). Restore-
 * baar binnen UI-undo-window via restore() mutation.
 */
export const softDelete = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    await requireMembershipForContact(ctx, args.contactId);
    await ctx.db.patch(args.contactId, { deletedAt: Date.now() });
  },
});

/**
 * Restore: maakt soft-deleted contact weer zichtbaar. Voor undo-toast.
 */
export const restore = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    await requireMembershipForContact(ctx, args.contactId);
    await ctx.db.patch(args.contactId, { deletedAt: undefined });
  },
});

/**
 * Markeer een lead als "buiten werkgebied" (Limburg only voor Staycool).
 * Verbergt 'm uit het Nieuwe-leads dashboard zonder te deleten — blijft
 * vindbaar in Contacts voor audit.
 */
export const markOutsideArea = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    await requireMembershipForContact(ctx, args.contactId);
    await ctx.db.patch(args.contactId, { outsideArea: true });
  },
});

/**
 * Maak een nieuwe contact aan. Minimaal: workspace + 1 van
 * {firstName, lastName, email, phone}. Geen volledige dedup-check (komt
 * later in v2 wanneer Meta-leads + website-leads geïmporteerd worden).
 */
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    // Validatie: minstens 1 identifier veld
    const hasIdentifier = [
      args.firstName,
      args.lastName,
      args.email,
      args.phone,
    ].some((v) => typeof v === "string" && v.trim().length > 0);

    if (!hasIdentifier) {
      throw new Error(
        "Minstens één van firstName, lastName, email of phone is verplicht",
      );
    }

    const contactId = await ctx.db.insert("contacts", {
      workspaceId: args.workspaceId,
      firstName: args.firstName?.trim() || undefined,
      lastName: args.lastName?.trim() || undefined,
      email: args.email?.trim().toLowerCase() || undefined,
      phone: args.phone?.trim() || undefined,
      company: args.company?.trim() || undefined,
      city: args.city?.trim() || undefined,
      callCount: 0,
    });

    // Trigger workflow-engine voor contact_created. scheduler.runAfter(0)
    // = na deze mutation commit. Engine matched actieve workflows en
    // start executions parallel.
    await ctx.scheduler.runAfter(
      0,
      internal.workflowEngine.triggerContactCreated,
      { workspaceId: args.workspaceId, contactId },
    );

    return await ctx.db.get(contactId);
  },
});

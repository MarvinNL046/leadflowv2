import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { contactMatchesSearch, normalizeForSearch } from "./contactSearch";
import { normalizeEmail, normalizePhone } from "./lib/phone";

/**
 * Dataqueries voor de leads-MCP-connector (convex/mcpLeadflow.ts).
 *
 * Zelfde filosofie als de WhatsApp-MCP: een AI-assistent (Claude,
 * ChatGPT) kan de CRM-leads MEELEZEN en — via aparte, bewust zwaardere
 * tools in mcpLeadflow.ts — een concept-taak voor kantoor aanmaken of een
 * afspraakmail naar de lead sturen. Alle leesqueries zijn begrensd
 * (take), nooit een onbegrensde collect over de contactentabel.
 */

const SCAN_CAP = 500;

/** Vind een contact op e-mail, telefoonnummer of (deel van de) naam. */
export async function resolveContactByRef(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
  ref: string,
): Promise<Doc<"contacts">[]> {
  const term = ref.trim();
  if (term.length < 2) return [];

  const email = normalizeEmail(term);
  if (email && term.includes("@")) {
    const viaEmail = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_email", (q) =>
        q.eq("workspaceId", workspaceId).eq("email", email),
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .take(3);
    if (viaEmail.length > 0) return viaEmail;
  }
  if (/^[\d\s+()-]{8,}$/.test(term)) {
    const phone = normalizePhone(term);
    if (phone) {
      const viaPhone = await ctx.db
        .query("contacts")
        .withIndex("by_workspace_phone", (q) =>
          q.eq("workspaceId", workspaceId).eq("phone", phone),
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(3);
      if (viaPhone.length > 0) return viaPhone;
    }
  }
  // Naam/vrije tekst: begrensde scan over de nieuwste contacten met de
  // bestaande substring-matcher (accent-/notatie-tolerant).
  const recent = await ctx.db
    .query("contacts")
    .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .take(SCAN_CAP);
  const genormaliseerd = normalizeForSearch(term);
  return recent
    .filter((c) => !c.deletedAt && contactMatchesSearch(c, genormaliseerd))
    .slice(0, 5);
}

async function leadSamenvatting(
  ctx: Pick<QueryCtx, "db">,
  contact: Doc<"contacts">,
) {
  const attribution = await ctx.db
    .query("leadAttribution")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .order("desc")
    .first();
  const opportunity = await ctx.db
    .query("opportunities")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .order("desc")
    .first();
  let stage: string | null = null;
  if (opportunity) {
    const stageDoc = await ctx.db.get(opportunity.stageId);
    stage = stageDoc?.name ?? null;
  }
  return {
    id: contact._id,
    naam: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "(geen naam)",
    email: contact.email ?? null,
    telefoon: contact.phone ?? null,
    plaats: contact.city ?? null,
    bron: attribution?.source ?? null,
    fase: stage,
    aangemaakt: contact._creationTime,
  };
}

/** Nieuwste leads met bron en pipeline-fase. */
export const recenteLeads = internalQuery({
  args: { workspaceId: v.id("workspaces"), limit: v.number() },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit, 1), 25);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(limit * 2);
    const uit = [];
    for (const c of contacts) {
      if (c.deletedAt) continue;
      uit.push(await leadSamenvatting(ctx, c));
      if (uit.length >= limit) break;
    }
    return uit;
  },
});

/** Vrij zoeken op naam/e-mail/telefoon/plaats (begrensd). */
export const zoekLeads = internalQuery({
  args: { workspaceId: v.id("workspaces"), tekst: v.string() },
  handler: async (ctx, args) => {
    const treffers = await resolveContactByRef(
      ctx,
      args.workspaceId,
      args.tekst,
    );
    return await Promise.all(treffers.map((c) => leadSamenvatting(ctx, c)));
  },
});

/** Volledig lead-dossier: gegevens, tijdlijn (berichten), open taken. */
export const leadDetail = internalQuery({
  args: { workspaceId: v.id("workspaces"), ref: v.string() },
  handler: async (ctx, args) => {
    const treffers = await resolveContactByRef(ctx, args.workspaceId, args.ref);
    if (treffers.length === 0) return null;
    if (treffers.length > 1) {
      return {
        meerdere: await Promise.all(
          treffers.map((c) => leadSamenvatting(ctx, c)),
        ),
      };
    }
    const contact = treffers[0];
    const kern = await leadSamenvatting(ctx, contact);
    const berichten = await ctx.db
      .query("messages")
      .withIndex("by_contact_sent", (q) => q.eq("contactId", contact._id))
      .order("desc")
      .take(15);
    const taken = await ctx.db
      .query("tasks")
      .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
      .collect();
    return {
      lead: {
        ...kern,
        adres: [contact.street, contact.houseNumber, contact.postalCode, contact.city]
          .filter(Boolean)
          .join(" ") || null,
        belpogingen: contact.callCount,
      },
      berichten: berichten.reverse().map((m) => ({
        op: m.sentAt ?? m._creationTime,
        kanaal: m.channel,
        richting: m.direction,
        onderwerp: m.subject ?? null,
        tekst: m.body.slice(0, 400),
        status: m.status,
      })),
      openTaken: taken
        .filter((t) => t.status === "open")
        .map((t) => ({ titel: t.title, omschrijving: t.description ?? null, deadline: t.dueDate ?? null })),
    };
  },
});

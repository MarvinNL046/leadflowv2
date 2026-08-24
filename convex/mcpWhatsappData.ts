import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * Dataqueries voor de WhatsApp-MCP-connector (convex/mcpWhatsapp.ts).
 *
 * Read-only, en dat is een ontwerpkeuze: de connector laat een AI-assistent
 * (Claude, ChatGPT) meelezen met de WhatsApp-gesprekken van het zakelijke
 * nummer — versturen kan er bewust NIET mee. Een assistent die namens het
 * bedrijf appt is een andere, veel zwaardere beslissing dan meelezen.
 *
 * De berichten staan er al: de voidfix-webhook (convex/http.ts) slaat inbound
 * én outbound WhatsApp op in `messages`. Dit bestand maakt ze alleen
 * doorzoekbaar. Alle scans zijn begrensd (take) — de bekende leeslimiet.
 */

const SCAN_CAP = 1000;

/** Alleen cijfers, NL-nationaal → internationaal (zelfde idee als wa.me). */
function normalizeerTelefoon(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `31${digits.slice(1)}`;
  return digits;
}

function tijdstip(m: { sentAt?: number; _creationTime: number }): number {
  return m.sentAt ?? m._creationTime;
}

async function contactNaam(
  ctx: { db: { get: (id: any) => Promise<any> } },
  contactId: unknown,
): Promise<string | null> {
  if (!contactId) return null;
  const contact = await ctx.db.get(contactId);
  if (!contact) return null;
  const naam = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return naam || null;
}

/**
 * Recente WhatsApp-gesprekken: nieuwste berichten gegroepeerd per
 * telefoonnummer, met contactnaam waar die bekend is.
 */
export const recenteGesprekken = internalQuery({
  args: { workspaceId: v.id("workspaces"), limit: v.number() },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit, 1), 50);
    const berichten = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("channel", "whatsapp"),
      )
      .order("desc")
      .take(SCAN_CAP);

    const perNummer = new Map<
      string,
      { laatste: (typeof berichten)[number]; aantal: number }
    >();
    for (const bericht of berichten) {
      const nummer = normalizeerTelefoon(
        bericht.direction === "inbound"
          ? (bericht.from ?? bericht.to)
          : bericht.to,
      );
      if (!nummer) continue;
      const bestaand = perNummer.get(nummer);
      if (bestaand === undefined) {
        perNummer.set(nummer, { laatste: bericht, aantal: 1 });
      } else {
        bestaand.aantal += 1;
        if (tijdstip(bericht) > tijdstip(bestaand.laatste)) {
          bestaand.laatste = bericht;
        }
      }
    }

    const uit = [];
    for (const [nummer, groep] of perNummer) {
      if (uit.length >= limit) break;
      uit.push({
        telefoon: nummer,
        naam: await contactNaam(ctx, groep.laatste.contactId),
        laatsteBerichtOp: tijdstip(groep.laatste),
        laatsteRichting: groep.laatste.direction,
        laatsteTekst: groep.laatste.body.slice(0, 200),
        aantalBerichtenRecent: groep.aantal,
      });
    }
    // Map behoudt invoegvolgorde = aflopend op tijd (bron was al desc).
    return { gesprekken: uit, bekekenBerichten: berichten.length };
  },
});

/** Volledig gesprek met één nummer, oudste eerst. */
export const gesprek = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    telefoon: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit, 1), 200);
    const doel = normalizeerTelefoon(args.telefoon);
    if (doel.length < 8) {
      return { berichten: [], naam: null, opmerking: "Telefoonnummer te kort." };
    }
    const alle = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("channel", "whatsapp"),
      )
      .order("desc")
      .take(SCAN_CAP);
    const match = alle.filter((m) => {
      const nummers = [m.to, m.from ?? ""].map(normalizeerTelefoon);
      return nummers.includes(doel);
    });
    const selectie = match.slice(0, limit).reverse();
    return {
      naam:
        selectie.length > 0
          ? await contactNaam(ctx, selectie[selectie.length - 1].contactId)
          : null,
      berichten: selectie.map((m) => ({
        op: tijdstip(m),
        richting: m.direction,
        tekst: m.body,
        status: m.status,
        media: m.mediaUrl !== undefined ? (m.mediaType ?? "media") : undefined,
      })),
      opmerking:
        match.length > limit
          ? `Alleen de ${limit} nieuwste berichten getoond (${match.length} gevonden in de laatste ${SCAN_CAP}).`
          : undefined,
    };
  },
});

/** Vrij zoeken in de berichtteksten (begrensd tot de recente berichten). */
export const zoeken = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    tekst: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit, 1), 50);
    const term = args.tekst.trim().toLowerCase();
    if (term.length < 2) return { treffers: [], opmerking: "Zoekterm te kort." };
    const alle = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("channel", "whatsapp"),
      )
      .order("desc")
      .take(SCAN_CAP);
    const treffers = [];
    for (const m of alle) {
      if (!m.body.toLowerCase().includes(term)) continue;
      treffers.push({
        op: tijdstip(m),
        richting: m.direction,
        telefoon: normalizeerTelefoon(
          m.direction === "inbound" ? (m.from ?? m.to) : m.to,
        ),
        naam: await contactNaam(ctx, m.contactId),
        tekst: m.body.slice(0, 300),
      });
      if (treffers.length >= limit) break;
    }
    return {
      treffers,
      opmerking: `Gezocht in de ${alle.length} nieuwste WhatsApp-berichten.`,
    };
  },
});

import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function requireWorkspace(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();
  if (!membership) throw new Error("Not a member of this workspace");
}

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    const rows = await ctx.db
      .query("emailBacklog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    type: v.optional(v.string()),
    timing: v.optional(v.string()),
    category: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    const existing = await ctx.db
      .query("emailBacklog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const maxOrder = existing.reduce(
      (max, r) => (r.sortOrder > max ? r.sortOrder : max),
      0,
    );
    return await ctx.db.insert("emailBacklog", {
      workspaceId: args.workspaceId,
      title: args.title,
      type: args.type,
      timing: args.timing,
      category: args.category,
      pageUrl: args.pageUrl,
      status: "open",
      sortOrder: maxOrder + 1,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("emailBacklog"),
    title: v.optional(v.string()),
    type: v.optional(v.string()),
    timing: v.optional(v.string()),
    category: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Item not found");
    await requireWorkspace(ctx, row.workspaceId);
    const patch: Record<string, string | undefined> = {};
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.type !== undefined) patch.type = fields.type;
    if (fields.timing !== undefined) patch.timing = fields.timing;
    if (fields.category !== undefined) patch.category = fields.category;
    if (fields.pageUrl !== undefined) patch.pageUrl = fields.pageUrl;
    await ctx.db.patch(id, patch);
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("emailBacklog"),
    status: v.union(v.literal("open"), v.literal("sent")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Item not found");
    await requireWorkspace(ctx, row.workspaceId);
    await ctx.db.patch(args.id, {
      status: args.status,
      sentAt: args.status === "sent" ? Date.now() : undefined,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("emailBacklog") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Item not found");
    await requireWorkspace(ctx, row.workspaceId);
    await ctx.db.delete(args.id);
  },
});

const DEFAULT_TOPICS: Array<{
  title: string;
  type: string;
  timing: string;
  category: string;
}> = [
  // Quick-wins
  {
    title: "DIY airco bijvullen kost je €1500 boete",
    type: "Educational/warning",
    timing: "Anytime — sterke hook",
    category: "Quick-wins",
  },
  {
    title:
      "Vergunning airco-buitenunit in Maastricht — niet wat je denkt",
    type: "Educational/regional",
    timing: "Lente, voor installatie-piek",
    category: "Quick-wins",
  },
  {
    title: "Bbl 4.107 — airco niet luider dan 40 dB",
    type: "Wetgeving",
    timing: "Anytime",
    category: "Quick-wins",
  },
  {
    title: "Wat airco bijvullen echt kost — eerlijk overzicht 2026",
    type: "Educational/transparant",
    timing: "Voor zomer (mei-juni)",
    category: "Quick-wins",
  },
  {
    title: "Wanneer airco-onderhoud zin heeft (en wanneer niet)",
    type: "Educational/contrarian",
    timing: "Pre-summer of pre-winter",
    category: "Quick-wins",
  },
  {
    title: "Airco vs warmtepomp — wat is het verschil",
    type: "Educational",
    timing: "Najaar",
    category: "Quick-wins",
  },
  {
    title: "Hoe lang gaat een airco mee",
    type: "Educational/lifecycle",
    timing: "Anytime",
    category: "Quick-wins",
  },
  {
    title: "F-gas en STEK uitgelegd — waarom badges niet genoeg zeggen",
    type: "Trust-signal",
    timing: "Anytime",
    category: "Quick-wins",
  },
  // Subsidie
  {
    title: "ISDE 2026 — wat verandert er en hoe vraag je het aan",
    type: "Subsidie-alert",
    timing: "Bij ISDE-update",
    category: "Subsidie",
  },
  {
    title: "Warmtepomp + airco subsidie 2026 — €2000-4000 mogelijk",
    type: "Subsidie-alert",
    timing: "Pre-Q4",
    category: "Subsidie",
  },
  {
    title: "Airco financiering — lease vs in termijnen",
    type: "Commerce-bridge",
    timing: "Anytime",
    category: "Subsidie",
  },
  {
    title: "BTW airco aftrekbaar voor zakelijke gebruikers",
    type: "Zakelijk segment",
    timing: "Voor jaareinde",
    category: "Subsidie",
  },
  {
    title: "Subsidie aanvragen stap-voor-stap",
    type: "How-to",
    timing: "Q1 of Q3",
    category: "Subsidie",
  },
  // Residentieel
  {
    title: "Welke airco past bij jouw woning",
    type: "Advies-quiz",
    timing: "Voorjaar",
    category: "Residentieel",
  },
  {
    title: "Slaapkamer-airco zonder slang — wat werkt",
    type: "Niche-product",
    timing: "Mei-juni",
    category: "Residentieel",
  },
  {
    title: "Zolder-airco — andere eisen dan beneden",
    type: "Specifiek",
    timing: "Voorjaar",
    category: "Residentieel",
  },
  {
    title: "Stille airco voor de woonkamer",
    type: "Niche/comfort",
    timing: "Mei",
    category: "Residentieel",
  },
  // Seizoens
  {
    title: "Eerste warme dag — checks die je nu zelf doet",
    type: "Seasonal",
    timing: "Eerste 25°C-dag (mei)",
    category: "Seizoens",
  },
  {
    title: "Voor de winter — airco-modus + onderhoudscheck",
    type: "Seasonal",
    timing: "Eerste vorst (okt/nov)",
    category: "Seizoens",
  },
  {
    title: "Hittegolf en je airco — wat als hij ineens stopt",
    type: "Reactief/urgent",
    timing: "Tijdens hittegolf",
    category: "Seizoens",
  },
  {
    title: "Voorjaarsschoonmaak — airco-filter is 30 sec werk",
    type: "Seasonal",
    timing: "Begin april",
    category: "Seizoens",
  },
  // Klant-stories
  {
    title: "Vorige week in Maastricht: filter i.p.v. kapotte airco",
    type: "Story/learning",
    timing: "Anytime",
    category: "Klant-stories",
  },
  {
    title: "Dennis Linssen — een jaar later lekkage, kosteloos opgelost",
    type: "Trust-story",
    timing: "Q4",
    category: "Klant-stories",
  },
  {
    title: "De €800 Marktplaats-airco die niet kon werken",
    type: "Cautionary tale",
    timing: "Anytime",
    category: "Klant-stories",
  },
  {
    title: "Multi-split van 3 dagen in 1 dag — hoe en waarom",
    type: "Behind-the-scenes",
    timing: "Anytime",
    category: "Klant-stories",
  },
  // B2B
  {
    title: "Airco voor je kantoor — wat overheidsregels zeggen",
    type: "B2B regulation",
    timing: "Zakelijk",
    category: "B2B",
  },
  {
    title: "Onderhoudscontract zakelijk — vaste prijs, geen verrassingen",
    type: "B2B retentie",
    timing: "Zakelijk",
    category: "B2B",
  },
  {
    title: "Airco leasen of kopen — ROI-rekensom",
    type: "B2B finance",
    timing: "Zakelijk",
    category: "B2B",
  },
  // Re-engagement
  {
    title: "Hé, even checken — nog steeds de juiste persoon?",
    type: "Re-engagement",
    timing: "Na 6 mnd geen open",
    category: "Re-engagement",
  },
  {
    title: "Even opruimen — krijg je nog onze mails?",
    type: "Cleanup-trigger",
    timing: "Na 12 mnd geen open",
    category: "Re-engagement",
  },
  {
    title:
      "We hebben dit jaar X mensen geholpen — vorig jaar bij jou stuk gegaan?",
    type: "Survey/intent",
    timing: "Eind jaar",
    category: "Re-engagement",
  },
];

export const seedDefaults = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    // Idempotent: if any row already exists for this workspace, skip
    const existing = await ctx.db
      .query("emailBacklog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    if (existing) return { seeded: 0 };

    for (let i = 0; i < DEFAULT_TOPICS.length; i++) {
      const topic = DEFAULT_TOPICS[i];
      await ctx.db.insert("emailBacklog", {
        workspaceId: args.workspaceId,
        title: topic.title,
        type: topic.type,
        timing: topic.timing,
        category: topic.category,
        status: "open",
        sortOrder: i + 1,
      });
    }
    return { seeded: DEFAULT_TOPICS.length };
  },
});

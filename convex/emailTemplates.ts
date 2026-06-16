import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { renderBlocksToHtml } from "./emailBlocks";

async function requireWorkspaceMembership(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<void> {
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

/**
 * Alle email-templates voor een workspace, gesorteerd op naam.
 * Voor de templates-beheer-UI in /crm/settings/templates.
 */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const rows = await ctx.db
      .query("emailTemplates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Eén template op naam (case-insensitive). Voor de Bel Nu-modal die
 * vooraf-ingevulde body wil tonen op basis van de v1-template-namen
 * ("Buiten Werkgebied", "Niet Bereikt", "Afscheidsmail (Deal Verloren)").
 */
export const getByName = query({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const rows = await ctx.db
      .query("emailTemplates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const lower = args.name.toLowerCase();
    return rows.find((r) => r.name.toLowerCase() === lower) ?? null;
  },
});

/** Maak een nieuw (gebruikers-)template aan. */
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    bodyBlocks: v.optional(v.array(v.any())),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    if (!args.name.trim()) throw new Error("Naam mag niet leeg zijn");
    if (!args.subject.trim()) throw new Error("Onderwerp mag niet leeg zijn");
    if (!args.body.trim()) throw new Error("Body mag niet leeg zijn");
    return await ctx.db.insert("emailTemplates", {
      workspaceId: args.workspaceId,
      name: args.name.trim(),
      subject: args.subject.trim(),
      body: args.body,
      bodyBlocks: args.bodyBlocks,
      description: args.description,
      isSystem: false,
    });
  },
});

/** Update naam, onderwerp, body en/of omschrijving van een template. */
export const update = mutation({
  args: {
    templateId: v.id("emailTemplates"),
    name: v.optional(v.string()),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    bodyBlocks: v.optional(v.array(v.any())),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl) throw new Error("Template niet gevonden");
    await requireWorkspaceMembership(ctx, tpl.workspaceId);

    const patch: Partial<{
      name: string;
      subject: string;
      body: string;
      bodyBlocks: unknown[];
      description: string;
    }> = {};

    if (args.name !== undefined) {
      if (!args.name.trim()) throw new Error("Naam mag niet leeg zijn");
      patch.name = args.name.trim();
    }
    if (args.subject !== undefined) {
      if (!args.subject.trim()) throw new Error("Onderwerp mag niet leeg zijn");
      patch.subject = args.subject.trim();
    }
    if (args.body !== undefined) {
      if (!args.body.trim()) throw new Error("Body mag niet leeg zijn");
      patch.body = args.body;
    }
    if (args.bodyBlocks !== undefined) {
      patch.bodyBlocks = args.bodyBlocks;
    }
    if (args.description !== undefined) {
      patch.description = args.description;
    }

    await ctx.db.patch(args.templateId, patch);
    return null;
  },
});

/** Voeg 5 kant-en-klare StayCool-voorbeeldtemplates toe (idempotent per naam). */
export const seedExampleTemplates = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const existing = await ctx.db
      .query("emailTemplates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const existingNames = new Set(existing.map((r) => r.name));

    const t1Blocks = [
      { id: "t1-1", type: "heading", props: { text: "Voor de eerste hittegolf, niet erna", align: "left" } },
      { id: "t1-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "t1-3", type: "text", props: { content: "De zomer komt eraan. Dat is precies het moment waarop een airco het laat afweten — meestal op de warmste dag, als half Limburg tegelijk belt.", align: "left" } },
      { id: "t1-4", type: "text", props: { content: "Een onderhoudsbeurt voorkomt dat. We reinigen de filters, checken de druk en sporen een beginnende lekkage op vóór die een probleem wordt. Vanaf €99 all-in incl. BTW. Een nieuwe compressor kost een veelvoud daarvan.", align: "left" } },
      { id: "t1-5", type: "text", props: { content: "In negen van de tien gevallen is het zo gepiept. Even inplannen nu het nog rustig is, scheelt je straks een hete week zonder koeling.", align: "left" } },
      { id: "t1-6", type: "button", props: { text: "Plan je onderhoudsbeurt", url: "https://staycoolairco.nl/airco-service", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "t1-7", type: "text", props: { content: "Liever appen? Stuur gewoon een berichtje naar 06 36481054.", align: "left" } },
      { id: "t1-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ];

    const t2Blocks = [
      { id: "t2-1", type: "heading", props: { text: "Airco bijvullen is geen klusje voor de zaterdag", align: "left" } },
      { id: "t2-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "t2-3", type: "text", props: { content: "Een airco die minder koelt \"moet bijgevuld worden\", denken veel mensen. Soms klopt dat. Maar het zelf doen mag niet, en dat heeft een reden.", align: "left" } },
      { id: "t2-4", type: "text", props: { content: "Het koudemiddel in je airco is een F-gas. Daar mag alleen iemand met een F-gassen-certificaat aankomen. Doe je het zelf, dan riskeer je een boete en vervalt je garantie. En negen van de tien keer is \"bijvullen\" niet eens het probleem — een airco die goed is geïnstalleerd verliest namelijk geen koudemiddel.", align: "left" } },
      { id: "t2-5", type: "text", props: { content: "Koelt 'ie minder? Dan is er meestal iets anders aan de hand: een vervuilde filter, of een kleine lekkage die gemaakt moet worden. Dat sporen we op tijdens een onderhoudsbeurt, vanaf €99 all-in.", align: "left" } },
      { id: "t2-6", type: "button", props: { text: "Lees wat bijvullen écht kost", url: "https://staycoolairco.nl/airco-vullen-kosten", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "t2-7", type: "text", props: { content: "Twijfel je? Bel of app ons gewoon even: 06 36481054.", align: "left" } },
      { id: "t2-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ];

    const t3Blocks = [
      { id: "t3-1", type: "heading", props: { text: "Een jaar verder — tijd voor een check", align: "left" } },
      { id: "t3-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "t3-3", type: "text", props: { content: "Je airco draait inmiddels een tijdje. Goed moment voor een onderhoudsbeurt.", align: "left" } },
      { id: "t3-4", type: "text", props: { content: "Niet omdat het moet van ons, maar omdat een schone filter en een drukcheck het verschil maken tussen een airco die jaren meegaat en eentje die na vijf jaar hapert. We reinigen, controleren de druk en kijken of er ergens koudemiddel ontsnapt.", align: "left" } },
      { id: "t3-5", type: "text", props: { content: "Vanaf €99 all-in incl. BTW, en meestal in een uurtje klaar. Je merkt het ook: schone filters koelen beter en verbruiken minder stroom.", align: "left" } },
      { id: "t3-6", type: "button", props: { text: "Plan je onderhoud", url: "https://staycoolairco.nl/airco-service", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "t3-7", type: "text", props: { content: "We plannen het op een moment dat jou uitkomt. Een appje naar 06 36481054 kan ook.", align: "left" } },
      { id: "t3-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ];

    const t4Blocks = [
      { id: "t4-1", type: "heading", props: { text: "Een garantie die we ook echt waarmaken", align: "left" } },
      { id: "t4-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "t4-3", type: "text", props: { content: "Een eerlijk verhaal. Een klant liet bijna een jaar na plaatsing een kleine lekkage zien — een slang aan de buitenunit was gescheurd. We kwamen langs en hebben het kosteloos opgelost.", align: "left" } },
      { id: "t4-4", type: "text", props: { content: "Daar hebben we die installatiegarantie ook voor. Niet als marketingclaim, maar omdat we er moeten zijn als er ondanks alle zorg toch iets gebeurt. Het verschil met een installateur die na betaling onbereikbaar is, zit hem juist in dat moment.", align: "left" } },
      { id: "t4-5", type: "text", props: { content: "We zijn begonnen in 2021 en staan op 4,9 sterren uit 231 reviews. Danny en de monteurs leveren het werk netjes op. Maar de echte test is wat er gebeurt als er een jaar later iets niet klopt.", align: "left" } },
      { id: "t4-6", type: "text", props: { content: "Vragen over je eigen airco? Bel of app gerust: 06 36481054.", align: "left" } },
      { id: "t4-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ];

    const t5Blocks = [
      { id: "t5-1", type: "heading", props: { text: "Even opruimen — sta je hier nog goed?", align: "left" } },
      { id: "t5-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "t5-3", type: "text", props: { content: "We sturen niet vaak een mail, en als we het doen willen we dat het nuttig is. Daarom even een korte check: wil je onze tips over airco en onderhoud nog ontvangen?", align: "left" } },
      { id: "t5-4", type: "text", props: { content: "Wil je dat, dan hoef je niets te doen — je blijft gewoon op de lijst. Liever niet meer? Onderaan deze mail staat een afmeldlink. Eén klik en je bent eraf. Geen harde gevoelens.", align: "left" } },
      { id: "t5-5", type: "text", props: { content: "En mocht je toevallig met een airco-vraag zitten — of die nu bij ons of ergens anders is geplaatst — bel of app gerust. We denken graag mee: 06 36481054.", align: "left" } },
      { id: "t5-6", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ];

    const templates = [
      {
        name: "Zomer-check (onderhoud vóór de zomer)",
        subject: "Je airco klaar voor de zomer?",
        description: "Seizoensmail — onderhoud inplannen vóór de eerste hittegolf.",
        bodyBlocks: t1Blocks,
        body: renderBlocksToHtml(t1Blocks as Parameters<typeof renderBlocksToHtml>[0]),
      },
      {
        name: "Zelf bijvullen? Liever niet (F-gas)",
        subject: "Je airco zelf bijvullen? Liever niet",
        description: "Educatief/eerlijk — waarom je airco bijvullen geen doe-het-zelf-klus is.",
        bodyBlocks: t2Blocks,
        body: renderBlocksToHtml(t2Blocks as Parameters<typeof renderBlocksToHtml>[0]),
      },
      {
        name: "Onderhoudsherinnering (jaarlijkse check)",
        subject: "Tijd voor de jaarlijkse airco-check",
        description: "Retentie — onderhoud ~12 maanden na installatie.",
        bodyBlocks: t3Blocks,
        body: renderBlocksToHtml(t3Blocks as Parameters<typeof renderBlocksToHtml>[0]),
      },
      {
        name: "Garantie & nazorg (vertrouwen)",
        subject: "Wat als er een jaar later iets lekt?",
        description: "Vertrouwen — nazorg/garantie-verhaal, geschikt voor klanten en koude leads.",
        bodyBlocks: t4Blocks,
        body: renderBlocksToHtml(t4Blocks as Parameters<typeof renderBlocksToHtml>[0]),
      },
      {
        name: "Opschonen / re-engagement",
        subject: "Krijg je onze mails nog graag?",
        description: "Re-engagement/cleanup voor koud segment — afmelden mag, geen harde CTA.",
        bodyBlocks: t5Blocks,
        body: renderBlocksToHtml(t5Blocks as Parameters<typeof renderBlocksToHtml>[0]),
      },
    ];

    let seeded = 0;
    for (const tpl of templates) {
      if (!existingNames.has(tpl.name)) {
        await ctx.db.insert("emailTemplates", {
          workspaceId: args.workspaceId,
          name: tpl.name,
          subject: tpl.subject,
          body: tpl.body,
          bodyBlocks: tpl.bodyBlocks,
          description: tpl.description,
          isSystem: false,
        });
        seeded++;
      }
    }

    return { seeded };
  },
});

/** Verwijder een template (alleen workspace-leden). */
export const remove = mutation({
  args: {
    templateId: v.id("emailTemplates"),
  },
  handler: async (ctx, args) => {
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl) throw new Error("Template niet gevonden");
    await requireWorkspaceMembership(ctx, tpl.workspaceId);
    await ctx.db.delete(args.templateId);
    return null;
  },
});

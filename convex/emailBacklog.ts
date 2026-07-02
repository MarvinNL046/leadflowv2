import { v } from "convex/values";
import { getUserId } from "./lib/identity";
import { query, mutation, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function requireWorkspace(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const userId = await getUserId(ctx);
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

// ─── 31 concept-mails baked on top of DEFAULT_TOPICS ───────────────────────
// n is 1-indexed and corresponds to DEFAULT_TOPICS[n-1].title
const DRAFTS: Array<{
  n: number;
  subject: string;
  bodyBlocks: Array<Record<string, unknown>>;
}> = [
  {
    n: 1,
    subject: "DIY airco bijvullen kost €1.500 boete",
    bodyBlocks: [
      { id: "n1-1", type: "heading", props: { text: "Zelf bijvullen mag niet. En de controleurs weten dat ook.", align: "left" } },
      { id: "n1-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n1-3", type: "text", props: { content: "Op YouTube staan handleidingen voor het bijvullen van airco's. Sommige hebben honderdduizenden views. Ze zijn ook allemaal illegaal als je ze in Nederland uitvoert zonder F-gassen-certificaat.", align: "left" } },
      { id: "n1-4", type: "text", props: { content: "EU-verordening 517/2014 is helder: koelmiddelen zoals R410A en R32 mogen alleen door gecertificeerde technici worden behandeld. De boete bij overtreding loopt op tot €1.500 per geval. En je fabrieksgarantie — die van 5 of 7 jaar — vervalt per direct.", align: "left" } },
      { id: "n1-5", type: "text", props: { content: "Een unit die koudemiddel verliest heeft vrijwel altijd een lekkage. Bijvullen zonder lek zoeken is hetzelfde als water bijgieten in een emmer met een gat erin. Na één zomer heb je hetzelfde probleem, maar dan zonder garantie.", align: "left" } },
      { id: "n1-6", type: "text", props: { content: "Wij zoeken de lekkage op, lassen dicht, vullen bij en documenteren het koudemiddel correct. Een storingsbezoek begint bij €89 voorrijden. Dat is aanzienlijk minder dan €1.500 boete plus een nieuwe unit.", align: "left" } },
      { id: "n1-7", type: "button", props: { text: "Lees alles over airco bijvullen", url: "https://staycoolairco.nl/kennisbank/airco-bijvullen-zelf-doen", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n1-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 2,
    subject: "Vergunning airco Maastricht: het echte verhaal",
    bodyBlocks: [
      { id: "n2-1", type: "heading", props: { text: "In negen van de tien gevallen is geen vergunning nodig", align: "left" } },
      { id: "n2-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n2-3", type: "text", props: { content: "We horen het vaak: mensen die een airco willen maar denken dat ze eerst een vergunning moeten aanvragen. In de meeste gevallen is dat niet zo.", align: "left" } },
      { id: "n2-4", type: "text", props: { content: "Een airco-buitenunit valt onder vergunningsvrij bouwen zolang hij aan de achterkant of zijkant van het pand staat en niet boven het dak uitkomt. Dat geldt voor het overgrote deel van de woningen in Limburg.", align: "left" } },
      { id: "n2-5", type: "text", props: { content: "Één uitzondering: beschermd stads- of dorpsgezicht. In Maastricht geldt dat voor de binnenstad en een paar aangrenzende wijken. Daar gelden extra regels voor de zichtbaarheid van de unit. We controleren dit altijd voor we plannen.", align: "left" } },
      { id: "n2-6", type: "text", props: { content: "Twijfel je of jouw adres onder een beschermd gezicht valt? Stuur ons het adres via WhatsApp 06 36481054, dan kijken we het gewoon even na.", align: "left" } },
      { id: "n2-7", type: "button", props: { text: "Airco plaatsen in Limburg", url: "https://staycoolairco.nl/airco-plaatsen-limburg", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n2-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 3,
    subject: "Airco te luid op de erfgrens? De wet zegt 40 dB",
    bodyBlocks: [
      { id: "n3-1", type: "heading", props: { text: "Bbl 4.107 bepaalt wat je buurman nog mag horen", align: "left" } },
      { id: "n3-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n3-3", type: "text", props: { content: "Artikel 4.107 van het Besluit bouwwerken leefomgeving legt een geluidsnorm vast: een airco-buitenunit mag op de erfgrens niet luider zijn dan 40 dB(A) 's nachts en 45 dB(A) overdag. Dat zijn geen adviezen. Dat zijn wettelijke grenzen.", align: "left" } },
      { id: "n3-4", type: "text", props: { content: "De moderne units die wij plaatsen zitten op een paar meter afstand al ruim onder die norm. Bij de opname kijken we altijd naar de positie van de unit ten opzichte van de erfgrens.", align: "left" } },
      { id: "n3-5", type: "text", props: { content: "Problemen ontstaan bij goedkope units zonder geluidsisolatie, of bij plaatsing in een uitsparing in de muur waar het geluid terugkaatst richting buren. We letten bij de opname altijd op de positie van de unit ten opzichte van de erfgrens.", align: "left" } },
      { id: "n3-6", type: "text", props: { content: "Heb je een buurman die klaagt over geluid van een bestaande unit? Bel ons gewoon even — we kunnen meten en adviseren. App ons via WhatsApp 06 36481054.", align: "left" } },
      { id: "n3-7", type: "button", props: { text: "Airco plaatsen in Limburg", url: "https://staycoolairco.nl/airco-plaatsen-limburg", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n3-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 4,
    subject: "Wat airco bijvullen echt kost in 2026",
    bodyBlocks: [
      { id: "n4-1", type: "heading", props: { text: "Geen mysterieus 'op aanvraag' — hier zijn de echte bedragen", align: "left" } },
      { id: "n4-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n4-3", type: "text", props: { content: "Airco bijvullen begint bij €89 voor het storingsbezoek. Dat is het voorrijden — bij reparatie wordt dat verrekend in de totaalprijs.", align: "left" } },
      { id: "n4-4", type: "text", props: { content: "Daarna hangt de prijs af van hoeveel koudemiddel ontbreekt en of er een lekkage is die eerst gedicht moet worden. Een unit bijvullen zonder lek zoeken is weggegooid geld — binnen een seizoen ben je weer terug bij af.", align: "left" } },
      { id: "n4-5", type: "text", props: { content: "In de praktijk: een kleine lekkage opsporen, dichten en bijvullen kost tussen €150 en €350 all-in incl. BTW. Grote lekken — bij een gescheurde leiding of een defecte compressor — lopen soms op tot €500 of meer. Dan is vervanging van de unit soms slimmer. Dat vertellen we je dan gewoon.", align: "left" } },
      { id: "n4-6", type: "text", props: { content: "We geven bij elk storingsbezoek een diagnose voordat we iets uitvoeren. Geen verrassingen achteraf.", align: "left" } },
      { id: "n4-7", type: "button", props: { text: "Kosten airco bijvullen — volledig overzicht", url: "https://staycoolairco.nl/airco-vullen-kosten", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n4-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 5,
    subject: "Airco-onderhoud: wanneer wel, wanneer niet",
    bodyBlocks: [
      { id: "n5-1", type: "heading", props: { text: "Niet elke airco heeft elk jaar onderhoud nodig", align: "left" } },
      { id: "n5-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n5-3", type: "text", props: { content: "Eerlijk gezegd: als je airco weinig draait, in een schone omgeving staat en jonger is dan drie jaar, kun je prima twee jaar overslaan. We verdienen meer aan onderhoud dan aan dit advies, maar het is wel de waarheid.", align: "left" } },
      { id: "n5-4", type: "text", props: { content: "Wanneer heeft onderhoud wel zin? Als de unit in een keuken, werkplaats of drukke woonkamer hangt, als je merkt dat hij minder koud blaast dan vorig jaar, of als hij ouder is dan vijf jaar. Vuile filters kosten tot 15% efficiëntie. Op jaarbasis is dat zichtbaar op je stroomrekening.", align: "left" } },
      { id: "n5-5", type: "text", props: { content: "Een onderhoudsbeurt bij ons kost vanaf €99 all-in incl. BTW. We reinigen de filters, checken de druk en controleren op beginnende lekkages. Als we niks vinden te repareren, zeggen we dat ook.", align: "left" } },
      { id: "n5-6", type: "button", props: { text: "Plan een onderhoudsbeurt", url: "https://staycoolairco.nl/airco-service", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n5-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 6,
    subject: "Airco vs warmtepomp — wat is het verschil?",
    bodyBlocks: [
      { id: "n6-1", type: "heading", props: { text: "Een moderne airco is al een warmtepomp — je weet het alleen niet", align: "left" } },
      { id: "n6-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n6-3", type: "text", props: { content: "Er is verwarring over de termen. Een split-airco met verwarmingsfunctie werkt technisch exact hetzelfde als een lucht-lucht warmtepomp. Het zijn andere namen voor hetzelfde apparaat.", align: "left" } },
      { id: "n6-4", type: "text", props: { content: "Het verschil zit niet in het apparaat maar in hoe je het inzet. Een airco-warmtepomp verwarmt de lucht in de ruimte direct. Een hybride warmtepomp koppelt aan je bestaande cv-ketel en verwarmt via radiatoren. Dat laatste is duurder in aanschaf en installatie.", align: "left" } },
      { id: "n6-5", type: "text", props: { content: "Voor verwarming: moderne units hebben een SCOP van 4.0 tot 5.0. Dat betekent dat je voor 1 kWh stroom 4 tot 5 kWh warmte terugkrijgt. Vergeleken met een gasketel bespaar je tot 60% op stookkosten. In euro's: €800 tot €1.500 per jaar voor een gemiddeld Limburgs huishouden.", align: "left" } },
      { id: "n6-6", type: "text", props: { content: "Bij strenge vorst wordt de efficiency wel lager. Maar van september tot april doet de airco het uitstekend als hoofdverwarming of aanvulling op je ketel.", align: "left" } },
      { id: "n6-7", type: "button", props: { text: "Airco met verwarmingsfunctie", url: "https://staycoolairco.nl/airco-met-verwarming", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n6-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 7,
    subject: "Hoe lang gaat een airco mee?",
    bodyBlocks: [
      { id: "n7-1", type: "heading", props: { text: "12 tot 15 jaar bij goed onderhoud. Minder bij verwaarlozing.", align: "left" } },
      { id: "n7-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n7-3", type: "text", props: { content: "De fabrieksgarantie van Daikin en Mitsubishi loopt tot 7 jaar. Maar een goed onderhouden unit gaat aanzienlijk langer. Wij zien regelmatig units van 12 à 15 jaar die nog foutloos draaien.", align: "left" } },
      { id: "n7-4", type: "text", props: { content: "Wat de levensduur verkort: nooit schoonmaken, de unit het hele jaar door op maximale stand draaien, en een lekkage laten doorlopen zonder te repareren. Een unit die droog loopt op koudemiddel is in één seizoen kapot.", align: "left" } },
      { id: "n7-5", type: "text", props: { content: "Wat de levensduur verlengt: filters jaarlijks reinigen, elke drie tot vijf jaar een professionele onderhoudsbeurt, en storingen vroeg melden. Een beginnende lekkage kost €150 om te verhelpen. Als je wacht, kost het je een compressor — en dat is al snel €600 of meer.", align: "left" } },
      { id: "n7-6", type: "text", props: { content: "Heb je een unit die al ouder dan 10 jaar is en problemen geeft? Stuur ons het merk en type via WhatsApp 06 36481054. Dan vertellen we je eerlijk of reparatie de moeite waard is.", align: "left" } },
      { id: "n7-7", type: "button", props: { text: "Kennisbank — veelgestelde vragen", url: "https://staycoolairco.nl/kennisbank", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n7-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 8,
    subject: "F-gas en STEK — wat die certificaten zeggen",
    bodyBlocks: [
      { id: "n8-1", type: "heading", props: { text: "Een certificaat is niet genoeg. Hier is waarom.", align: "left" } },
      { id: "n8-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n8-3", type: "text", props: { content: "F-gassen-certificering (conform EU 517/2014) is de wettelijke minimumeis om koudemiddelen te mogen behandelen. Zonder dit certificaat mag een installateur een airco wettelijk niet aansluiten. STEK is de Nederlandse variant — een erkend examenbedrijf dat het certificaat uitgeeft.", align: "left" } },
      { id: "n8-4", type: "text", props: { content: "Maar het certificaat zegt alleen dat iemand het examen heeft gehaald. Niet dat hij een unit netjes wegwerkt, de leiding strak trekt, de condensafvoer goed afloopt of de stroomgroep correct aansluit. Dat zie je pas als de monteur op de stoep staat.", align: "left" } },
      { id: "n8-5", type: "text", props: { content: "We horen geregeld van klanten die een goedkope aanbieding hadden aanvaard bij een installateur die wel gecertificeerd was, maar het werk rommelig afleverde. Een gescheurde slang die na tien maanden begint te lekken — dat is geen pech, dat is slechte installatie.", align: "left" } },
      { id: "n8-6", type: "text", props: { content: "Wij zijn F-gas gecertificeerd en geven 2 jaar installatiegarantie op montage en lekdichtheid. Lekt er toch iets door onze schuld? We komen langs en lossen het op. Kosteloos. Dat staat ook in onze reviews — 4,9 sterren uit 231 beoordelingen.", align: "left" } },
      { id: "n8-7", type: "button", props: { text: "Airco laten plaatsen in Limburg", url: "https://staycoolairco.nl/airco-plaatsen-limburg", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n8-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 9,
    subject: "ISDE 2026 — subsidie tot €2.000 voor je airco",
    bodyBlocks: [
      { id: "n9-1", type: "heading", props: { text: "Tot €2.000 subsidie — als je aan de voorwaarden voldoet", align: "left" } },
      { id: "n9-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n9-3", type: "text", props: { content: "De ISDE-subsidie (Investeringssubsidie Duurzame Energie) is in 2026 nog beschikbaar voor lucht-lucht warmtepompen. Het maximum is €2.000 per woning, maar het exacte bedrag hangt af van het type unit en het vermogen.", align: "left" } },
      { id: "n9-4", type: "text", props: { content: "Je vraagt de subsidie ná installatie aan via rvo.nl — je hebt een betaalde factuur nodig. Verifieer de exacte bedragen en voorwaarden voor 2026 op rvo.nl, die worden jaarlijks bijgesteld.", align: "left" } },
      { id: "n9-5", type: "text", props: { content: "Wij weten welke units op de erkende apparatenlijst van RVO staan en helpen je de aanvraag voor te bereiden. De exacte subsidiebedragen voor 2026 verifieer je het beste via rvo.nl — die worden jaarlijks bijgesteld en kunnen tussentijds wijzigen.", align: "left" } },
      { id: "n9-6", type: "text", props: { content: "Wil je weten of jouw situatie in aanmerking komt? Stuur ons een appje via WhatsApp 06 36481054. We kijken het gewoon even na voor je.", align: "left" } },
      { id: "n9-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 10,
    subject: "Warmtepomp + airco subsidie 2026",
    bodyBlocks: [
      { id: "n10-1", type: "heading", props: { text: "Twee subsidies bestaan naast elkaar. Niet iedereen weet dat.", align: "left" } },
      { id: "n10-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n10-3", type: "text", props: { content: "De ISDE dekt lucht-lucht warmtepompen — dat zijn de units die wij installeren. Tot €2.000 via rvo.nl.", align: "left" } },
      { id: "n10-4", type: "text", props: { content: "Daarnaast is er in sommige gemeenten een gemeentelijke subsidie voor verduurzaming. Of die loopt en hoe hoog die is, verschilt per gemeente — check de site van jouw gemeente of vraag ons.", align: "left" } },
      { id: "n10-5", type: "text", props: { content: "Let op: subsidies stapelen klinkt mooi, maar niet alle regelingen zijn combineerbaar. Controleer dit altijd bij rvo.nl en je gemeente voor je aanvraagt.", align: "left" } },
      { id: "n10-6", type: "text", props: { content: "Concreet advies nodig voor jouw situatie? Stuur een appje naar 06 36481054. We bekijken samen wat van toepassing is op jouw adres.", align: "left" } },
      { id: "n10-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 11,
    subject: "Airco financiering — in termijnen of leasen?",
    bodyBlocks: [
      { id: "n11-1", type: "heading", props: { text: "Niet iedereen heeft €1.600 direct beschikbaar. Dat begrijpen we.", align: "left" } },
      { id: "n11-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n11-3", type: "text", props: { content: "Een single-split installatie begint bij €1.600 all-in incl. BTW. Dat is een eerlijk bedrag voor wat je krijgt — unit, montage, leidingwerk, garantie. Maar niet iedereen heeft dat op dit moment beschikbaar.", align: "left" } },
      { id: "n11-4", type: "text", props: { content: "Financiering is mogelijk via een persoonlijke lening bij je bank. Reken op een looptijd van 24 tot 60 maanden. Bij €1.800 over 36 maanden zit je op ongeveer €55 per maand — terwijl je inmiddels tot €1.500 per jaar bespaart op je stookkosten als je de airco ook voor verwarming inzet.", align: "left" } },
      { id: "n11-5", type: "text", props: { content: "Airco leasen bestaat ook, maar is voor particulieren minder gangbaar dan voor zakelijke klanten. We kunnen je doorverwijzen als dat een optie is die je wilt verkennen.", align: "left" } },
      { id: "n11-6", type: "text", props: { content: "Wil je de opties doorspreken? Stuur ons een appje naar 06 36481054. We denken mee over wat in jouw situatie past.", align: "left" } },
      { id: "n11-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 12,
    subject: "BTW op je airco aftrekken",
    bodyBlocks: [
      { id: "n12-1", type: "heading", props: { text: "Zakelijk gebruik — dan is de BTW gewoon terug te vragen", align: "left" } },
      { id: "n12-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n12-3", type: "text", props: { content: "Gebruik je de airco in een bedrijfsruimte, kantoor aan huis of werkplek die je zakelijk registreert? Dan is de BTW op aanschaf en installatie in de meeste gevallen aftrekbaar als voorbelasting.", align: "left" } },
      { id: "n12-4", type: "text", props: { content: "Op een installatie van €1.600 all-in incl. BTW gaat het om ongeveer €277 die je terugkrijgt via de BTW-aangifte. Bij een duurdere unit of multi-split loopt dat op naar €600–€900.", align: "left" } },
      { id: "n12-5", type: "text", props: { content: "Voorwaarde: de ruimte moet aantoonbaar zakelijk gebruikt worden. Laat je accountant het bevestigen; wij leveren de factuur op bedrijfsnaam.", align: "left" } },
      { id: "n12-6", type: "text", props: { content: "Wil je een offerte op bedrijfsnaam? Stuur ons een appje naar 06 36481054.", align: "left" } },
      { id: "n12-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 13,
    subject: "Subsidie airco aanvragen — stap voor stap",
    bodyBlocks: [
      { id: "n13-1", type: "heading", props: { text: "ISDE-subsidie loopt via rvo.nl — niet via ons", align: "left" } },
      { id: "n13-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n13-3", type: "text", props: { content: "Op een warmtepomp-airco kun je in 2026 tot €2.000 ISDE-subsidie aanvragen. De aanvraag doe je zelf via rvo.nl — maar je hebt daarvoor een paar dingen van ons nodig.", align: "left" } },
      { id: "n13-4", type: "text", props: { content: "Wat je nodig hebt: de factuur, het modelnummer van de unit, en bewijs van installatie door een gecertificeerde installateur. Wij zijn F-gassen gecertificeerd conform EU-verordening 517/2014 — dat papier levert geen discussie op bij RVO.", align: "left" } },
      { id: "n13-5", type: "text", props: { content: "De volgorde: eerst installeren, dan aanvragen. RVO wil een betaalde factuur zien.", align: "left" } },
      { id: "n13-6", type: "text", props: { content: "Controleer voor aanvraag of het bedrag en de voorwaarden voor 2026 nog kloppen via rvo.nl. Vragen over welke units subsidiabel zijn? Stuur een appje naar 06 36481054.", align: "left" } },
      { id: "n13-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 14,
    subject: "Welke airco past bij jouw woning",
    bodyBlocks: [
      { id: "n14-1", type: "heading", props: { text: "Vermogen is het begin — isolatie bepaalt de rest", align: "left" } },
      { id: "n14-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n14-3", type: "text", props: { content: "De vuistregel: 100 watt per m² koelvermogen. Een kamer van 25m² heeft dus een unit van 2,5 kW nodig. Maar dat is een beginpunt, geen eindantwoord.", align: "left" } },
      { id: "n14-4", type: "text", props: { content: "Een slecht geïsoleerde zolder met veel zuidelijk glas heeft bij 25m² eerder een 3,5 kW unit nodig. Een goed geïsoleerde slaapkamer van 18m² doet het met 2 kW.", align: "left" } },
      { id: "n14-5", type: "text", props: { content: "Een populaire keuze voor middelgrote ruimtes: de Tosot 5kW. Dekt een kamer van ~50m², staat op 20 dB(A) — dat is fluisterstil. Prijs: €1.600 all-in incl. BTW voor de instapvarianten, hogere modellen naar €2.500.", align: "left" } },
      { id: "n14-6", type: "text", props: { content: "Wil je weten wat bij jouw situatie past? App ons vrijblijvend via WhatsApp 06 36481054. We rekenen het door zonder verplichtingen.", align: "left" } },
      { id: "n14-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 15,
    subject: "Slaapkamer-airco zonder slang — eerlijk verhaal",
    bodyBlocks: [
      { id: "n15-1", type: "heading", props: { text: "Een mobiele unit zonder gat in de muur bestaat niet echt", align: "left" } },
      { id: "n15-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n15-3", type: "text", props: { content: "Mobiele airco's zijn populair omdat ze geen installateur nodig hebben. Ze zijn ook populair op de tweedehands-markt — mensen kopen ze, gebruiken ze één zomer, en zetten ze weg.", align: "left" } },
      { id: "n15-4", type: "text", props: { content: "Het probleem: de slang die warme lucht afvoert moet ergens naartoe. Dat gaat via een raamkit of een gat in de muur. Zonder afvoer verhit de unit de kamer meer dan hij koelt. Dat is geen mening — dat is thermodynamica.", align: "left" } },
      { id: "n15-5", type: "text", props: { content: "Een vaste split-unit werkt anders: buitenunit pompt de warmte naar buiten, binnenunit geeft koele lucht. Geen slang door het raam, geen condensbak leegmaken, geen lawaai in de slaapkamer.", align: "left" } },
      { id: "n15-6", type: "text", props: { content: "Een single-split voor de slaapkamer begint bij €1.600 all-in incl. BTW. Wil je weten of jouw slaapkamer geschikt is? Stuur een appje naar 06 36481054.", align: "left" } },
      { id: "n15-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 16,
    subject: "Zolder-airco — andere eisen dan beneden",
    bodyBlocks: [
      { id: "n16-1", type: "heading", props: { text: "Een zolder kan 15 graden warmer zijn dan de woonkamer", align: "left" } },
      { id: "n16-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n16-3", type: "text", props: { content: "Een zolder zonder dakisolatie absorbeert warmte van boven. Bij 30°C buiten kan de zoldertemperatuur op 42–45°C uitkomen. Dat is een ander probleem dan een warme woonkamer.", align: "left" } },
      { id: "n16-4", type: "text", props: { content: "Een airco op de zolder heeft daardoor meer capaciteit nodig dan dezelfde vloeroppervlakte beneden. Een slaapkamer van 20m² op de begane grond doet het met 2 kW. Dezelfde 20m² op een ongeïsoleerde zolder heeft eerder 3,5 kW nodig.", align: "left" } },
      { id: "n16-5", type: "text", props: { content: "Daarnaast: de leidinglengte van buiten- naar binnenunit is op een zolder vaak langer. Dat kost wat meer bij installatie (ongeveer €20–€40 per extra meter boven 5 m), maar het werkt prima als de unit goed gedimensioneerd is.", align: "left" } },
      { id: "n16-6", type: "text", props: { content: "Bij de opname kijken we dit altijd door. App ons via WhatsApp 06 36481054 — we komen vrijblijvend langs.", align: "left" } },
      { id: "n16-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 17,
    subject: "Stille airco voor de woonkamer",
    bodyBlocks: [
      { id: "n17-1", type: "heading", props: { text: "20 dB(A) — zachter dan een fluister", align: "left" } },
      { id: "n17-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n17-3", type: "text", props: { content: "De meeste klachten over airco's in de woonkamer gaan niet over koeling maar over geluid. Een unit die op 35 dB(A) draait valt op tijdens een gesprek of een film.", align: "left" } },
      { id: "n17-4", type: "text", props: { content: "De Tosot 5kW staat op 20 dB(A) in de laagste stand. Ter vergelijking: een rustig kantoor zit op 40 dB(A). Je hoort de unit nauwelijks als hij op comfortstand draait.", align: "left" } },
      { id: "n17-5", type: "text", props: { content: "Die 5kW dekt een ruimte van ~50m² — goed voor een open woonkamer of combinatie keuken-eetkamer. Prijs begint bij €1.600 all-in incl. BTW, montage inbegrepen.", align: "left" } },
      { id: "n17-6", type: "text", props: { content: "Wil je weten welke unit het beste past bij jouw woonkamer? App ons via WhatsApp 06 36481054.", align: "left" } },
      { id: "n17-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 18,
    subject: "Eerste warme dag — check dit nu zelf",
    bodyBlocks: [
      { id: "n18-1", type: "heading", props: { text: "Filter schoonmaken duurt 30 seconden", align: "left" } },
      { id: "n18-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n18-3", type: "text", props: { content: "Voor de eerste echte hittegolf: klap het frontpaneel van je binnenunit open, schuif het filter eruit en spoel het af onder de kraan. Droog laten, terugplaatsen, klaar.", align: "left" } },
      { id: "n18-4", type: "text", props: { content: "Een verstopt filter betekent minder koelvermogen, hogere stroomkosten en in het slechtste geval dat de unit op een warme dag stopt. Dat is de meest voorkomende reden dat mensen ons bellen in augustus.", align: "left" } },
      { id: "n18-5", type: "text", props: { content: "Zijn er ook andere signalen — een vreemde geur, druppels uit de binnenunit, of een piepend geluid — dan is een onderhoudsbeurt slimmer. We checken de druk, reinigen de verdamper grondig en controleren op lekkage. Vanaf €99 all-in incl. BTW.", align: "left" } },
      { id: "n18-6", type: "button", props: { text: "Plan een onderhoudsbeurt", url: "https://staycoolairco.nl/airco-service", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n18-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 19,
    subject: "Voor de winter — airco op verwarmstand",
    bodyBlocks: [
      { id: "n19-1", type: "heading", props: { text: "Verwarmen met airco scheelt €800–€1.500 per jaar", align: "left" } },
      { id: "n19-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n19-3", type: "text", props: { content: "Een airco werkt ook andersom: warmte van buiten naar binnen pompen. Dat heet een warmtepomp-functie, en die zit standaard in elke split-unit die wij installeren.", align: "left" } },
      { id: "n19-4", type: "text", props: { content: "De efficiëntie: moderne A+++ units hebben een SCOP van 4.0–5.0. Dat betekent 1 kWh stroom levert 4 à 5 kWh warmte op. Een gasketel zit op 0,9. Voor een gemiddeld Limburgs rijtjeshuis scheelt dat €800–€1.500 per jaar op de energierekening.", align: "left" } },
      { id: "n19-5", type: "text", props: { content: "Wel even onderhoud laten doen voor je hem serieus gaat gebruiken voor verwarming. Een unit die de zomer achter de rug heeft, doet het beter als de filters schoon zijn en de druk goed staat. Onderhoudsbeurt vanaf €99 all-in incl. BTW.", align: "left" } },
      { id: "n19-6", type: "button", props: { text: "Onderhoud inplannen", url: "https://staycoolairco.nl/airco-service", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n19-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 20,
    subject: "Hittegolf — airco stopt. Wat nu.",
    bodyBlocks: [
      { id: "n20-1", type: "heading", props: { text: "De airco gaat altijd kapot op de heetste dag", align: "left" } },
      { id: "n20-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n20-3", type: "text", props: { content: "Dat is een natuurwet. Drie dingen die je eerst zelf kunt controleren: het filterplaatje zit los, de buitenunit staat in de volle zon zonder luchtcirculatie, of de zekering is gevallen.", align: "left" } },
      { id: "n20-4", type: "text", props: { content: "Lukt het niet? Stuur een appje naar 06 36481054 — WhatsApp is de snelste route. In piekweken is de telefoon soms bezet; via WhatsApp heeft Marvin de meeste grip op de planning.", align: "left" } },
      { id: "n20-5", type: "text", props: { content: "Een storingsbezoek kost vanaf €89 voorrijden. Als de reparatie ter plekke gedaan wordt, verrekenen we de voorrijkosten in de totaalprijs. Diagnose doen we altijd eerlijk: als er iets kapot is dat niet meer de moeite waard is te repareren, zeggen we dat.", align: "left" } },
      { id: "n20-6", type: "text", props: { content: "Stuur een appje naar 06 36481054. We doen ons best om snel te komen — zeker als het echt warm is.", align: "left" } },
      { id: "n20-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 21,
    subject: "Voorjaarsschoonmaak — filter is 30 sec werk",
    bodyBlocks: [
      { id: "n21-1", type: "heading", props: { text: "Eén keer per jaar filter schoonmaken — dat is alles", align: "left" } },
      { id: "n21-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n21-3", type: "text", props: { content: "Het voorjaar is het goede moment. Klap het frontpaneel open, trek het filter er voorzichtig uit en spoel het af onder lauwwarm water. Schudden, droogleggen op een handdoek, terugplaatsen.", align: "left" } },
      { id: "n21-4", type: "text", props: { content: "Waarom nu: een verstopt filter vermindert het koelvermogen al bij 10–15% vervuiling. De unit gaat harder draaien, trekt meer stroom en koelt slechter. In juni merk je dat op de warmste dag — te laat om iets aan te doen.", align: "left" } },
      { id: "n21-5", type: "text", props: { content: "Is de unit al twee jaar of langer niet professioneel onderhouden? Dan is een onderhoudsbeurt verstandiger dan alleen het filter. We reinigen de verdamper, checken de druk en controleren op een beginnende lekkage. Vanaf €99 all-in incl. BTW.", align: "left" } },
      { id: "n21-6", type: "button", props: { text: "Onderhoudsbeurt inplannen", url: "https://staycoolairco.nl/airco-service", align: "left", bgColor: "#2080C0", textColor: "#ffffff" } },
      { id: "n21-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 22,
    subject: "Vorige week: filter, geen kapotte airco",
    bodyBlocks: [
      { id: "n22-1", type: "heading", props: { text: "De eerste check is gratis kennis", align: "left" } },
      { id: "n22-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n22-3", type: "text", props: { content: "Vorige week belde iemand uit Maastricht. Airco blies nog wel lucht, maar koelde nauwelijks meer. Haar conclusie: defect. Onze conclusie: vuile filters.", align: "left" } },
      { id: "n22-4", type: "text", props: { content: "Een verstopt filter snijdt de luchtstroom af. De unit werkt harder, koelt minder, en trekt meer stroom. In het ergste geval vries je de verdamper in — en dan heb je pas een probleem.", align: "left" } },
      { id: "n22-5", type: "text", props: { content: "Filters schoonmaken doe je zelf: uitzetten, filter uitschuiven, afspoelen met lauw water, laten drogen, terugplaatsen. Tien minuten werk. Doe het eens per maand als je de unit intensief gebruikt.", align: "left" } },
      { id: "n22-6", type: "text", props: { content: "Heb je het gedaan en koelt-ie nog steeds niet goed? Dan is een onderhoudsbeurt de volgende stap. Vanaf €99 all-in — drukcheck, lekkagecontrole, volledige reiniging.", align: "left" } },
      { id: "n22-7", type: "text", props: { content: "Vragen? App ons gewoon: 06 36481054.", align: "left" } },
      { id: "n22-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 23,
    subject: "Wat als er een jaar later iets lekt?",
    bodyBlocks: [
      { id: "n23-1", type: "heading", props: { text: "Een garantie die we ook echt waarmaken", align: "left" } },
      { id: "n23-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n23-3", type: "text", props: { content: "Een eerlijk verhaal. Een klant liet bijna een jaar na plaatsing een kleine lekkage zien — een slang aan de buitenunit was gescheurd. We kwamen langs en hebben het kosteloos opgelost.", align: "left" } },
      { id: "n23-4", type: "text", props: { content: "Geen discussie over wie er schuld had. Geen voorrijkosten. Gewoon oplossen.", align: "left" } },
      { id: "n23-5", type: "text", props: { content: "Dat is waar de installatiegarantie van 2 jaar voor bedoeld is. Niet als verkoopargument in de offerte, maar voor het moment dat er ondanks alle zorg toch iets misgaat.", align: "left" } },
      { id: "n23-6", type: "text", props: { content: "Veel installateurs zijn na betaling onbereikbaar. Wij niet — dat klinkt als een claim, maar het staat in onze reviews. 4,9 sterren, 231 beoordelingen. Mensen schrijven dat zelf op.", align: "left" } },
      { id: "n23-7", type: "text", props: { content: "Twijfels over je eigen installatie? App ons: 06 36481054.", align: "left" } },
      { id: "n23-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 24,
    subject: "De €800 Marktplaats-airco die niet kon werken",
    bodyBlocks: [
      { id: "n24-1", type: "heading", props: { text: "Waarom we dat verzoek niet kunnen aannemen", align: "left" } },
      { id: "n24-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n24-3", type: "text", props: { content: "We krijgen het geregeld: iemand heeft een airco op Marktplaats gevonden voor €800 en zoekt iemand om hem op te hangen. In negen van de tien gevallen moeten we nee zeggen.", align: "left" } },
      { id: "n24-4", type: "text", props: { content: "Geen F-gas-papieren bij de unit. Geen typeplaatje. Geen garantie van de leverancier. Als wij hem aansluiten en er lekt koudemiddel — zijn wij verantwoordelijk voor iets wat we niet geleverd hebben.", align: "left" } },
      { id: "n24-5", type: "text", props: { content: "Dat doen we niet. Niet uit arrogantie, maar omdat het ook voor jou slecht afloopt: geen garantie, geen servicepartner, niemand die hem kent als hij het volgend jaar weer doet.", align: "left" } },
      { id: "n24-6", type: "text", props: { content: "Onze instapprijs is €1.600 all-in incl. BTW. Unit, montage, leidingwerk tot 5 meter, 2 jaar installatiegarantie. Dat verschil met de €800 is kleiner dan het lijkt als je de losse installatiekosten erbij optelt.", align: "left" } },
      { id: "n24-7", type: "text", props: { content: "Wil je weten wat een installatie bij jou kost? App ons gerust: 06 36481054.", align: "left" } },
      { id: "n24-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 25,
    subject: "Multi-split van 3 dagen, in 1 dag geplaatst",
    bodyBlocks: [
      { id: "n25-1", type: "heading", props: { text: "Hoe een installatie sneller gaat dan gepland", align: "left" } },
      { id: "n25-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n25-3", type: "text", props: { content: "Een multi-split met drie binnenunits plannen we standaard op twee dagen in. Één dag voor de buitenunit, leidingwerk en de eerste binnenunit. Dag twee voor de rest.", align: "left" } },
      { id: "n25-4", type: "text", props: { content: "Onlangs hadden we een opdracht waarbij alles meeviel: goede bereikbaarheid van de buitenwand, korte leidinglengte, nette meterkast. Danny en ik waren eind van de middag klaar. Dag twee hoefde niet.", align: "left" } },
      { id: "n25-5", type: "text", props: { content: "De klant had drie kamers in één dag klaar. Dat lukt niet altijd, maar het is ook geen uitzondering als de situatie goed is.", align: "left" } },
      { id: "n25-6", type: "text", props: { content: "Bij de opname schatten we altijd eerlijk in. Geen twee gaten zijn hetzelfde — muurdikte, verdiepingshoogte, afstand tot de meterkast bepalen de tijdsduur. Maar we overschatten liever dan dat we halverwege zeggen dat we de volgende dag terugkomen.", align: "left" } },
      { id: "n25-7", type: "text", props: { content: "Interesse in een multi-split? App ons: 06 36481054.", align: "left" } },
      { id: "n25-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 26,
    subject: "Airco voor je kantoor — wat de regels zeggen",
    bodyBlocks: [
      { id: "n26-1", type: "heading", props: { text: "Zakelijk airco: drie dingen die anders zijn dan thuis", align: "left" } },
      { id: "n26-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n26-3", type: "text", props: { content: "Een airco in een bedrijfspand werkt technisch hetzelfde als thuis. Maar de regels zijn anders op drie punten.", align: "left" } },
      { id: "n26-4", type: "text", props: { content: "Eerste punt: systemen met meer dan 3 kg koudemiddel vallen onder de keuringsplicht. Dat betekent jaarlijkse lekkagecontrole door een F-gas-gecertificeerd bedrijf. Wij zijn dat — bij een installateur zonder certificering is je systeem na één jaar al niet meer compliant.", align: "left" } },
      { id: "n26-5", type: "text", props: { content: "Tweede punt: de BTW is voor zakelijke klanten aftrekbaar. De investering van €2.800–€5.500 voor een multi-split voelt anders als je hem op de balans zet.", align: "left" } },
      { id: "n26-6", type: "text", props: { content: "Derde punt: huurpand? Leg het vast met de verhuurder. In de meeste huurcontracten mag het, mits je schriftelijk toestemming hebt. Wij helpen je met de technische specificaties die verhuurders vragen.", align: "left" } },
      { id: "n26-7", type: "text", props: { content: "Vragen over een zakelijke installatie? App ons: 06 36481054.", align: "left" } },
      { id: "n26-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 27,
    subject: "Onderhoudscontract zakelijk — vaste prijs",
    bodyBlocks: [
      { id: "n27-1", type: "heading", props: { text: "Geen verrassingsfactuur in augustus", align: "left" } },
      { id: "n27-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n27-3", type: "text", props: { content: "Een airco die in augustus uitvalt in een kantoor is geen ongemak — het is een productiviteitsprobleem. We zien het elke zomer een paar keer.", align: "left" } },
      { id: "n27-4", type: "text", props: { content: "De meeste storingen in de zomer zijn te voorkomen. Verstopte filters, te lage koudemiddeldruk, vuile warmtewisselaar — dat vang je op met een onderhoudsbeurt in april of mei. Vóór het piekseizoen.", align: "left" } },
      { id: "n27-5", type: "text", props: { content: "Voor zakelijke klanten doen we dat voor een vaste prijs per unit per jaar: vanaf €99 all-in. Meerdere units? We bespreken een tarief dat past bij de omvang.", align: "left" } },
      { id: "n27-6", type: "text", props: { content: "Wat krijg je: filterreiniging, drukcheck, lekkagecontrole, rapportage. En als we iets vinden dat aandacht nodig heeft, melden we het direct — zonder extra kosten voor de diagnose.", align: "left" } },
      { id: "n27-7", type: "text", props: { content: "Wil je weten wat dit voor jouw situatie kost? App ons: 06 36481054.", align: "left" } },
      { id: "n27-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 28,
    subject: "Airco leasen of kopen — de rekensom",
    bodyBlocks: [
      { id: "n28-1", type: "heading", props: { text: "Kopen is goedkoper. Lease heeft andere voordelen.", align: "left" } },
      { id: "n28-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n28-3", type: "text", props: { content: "We worden hier steeds vaker over gebeld door zakelijke klanten. Eerlijk antwoord: over de looptijd van 5 jaar is kopen bijna altijd goedkoper.", align: "left" } },
      { id: "n28-4", type: "text", props: { content: "Een single-split all-in voor €1.600–€2.500. Bij lease betaal je 5 jaar lang een maandbedrag — de totaalsom ligt hoger, ook na de renteaftrek.", align: "left" } },
      { id: "n28-5", type: "text", props: { content: "Maar lease heeft twee voordelen die voor sommige bedrijven doorslaggevend zijn. Je houdt cash vrij. En je zet de maandlast direct als bedrijfskosten af — geen activering op de balans, geen afschrijvingsschema.", align: "left" } },
      { id: "n28-6", type: "text", props: { content: "Voor wie de investering liever spreidt: wij werken samen met een aantal financieringspartners. Vraag ernaar bij de offerte.", align: "left" } },
      { id: "n28-7", type: "text", props: { content: "Specifieke vragen over jouw situatie? App ons: 06 36481054.", align: "left" } },
      { id: "n28-8", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 29,
    subject: "Even checken — nog de juiste persoon?",
    bodyBlocks: [
      { id: "n29-1", type: "heading", props: { text: "Korte vraag, geen verplichtingen", align: "left" } },
      { id: "n29-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n29-3", type: "text", props: { content: "We sturen je af en toe een mail over airco-installatie en onderhoud. Maar mailadressen veranderen, en niet iedereen zit nog te wachten op onze berichten.", align: "left" } },
      { id: "n29-4", type: "text", props: { content: "Dus: ben je nog de juiste persoon op dit adres? En heb je nog interesse in wat we schrijven?", align: "left" } },
      { id: "n29-5", type: "text", props: { content: "Als dat niet meer zo is, geen punt. Afmelden kan gewoon onderaan deze mail. Geen moeite, geen vragen.", align: "left" } },
      { id: "n29-6", type: "text", props: { content: "Wil je wél op de lijst blijven? Dan hoef je niets te doen. We sturen je gewoon de volgende mail als we iets nuttigs te zeggen hebben.", align: "left" } },
      { id: "n29-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 30,
    subject: "Even opruimen — krijg je onze mails nog graag?",
    bodyBlocks: [
      { id: "n30-1", type: "heading", props: { text: "We houden de lijst graag schoon", align: "left" } },
      { id: "n30-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n30-3", type: "text", props: { content: "We sturen geen mails om je inbox vol te gooien. We sturen ze als we iets concreets te melden hebben — een goed moment voor onderhoud, een eerlijk verhaal over een installatie, of iets wat je geld scheelt.", align: "left" } },
      { id: "n30-4", type: "text", props: { content: "Als dat niet meer past, is dit het moment om je af te melden. De link staat onderaan. Geen vragen, geen vervolgmails.", align: "left" } },
      { id: "n30-5", type: "text", props: { content: "Blijf je liever op de lijst? Dan gewoon niets doen. We zijn er als je ons nodig hebt.", align: "left" } },
      { id: "n30-6", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
  {
    n: 31,
    subject: "Dit jaar veel geholpen — en jij?",
    bodyBlocks: [
      { id: "n31-1", type: "heading", props: { text: "Hoe staat je airco er dit jaar voor?", align: "left" } },
      { id: "n31-2", type: "text", props: { content: "Hoi {{contact.firstName}},", align: "left" } },
      { id: "n31-3", type: "text", props: { content: "We hebben de afgelopen maanden veel mensen in Limburg geholpen — nieuwe installaties, onderhoudsbeurten, en een paar storingen die beter voorkomen hadden kunnen worden.", align: "left" } },
      { id: "n31-4", type: "text", props: { content: "Benieuwd hoe het bij jou gaat. Werkt je airco nog naar behoren? Koelt hij even goed als vorig jaar? Of merk je dat hij langer doet over het koelen van een ruimte?", align: "left" } },
      { id: "n31-5", type: "text", props: { content: "Die laatste vraag is vaak het eerste signaal dat een onderhoudsbeurt nodig is. Niet urgent, maar het is beter om er in april voor te zorgen dan in augustus als hij het dan echt nodig heeft.", align: "left" } },
      { id: "n31-6", type: "text", props: { content: "Je mag gewoon op deze mail reageren als je wil. Of app me direct: 06 36481054. We kijken graag even mee.", align: "left" } },
      { id: "n31-7", type: "text", props: { content: "Groet,\nMarvin — {{company}}", align: "left" } },
    ],
  },
];

export const seedBacklogDrafts = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    const items = await ctx.db
      .query("emailBacklog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const byTitle = new Map(items.map((i) => [i.title, i]));
    let updated = 0;
    for (const d of DRAFTS) {
      const title = DEFAULT_TOPICS[d.n - 1]?.title;
      if (!title) continue;
      const item = byTitle.get(title);
      if (!item) continue;
      await ctx.db.patch(item._id, { subject: d.subject, bodyBlocks: d.bodyBlocks });
      updated++;
    }
    return { updated };
  },
});

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

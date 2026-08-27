import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Eenmalige seeding van de abonnement-dripcampagne (aug 2026): één segment
 * op de campagne-tag + vijf broadcasts (informatief → sales) die meteen op
 * hun verzendmoment worden ingepland via internal.broadcasts.runScheduled.
 *
 * Bewust een internalMutation (CLI-run, geen UI): de campagne-inhoud staat
 * hiermee ook in de repo. Idempotent op segment- en broadcastnaam — een
 * her-run maakt niets dubbel aan. De doelgroep wordt vooraf geladen met
 * contacts.importCampaignAudience (zelfde tag).
 *
 * Beelden: Higgsfield (gpt_image_2), gehost op aanmelden.staycoolairco.nl.
 * CTA's: /direct met een utm_content per mail, zodat de aanmeldingen per
 * mail herleidbaar zijn.
 */

export const CAMPAIGN_TAG = "abbo-campagne-2026";
const SEGMENT_NAME = "Abonnement-campagne (zonder abonnement)";
const BEELD = "https://aanmelden.staycoolairco.nl/campagne";

function cta(nr: number, label: string): string {
  const url = `https://aanmelden.staycoolairco.nl/direct?utm_source=email&utm_medium=drip&utm_campaign=onderhoudsabonnement&utm_content=mail-${nr}`;
  return (
    `<p style="margin:8px 0 18px;text-align:center;">` +
    `<a data-cta href="${url}" style="display:inline-block;background:#2080C0;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,Helvetica,sans-serif;">${label}</a>` +
    `</p><p style="text-align:center;font-size:12px;color:#8a94a6;">Online afsluiten — veilig betalen via iDEAL</p>`
  );
}

function beeld(nr: number, alt: string): string {
  return `<p><img src="${BEELD}/mail-${nr}.jpg" alt="${alt}" width="536" style="width:100%;height:auto;border-radius:8px;"/></p>`;
}

const MAILS: Array<{ nr: number; name: string; subject: string; body: string }> = [
  {
    nr: 1,
    name: "Abonnement-drip 1/5 — waarom onderhoud",
    subject: "Zo blijft uw airco fris en zuinig",
    body:
      beeld(1, "Frisse woonkamer met airco") +
      `<h2>Uw airco doet stil zijn werk. Tot hij dat niet meer doet.</h2>` +
      `<p>Goedendag,</p>` +
      `<p>Een airco die elke dag draait, verzamelt stof en vocht. Dat merkt u niet meteen. Maar langzaam gaat de lucht minder fris ruiken, wordt het koelen trager en gaat het stroomverbruik omhoog.</p>` +
      `<p>Met een jaarlijkse onderhoudsbeurt houden we uw airco schoon en gezond. We reinigen de filters en de binnenkant, controleren het koudemiddel en meten of alles nog doet wat het moet doen.</p>` +
      `<p>Zo blijft de lucht in huis fris, blijft het verbruik laag en gaat uw airco jaren langer mee. Net als bij een auto: klein onderhoud voorkomt grote reparaties.</p>` +
      cta(1, "Bekijk het onderhoudsabonnement") +
      `<p style="font-size:14px;color:#8a94a6;">In de volgende mail vertellen we wat u zelf kunt doen — en wat u beter aan ons kunt overlaten.</p>`,
  },
  {
    nr: 2,
    name: "Abonnement-drip 2/5 — zelf doen of laten doen",
    subject: "Dit kunt u zelf doen (en dit beter niet)",
    body:
      beeld(2, "Filter uit de airco wordt schoongemaakt") +
      `<h2>Zelf doen of laten doen?</h2>` +
      `<p>Goedendag,</p>` +
      `<p><strong>Dit kunt u prima zelf:</strong> de stoffilters van het binnendeel elke paar weken even uitkloppen of afspoelen. Klep open, filters eruit schuiven, drogen, terugplaatsen. Vijf minuten werk, en uw airco blaast weer vrij.</p>` +
      `<p><strong>Dit is ons werk:</strong> alles met koudemiddel. Lekkages opsporen, druk meten en bijvullen mag wettelijk alleen door een gecertificeerd bedrijf — daar zijn wij voor opgeleid en gecertificeerd. Ook de grondige reiniging van de warmtewisselaar en de condensafvoer laat u beter aan een monteur over.</p>` +
      `<p>Bij een onderhoudsbeurt doen we dat allemaal in één bezoek. U hoeft er niet aan te denken: met een abonnement plannen wij het elk jaar automatisch met u in.</p>` +
      cta(2, "Bekijk het onderhoudsabonnement") +
      `<p style="font-size:14px;color:#8a94a6;">Volgende keer: wat het kost als een airco jaren zonder onderhoud draait.</p>`,
  },
  {
    nr: 3,
    name: "Abonnement-drip 3/5 — wat verwaarlozing kost",
    subject: "De duurste airco is er één zonder onderhoud",
    body:
      beeld(3, "Warme woonkamer tijdens een hittegolf") +
      `<h2>Wat verwaarlozing echt kost</h2>` +
      `<p>Goedendag,</p>` +
      `<p>Een vervuilde airco moet harder werken voor hetzelfde resultaat. Dat betekent: meer stroom voor minder koelte, elke dag opnieuw.</p>` +
      `<p>En storingen komen zelden op een rustig moment. Ze komen tijdens de eerste hittegolf, als iedereen tegelijk belt en de wachttijden het langst zijn. Precies dan wilt u niet achteraan aansluiten.</p>` +
      `<p>Met een onderhoudsabonnement bent u dat voor: uw airco wordt elk jaar nagekeken vóórdat het seizoen begint, en bij een storing krijgt u <strong>voorrang</strong> — zonder voorrijkosten.</p>` +
      cta(3, "Regel uw onderhoud") +
      `<p style="font-size:14px;color:#8a94a6;">In de volgende mail leggen we precies uit wat het abonnement inhoudt en wat het kost.</p>`,
  },
  {
    nr: 4,
    name: "Abonnement-drip 4/5 — het aanbod",
    subject: "Zo werkt ons onderhoudsabonnement",
    body:
      beeld(4, "StayCool-monteur onderhoudt een airco") +
      `<h2>Alles geregeld, vanaf €13 per maand</h2>` +
      `<p>Goedendag,</p>` +
      `<p><strong>Basis — €13 per maand per airco.</strong> Elk jaar een volledige onderhoudsbeurt, inclusief arbeidsloon en materialen. Voorrang bij storingen, geen voorrijkosten, en opzegbaar per maand.</p>` +
      `<p><strong>Premium — €16 per maand per airco.</strong> Alles van Basis, plus: alle onderdelen inbegrepen én een vervangend toestel als uw airco stuk gaat en niet te repareren is. U zit nooit zonder koeling of verwarming.</p>` +
      `<p>Meerdere airco's? Vanaf drie systemen krijgt u automatisch 5% korting. Betaalt u per jaar, dan komt daar nog eens 5% jaarkorting bij.</p>` +
      `<p>Afsluiten is simpel: kies online uw pakket en aantal airco's, reken af via iDEAL, klaar. Wij nemen daarna contact op om de eerste beurt in te plannen.</p>` +
      cta(4, "Direct afsluiten — klaar in 1 minuut"),
  },
  {
    nr: 5,
    name: "Abonnement-drip 5/5 — afsluiter",
    subject: "Regel het vandaag — in één minuut geregeld",
    body:
      beeld(5, "Koele woonkamer met draaiende airco") +
      `<h2>Eén minuut nu, een zorgeloos jaar straks</h2>` +
      `<p>Goedendag,</p>` +
      `<p>U heeft de afgelopen weken gelezen waarom onderhoud loont: frisse lucht, een lager verbruik, een langere levensduur — en voorrang als het er echt om gaat.</p>` +
      `<p>Het regelen kost u letterlijk één minuut: kies Basis of Premium, vul in hoeveel airco's u heeft, en reken veilig af via iDEAL. Meer vragen we niet.</p>` +
      `<p>StayCool installeert en onderhoudt al jaren honderden airco's per jaar in Limburg. Uw airco is bij ons in goede handen — en met het abonnement hoeft u er zelf nooit meer aan te denken.</p>` +
      cta(5, "Sluit nu uw abonnement af") +
      `<p style="font-size:14px;color:#8a94a6;">PS: het abonnement is gewoon per maand opzegbaar. U zit dus nergens aan vast.</p>`,
  },
];

export const setupAbboCampagne = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    /** Epoch-ms per mail (zelfde volgorde als 1..5). */
    scheduledAts: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.scheduledAts.length !== MAILS.length) {
      throw new Error(`Verwacht ${MAILS.length} verzendmomenten`);
    }

    // Segment (idempotent op naam).
    let segment = (
      await ctx.db
        .query("segments")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect()
    ).find((s) => s.name === SEGMENT_NAME);
    if (!segment) {
      const segmentId = await ctx.db.insert("segments", {
        workspaceId: args.workspaceId,
        name: SEGMENT_NAME,
        rules: {
          match: "all",
          conditions: [{ field: "tags", op: "contains", value: CAMPAIGN_TAG }],
        },
      });
      segment = (await ctx.db.get(segmentId))!;
    }

    const bestaande = await ctx.db
      .query("broadcasts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const resultaat: Array<{ name: string; broadcastId: string; scheduledAt: number; status: string }> = [];
    for (let i = 0; i < MAILS.length; i++) {
      const mail = MAILS[i];
      const scheduledAt = args.scheduledAts[i];
      const al = bestaande.find((b) => b.name === mail.name);
      if (al) {
        resultaat.push({ name: mail.name, broadcastId: al._id, scheduledAt: al.scheduledAt ?? 0, status: `bestond al (${al.status})` });
        continue;
      }
      const broadcastId = await ctx.db.insert("broadcasts", {
        workspaceId: args.workspaceId,
        name: mail.name,
        subject: mail.subject,
        body: mail.body,
        segmentId: segment._id,
        status: "scheduled",
        scheduledAt,
        stats: { total: 0, sent: 0, delivered: 0, bounced: 0, unsubscribed: 0, failed: 0 },
      });
      await ctx.scheduler.runAt(scheduledAt, internal.broadcasts.runScheduled, {
        broadcastId,
      });
      resultaat.push({ name: mail.name, broadcastId, scheduledAt, status: "ingepland" });
    }
    return { segmentId: segment._id, broadcasts: resultaat };
  },
});

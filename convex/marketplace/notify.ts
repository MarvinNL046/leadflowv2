import { v } from "convex/values";
import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getSuperAdminEmails } from "../lib/env";

// ════════════════════════════════════════════════════════════════════════
// NIEUWE-LEAD-NOTIFICATIE
//
// insertLead voegde tot nu toe alleen een rij toe, zonder iemand te
// waarschuwen. Daardoor bleven in V1 leads maandenlang liggen (7 echte
// airco-aanvragen die niemand zag). Deze action stuurt bij elke nieuwe lead
// een mail naar de super-admins, zodat een lead niet meer ongemerkt binnenkomt.
//
// Aangeroepen fire-and-forget vanuit insertLead via ctx.scheduler.runAfter.
// ════════════════════════════════════════════════════════════════════════

/** Haalt de lead + de naam van de bron-sleutel op voor de mailtekst. */
export const getLeadForNotify = internalQuery({
  args: { leadId: v.id("marketplaceLeads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead) return null;
    // apiKeyId is optioneel in het schema; guard zodat het type netjes narrowt.
    const key = lead.apiKeyId ? await ctx.db.get(lead.apiKeyId) : null;
    return {
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      province: lead.province,
      niche: lead.niche,
      serviceType: lead.serviceType,
      message: lead.message,
      status: lead.status,
      source: key?.name,
    };
  },
});

/** Pure Resend-fetch. Ontbrekende key = mail overslaan, nooit de intake breken. */
async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "noreply@example.com";
  if (!apiKey) {
    console.warn("[marketplace-notify] RESEND_API_KEY ontbreekt — mail overgeslagen");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    console.error(
      `[marketplace-notify] Resend ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
}

export const notifyNewLead = internalAction({
  args: { leadId: v.id("marketplaceLeads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.runQuery(
      internal.marketplace.notify.getLeadForNotify,
      { leadId },
    );
    if (!lead) return;

    const name = `${lead.firstName} ${lead.lastName}`.trim();
    const loc = [lead.city, lead.province].filter(Boolean).join(", ");
    const subject = `Nieuwe lead: ${name} (${lead.niche})`;
    const text = [
      "Er is een nieuwe lead binnengekomen via de marketplace.",
      "",
      `Naam:     ${name}`,
      `Telefoon: ${lead.phone}`,
      lead.email ? `E-mail:   ${lead.email}` : null,
      `Plaats:   ${loc || "-"}`,
      `Niche:    ${lead.niche}${lead.serviceType ? " / " + lead.serviceType : ""}`,
      lead.message ? `Bericht:  ${lead.message}` : null,
      `Bron:     ${lead.source ?? "-"}`,
      `Status:   ${lead.status}`,
      "",
      `Dashboard: ${process.env.SITE_URL ?? ""}/marketplace`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    for (const to of getSuperAdminEmails()) {
      await sendEmail(to, subject, text);
    }
  },
});

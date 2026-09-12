import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "../_generated/server";
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
      notificationStatus: lead.notificationStatus,
    };
  },
});

/** Pure Resend-fetch. Ontbrekende key = mail overslaan, nooit de intake breken. */
async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "noreply@example.com";
  if (!apiKey) {
    console.warn("[marketplace-notify] RESEND_API_KEY ontbreekt — mail overgeslagen");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error(
      `[marketplace-notify] Resend ${res.status}`,
    );
  }
  return res.ok;
}

export const recordDelivery = internalMutation({
  args: { leadId: v.id("marketplaceLeads"), sent: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { leadId, sent }) => {
    if (await ctx.db.get(leadId)) {
      await ctx.db.patch(leadId, {
        notificationStatus: sent ? "sent" : "failed",
        notificationAttemptedAt: Date.now(),
      });
    }
    return null;
  },
});

export const notifyNewLead = internalAction({
  args: { leadId: v.id("marketplaceLeads") },
  returns: v.null(),
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.runQuery(
      internal.marketplace.notify.getLeadForNotify,
      { leadId },
    );
    if (!lead || lead.notificationStatus === "sent") return null;

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
      `Dashboard: ${(process.env.SITE_URL ?? "https://leadflow.wetry.app").replace(/\/$/, "")}/crm/leadgen`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    const recipients = getSuperAdminEmails();
    let sent = recipients.size > 0;
    for (const to of recipients) {
      try {
        if (!await sendEmail(to, subject, text)) sent = false;
      } catch {
        sent = false;
      }
    }
    await ctx.runMutation(internal.marketplace.notify.recordDelivery, { leadId, sent });
    return null;
  },
});

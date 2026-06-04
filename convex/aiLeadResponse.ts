import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptSecret } from "./lib/crypto";
import { pickChannel, isWithinQuietHours, buildPrompt, type Channel } from "./aiLeadResponse/helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

export const recentlyResponded = internalQuery({
  args: { contactId: v.id("contacts"), since: v.number() },
  handler: async (ctx, { contactId, since }) => {
    const sug = await ctx.db
      .query("aiSuggestedResponses")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    return sug.some((s) => s._creationTime >= since && s.status !== "dismissed");
  },
});

export const recordSuggestion = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    channel: v.union(v.literal("whatsapp"), v.literal("sms"), v.literal("email")),
    body: v.string(),
    model: v.string(),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
  },
  handler: async (ctx, args) => ctx.db.insert("aiSuggestedResponses", args),
});

export const getLeadContext = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const contact = await ctx.db.get(contactId);
    if (!contact) return null;
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const formNote = notes.find((n) => n.body.includes("Meta-form antwoorden"));
    const formAnswers = formNote
      ? formNote.body.split("\n").filter((l) => l.startsWith("•")).map((l) => l.replace(/^•\s*/, ""))
      : [];
    return {
      workspaceId: contact.workspaceId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      email: contact.email,
      city: contact.city,
      formAnswers,
    };
  },
});

export const handleNewLead = internalAction({
  args: { contactId: v.id("contacts"), workspaceId: v.id("workspaces") },
  handler: async (ctx, { contactId, workspaceId }) => {
    try {
      const cfg = await ctx.runQuery(internal.aiAgentConfig.getConfigInternal, { workspaceId });
      if (!cfg || !cfg.enabled || cfg.mode === "off") return;

      // dedup (24u)
      const dup = await ctx.runQuery(internal.aiLeadResponse.recentlyResponded, {
        contactId,
        since: Date.now() - DAY_MS,
      });
      if (dup) return;

      const lead = await ctx.runQuery(internal.aiLeadResponse.getLeadContext, { contactId });
      if (!lead) return;

      // quiet-hours (Europe/Amsterdam uur)
      const hour = Number(new Intl.DateTimeFormat("nl-NL", {
        hour: "numeric",
        hour12: false,
        timeZone: "Europe/Amsterdam",
      }).format(new Date()));
      const qStart = cfg.quietHoursStart ?? 21;
      const qEnd = cfg.quietHoursEnd ?? 8;
      if (cfg.mode === "auto" && isWithinQuietHours(hour, qStart, qEnd)) {
        // Uitstellen tot qEnd vandaag/morgen
        const next = new Date();
        next.setHours(qEnd, 0, 0, 0);
        if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
        await ctx.scheduler.runAt(
          next.getTime(),
          internal.aiLeadResponse.handleNewLead,
          { contactId, workspaceId },
        );
        return;
      }

      const channel: Channel | null = pickChannel(
        cfg.channelOrder,
        { phone: lead.phone, email: lead.email },
        cfg.whatsappTemplateName ?? null,
      );
      if (!channel) return;

      if (!cfg.anthropicApiKeyEncrypted) {
        console.error("[ai-agent] geen Anthropic-key gezet voor workspace", workspaceId);
        return;
      }
      const apiKey = await decryptSecret(cfg.anthropicApiKeyEncrypted);
      const { system, user } = buildPrompt({
        businessContext: cfg.businessContext,
        tone: cfg.tone,
        signature: cfg.signature,
        bookingUrl: cfg.bookingUrl,
        contact: { firstName: lead.firstName, lastName: lead.lastName, city: lead.city },
        formAnswers: lead.formAnswers,
      });

      const body = await callAnthropic(apiKey, cfg.model, system, user);
      if (!body) return;

      if (cfg.mode === "auto") {
        await ctx.runAction(internal.messaging.sendInternal, { contactId, channel, body });
        await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
          workspaceId,
          contactId,
          channel,
          body,
          model: cfg.model,
          status: "sent",
        });
      } else {
        await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
          workspaceId,
          contactId,
          channel,
          body,
          model: cfg.model,
          status: "pending",
        });
      }
    } catch (err) {
      console.error("[ai-agent] handleNewLead faalde:", err);
    }
  },
});

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        console.error("[ai-agent] anthropic", res.status, await res.text());
        continue;
      }
      const json = (await res.json()) as { content?: Array<{ text?: string }> };
      const text = json.content?.map((c) => c.text ?? "").join("").trim();
      return text || null;
    } catch (e) {
      console.error("[ai-agent] anthropic fetch", e);
    }
  }
  return null;
}

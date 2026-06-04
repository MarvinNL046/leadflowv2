import { v } from "convex/values";
import {
  action,
  internalAction,
  internalQuery,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptSecret } from "./lib/crypto";
import {
  pickChannel,
  isWithinQuietHours,
  buildPrompt,
  msSinceAmsterdamMidnight,
  msUntilAmsterdamHour,
  type Channel,
} from "./aiLeadResponse/helpers";

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

/** Aantal AI-berichten met status "sent" sinds `since` (begin van vandaag) —
 * voor de dagcap-guardrail (anti-runaway in auto-modus). */
export const countAutoSentToday = internalQuery({
  args: { workspaceId: v.id("workspaces"), since: v.number() },
  handler: async (ctx, { workspaceId, since }) => {
    const sent = await ctx.db
      .query("aiSuggestedResponses")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "sent"),
      )
      .collect();
    return sent.filter((s) => s._creationTime >= since).length;
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

      // Amsterdamse wandklok-onderdelen (Convex draait UTC → géén setHours).
      // Hieruit: quiet-hours-check, defer-tijd én dagcap-vensterstart, alles
      // in Amsterdamse tijd.
      const amsParts = new Intl.DateTimeFormat("nl-NL", {
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
        timeZone: "Europe/Amsterdam",
      }).formatToParts(new Date());
      const amsPart = (t: string) =>
        Number(amsParts.find((p) => p.type === t)?.value ?? 0);
      const hour = amsPart("hour") % 24; // "24" → 0 (middernacht-randgeval)
      const minute = amsPart("minute");
      const second = amsPart("second");
      const qStart = cfg.quietHoursStart ?? 21;
      const qEnd = cfg.quietHoursEnd ?? 8;
      if (cfg.mode === "auto" && isWithinQuietHours(hour, qStart, qEnd)) {
        // Uitstellen tot het eerstvolgende Amsterdamse qEnd:00.
        // (Bekende minor edge: twee intakes voor hetzelfde contact tijdens
        // quiet-hours kunnen beide uitgesteld worden → zeldzame dubbele send;
        // auto staat default uit. Later af te dekken met een pending-record.)
        await ctx.scheduler.runAt(
          Date.now() + msUntilAmsterdamHour(hour, minute, qEnd),
          internal.aiLeadResponse.handleNewLead,
          { contactId, workspaceId },
        );
        return;
      }

      // Dagcap (alleen auto): anti-runaway ceiling. Vensterstart =
      // Amsterdamse middernacht (niet UTC).
      if (cfg.mode === "auto") {
        const startOfDay =
          Date.now() - msSinceAmsterdamMidnight(hour, minute, second);
        const sentToday = await ctx.runQuery(
          internal.aiLeadResponse.countAutoSentToday,
          { workspaceId, since: startOfDay },
        );
        const cap = cfg.dailyCap ?? 200;
        if (sentToday >= cap) {
          console.warn(`[ai-agent] dagcap (${cap}) bereikt voor workspace ${workspaceId}, skip`);
          return;
        }
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
        try {
          await ctx.runAction(internal.messaging.sendInternal, { contactId, channel, body });
          await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
            workspaceId,
            contactId,
            channel,
            body,
            model: cfg.model,
            status: "sent",
          });
        } catch (sendErr) {
          // sendInternal re-throwt bij verzendfout → leg een failed-record
          // vast zodat dedup een re-send voorkomt + het zichtbaar blijft.
          console.error("[ai-agent] sendInternal faalde:", sendErr);
          await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
            workspaceId,
            contactId,
            channel,
            body,
            model: cfg.model,
            status: "failed",
          });
        }
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

// ──────────────────────────────────────────────────────────────────────
// PREVIEW (dry-run voor de settings-pagina)
// ──────────────────────────────────────────────────────────────────────

/** Interne helper — membership-check vanuit action-context via internalQuery. */
export const checkMembership = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (
    ctx: QueryCtx,
    { workspaceId }: { workspaceId: Id<"workspaces"> },
  ): Promise<{ ok: boolean; error?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, error: "Not authenticated" };
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) return { ok: false, error: "Workspace not found" };
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) return { ok: false, error: "Not a member of this workspace" };
    return { ok: true };
  },
});

/** Genereer een voorbeeld-bericht met een dummy-lead (Pascal Hendriks, Reuver).
 *  Enkel aanroepen vanuit de publieke wrapper `previewMessage`. */
export const generatePreview = internalAction({
  args: { workspaceId: v.id("workspaces") },
  handler: async (
    ctx,
    { workspaceId },
  ): Promise<{ text: string | null; error?: string }> => {
    const cfg = await ctx.runQuery(internal.aiAgentConfig.getConfigInternal, {
      workspaceId,
    });
    if (!cfg?.anthropicApiKeyEncrypted)
      return { text: null, error: "Geen Anthropic-key gezet" };
    const apiKey = await decryptSecret(cfg.anthropicApiKeyEncrypted);
    const { system, user } = buildPrompt({
      businessContext: cfg.businessContext,
      tone: cfg.tone,
      signature: cfg.signature,
      bookingUrl: cfg.bookingUrl,
      contact: { firstName: "Pascal", lastName: "Hendriks", city: "Reuver" },
      formAnswers: [
        "voor welk type ruimte: hele woning",
        "vermogen: weet ik niet, graag advies",
      ],
    });
    const text = await callAnthropic(apiKey, cfg.model, system, user);
    return { text };
  },
});

/** Public wrapper — belt de client aan. Doet membership-guard via internalQuery,
 *  dan delegeert naar `generatePreview`. */
export const previewMessage = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (
    ctx,
    { workspaceId },
  ): Promise<{ text: string | null; error?: string }> => {
    const check = await ctx.runQuery(internal.aiLeadResponse.checkMembership, {
      workspaceId,
    });
    if (!check.ok) throw new Error(check.error ?? "Unauthorized");
    return ctx.runAction(internal.aiLeadResponse.generatePreview, {
      workspaceId,
    });
  },
});

// ──────────────────────────────────────────────────────────────────────
// ANTHROPIC HELPER
// ──────────────────────────────────────────────────────────────────────

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

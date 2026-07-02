import { v } from "convex/values";
import {
  action,
  internalAction,
  internalQuery,
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { getUserId } from "./lib/identity";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptSecret } from "./lib/crypto";
import {
  pickChannel,
  isWithinQuietHours,
  buildPrompt,
  msSinceAmsterdamMidnight,
  msUntilAmsterdamHour,
  resolveAiNodeConfig,
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
    // "failed" telt NIET als dedup: een mislukte verzending (bv. Voidfix down)
    // mag binnen het venster opnieuw geprobeerd worden — anders blijft de lead
    // 24u zonder reactie hangen. Alleen "pending"/"sent" blokkeren een herhaling.
    return sug.some(
      (s) => s._creationTime >= since && s.status !== "dismissed" && s.status !== "failed",
    );
  },
});

/** Aantal AI-berichten met status "sent" sinds `since` (begin van vandaag) —
 * voor de dagcap-guardrail. Dit is een TOTAAL-plafond op AI-verzendingen per
 * dag (bewust conservatief: telt ook handmatig goedgekeurde suggesties mee).
 * De cap wordt alléén in auto-modus afgedwongen — anti-runaway. In suggest-modus
 * is er geen runaway-risico (mens keurt elk bericht goed), dus geen cap. */
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

/** Herbruikbare AI-reactie-orchestratie, aangeroepen door de workflow-engine
 *  (ai_respond-node). mode/kanaal/bookingUrl/goal komen uit de node-config;
 *  key/context/toon/model + guardrails (quiet-hours/dagcap) workspace-breed uit
 *  aiLeadResponseConfigs. Quiet-hours-defer (auto) her-schedulet zichzelf. */
export const runAiResponse = internalAction({
  args: {
    contactId: v.id("contacts"),
    workspaceId: v.id("workspaces"),
    nodeConfig: v.any(),
  },
  handler: async (
    ctx,
    { contactId, workspaceId, nodeConfig },
  ): Promise<{
    status: "suggested" | "sent" | "failed" | "deferred" | "skipped";
    reason?: string;
  }> => {
    const node = resolveAiNodeConfig(nodeConfig);
    const cfg = await ctx.runQuery(internal.aiAgentConfig.getConfigInternal, {
      workspaceId,
    });
    if (!cfg) return { status: "skipped", reason: "geen AI-instellingen" };
    if (!cfg.anthropicApiKeyEncrypted)
      return { status: "skipped", reason: "geen Anthropic-key" };

    const dup = await ctx.runQuery(internal.aiLeadResponse.recentlyResponded, {
      contactId,
      since: Date.now() - DAY_MS,
    });
    if (dup) return { status: "skipped", reason: "recent al gereageerd" };

    const lead = await ctx.runQuery(internal.aiLeadResponse.getLeadContext, {
      contactId,
    });
    if (!lead) return { status: "skipped", reason: "lead niet gevonden" };

    // Amsterdamse wandklok (Convex draait UTC → géén setHours).
    const amsParts = new Intl.DateTimeFormat("nl-NL", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
      timeZone: "Europe/Amsterdam",
    }).formatToParts(new Date());
    const amsPart = (t: string) =>
      Number(amsParts.find((p) => p.type === t)?.value ?? 0);
    const hour = amsPart("hour") % 24;
    const minute = amsPart("minute");
    const second = amsPart("second");
    const qStart = cfg.quietHoursStart ?? 21;
    const qEnd = cfg.quietHoursEnd ?? 8;

    if (node.mode === "auto" && isWithinQuietHours(hour, qStart, qEnd)) {
      await ctx.scheduler.runAt(
        Date.now() + msUntilAmsterdamHour(hour, minute, qEnd),
        internal.aiLeadResponse.runAiResponse,
        { contactId, workspaceId, nodeConfig },
      );
      return { status: "deferred", reason: "quiet hours" };
    }

    if (node.mode === "auto") {
      const startOfDay =
        Date.now() - msSinceAmsterdamMidnight(hour, minute, second);
      const sentToday = await ctx.runQuery(
        internal.aiLeadResponse.countAutoSentToday,
        { workspaceId, since: startOfDay },
      );
      const cap = cfg.dailyCap ?? 200;
      if (sentToday >= cap)
        return { status: "skipped", reason: `dagcap ${cap} bereikt` };
    }

    const channel: Channel | null = pickChannel(
      node.channelOrder,
      { phone: lead.phone, email: lead.email },
      node.whatsappTemplateName ?? null,
    );
    if (!channel)
      return { status: "skipped", reason: "geen kanaal beschikbaar" };

    const apiKey = await decryptSecret(cfg.anthropicApiKeyEncrypted);
    const { system, user } = buildPrompt({
      businessContext: cfg.businessContext,
      tone: cfg.tone,
      signature: cfg.signature,
      bookingUrl: node.bookingUrl,
      goal: node.goal,
      contact: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        city: lead.city,
      },
      formAnswers: lead.formAnswers,
    });

    const body = await callAnthropic(apiKey, cfg.model, system, user);
    if (!body) return { status: "skipped", reason: "geen AI-output" };

    if (node.mode === "auto") {
      try {
        await ctx.runAction(internal.messaging.sendInternal, {
          contactId,
          channel,
          body,
        });
        await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
          workspaceId,
          contactId,
          channel,
          body,
          model: cfg.model,
          status: "sent",
        });
        return { status: "sent" };
      } catch (sendErr) {
        console.error("[ai-node] sendInternal faalde:", sendErr);
        await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
          workspaceId,
          contactId,
          channel,
          body,
          model: cfg.model,
          status: "failed",
        });
        return { status: "failed", reason: "verzenden mislukt" };
      }
    }
    await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
      workspaceId,
      contactId,
      channel,
      body,
      model: cfg.model,
      status: "pending",
    });
    return { status: "suggested" };
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
    const userId = await getUserId(ctx);
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
// SUGGEST-MODUS: public query + interne helpers + send/dismiss
// ──────────────────────────────────────────────────────────────────────

/** Geeft de nieuwste pending suggestie terug voor een contact.
 *  Wordt gepollt door de lead-card via useQuery. */
export const pendingForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    // Membership-check (voorkomt cross-workspace lekken van AI-concepten).
    // Graceful null i.p.v. throw — dit is een per-card widget-query.
    const contact = await ctx.db.get(contactId);
    if (!contact) return null;
    const workspace = await ctx.db.get(contact.workspaceId);
    if (!workspace) return null;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) return null;
    return ctx.db
      .query("aiSuggestedResponses")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .order("desc")
      .first();
  },
});

/** Alle contact-IDs met een wachtend AI-concept (status "pending") in deze
 *  workspace. Voedt de "Concepten"-tab + sidebar-badge. Membership-checked;
 *  geeft graceful [] bij niet-ingelogd/geen lidmaatschap (mag de UI nooit
 *  laten crashen). NB: in de praktijk ⊆ incoming leads (concepten ontstaan
 *  bij lead-intake), dus de count matcht de zichtbare kaarten. */
export const pendingConceptContactIds = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) return [];
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) return [];
    const rows = await ctx.db
      .query("aiSuggestedResponses")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "pending"),
      )
      .collect();
    return [...new Set(rows.map((r) => r.contactId as string))];
  },
});

/** Interne helper — laadt een suggestie-record op ID. */
export const getSuggestionInternal = internalQuery({
  args: { suggestionId: v.id("aiSuggestedResponses") },
  handler: async (ctx, { suggestionId }) => ctx.db.get(suggestionId),
});

/** Interne helper — patchet de status van een suggestie. */
export const setSuggestionStatusInternal = internalMutation({
  args: {
    suggestionId: v.id("aiSuggestedResponses"),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("dismissed"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, { suggestionId, status }) =>
    ctx.db.patch(suggestionId, { status }),
});

/** Verstuurt een pending AI-suggestie via het opgeslagen kanaal.
 *  Zet status op "sent"; bij fout op "failed" + re-throw voor UI-toast. */
export const sendSuggestion = action({
  args: { suggestionId: v.id("aiSuggestedResponses") },
  handler: async (ctx, { suggestionId }) => {
    const suggestion = await ctx.runQuery(
      internal.aiLeadResponse.getSuggestionInternal,
      { suggestionId },
    );
    if (!suggestion) throw new Error("Suggestie niet gevonden");
    if (suggestion.status !== "pending")
      throw new Error(
        `Suggestie is al ${suggestion.status} — niet meer te versturen`,
      );

    // Membership-check via de bestaande internalQuery.
    const check = await ctx.runQuery(internal.aiLeadResponse.checkMembership, {
      workspaceId: suggestion.workspaceId,
    });
    if (!check.ok) throw new Error(check.error ?? "Unauthorized");

    try {
      await ctx.runAction(internal.messaging.sendInternal, {
        contactId: suggestion.contactId,
        channel: suggestion.channel,
        body: suggestion.body,
      });
      await ctx.runMutation(
        internal.aiLeadResponse.setSuggestionStatusInternal,
        { suggestionId, status: "sent" },
      );
    } catch (err) {
      await ctx.runMutation(
        internal.aiLeadResponse.setSuggestionStatusInternal,
        { suggestionId, status: "failed" },
      );
      throw err;
    }
  },
});

/** Verwerpt een pending AI-suggestie (slaat 'em over zonder te versturen). */
export const dismissSuggestion = mutation({
  args: { suggestionId: v.id("aiSuggestedResponses") },
  handler: async (ctx, { suggestionId }) => {
    const suggestion = await ctx.db.get(suggestionId);
    if (!suggestion) throw new Error("Suggestie niet gevonden");

    // Membership-check — hergebruik checkMembership-logica inline
    // (mutations kunnen geen runQuery aanroepen; guard inline uitvoeren).
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const workspace = await ctx.db.get(suggestion.workspaceId);
    if (!workspace) throw new Error("Workspace niet gevonden");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) throw new Error("Geen toegang tot deze workspace");

    await ctx.db.patch(suggestionId, { status: "dismissed" });
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

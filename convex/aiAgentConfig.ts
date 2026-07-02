import { v } from "convex/values";
import { getUserId } from "./lib/identity";
import {
  mutation,
  query,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { encryptSecret } from "./lib/crypto";

/**
 * AI Lead-Response Agent config CRUD.
 *
 * Per-workspace instellingen voor de automatische eerste reactie op nieuwe leads.
 * De Anthropic API-key wordt ALTIJD encrypted opgeslagen (encryptSecret); de
 * `get`-query geeft NOOIT de key-blob terug — alleen `hasApiKey: boolean`.
 */

// Gedeelde guard — zelfde patroon als crmSettings / pipelines / workflows.
async function requireWorkspaceMembership(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<void> {
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

export const DEFAULT_AI_CONFIG = {
  enabled: false,
  mode: "suggest" as const,
  channelOrder: ["sms", "email"] as Array<"whatsapp" | "sms" | "email">,
  bookingUrl: "https://afspraken.staycoolairco.nl/",
  model: "claude-sonnet-4-6",
  tone: "vriendelijk, professioneel, kort, Nederlands",
  signature: "Met vriendelijke groet, StayCool Airconditioning",
  quietHoursStart: 21,
  quietHoursEnd: 8,
  dailyCap: 200,
};

/** Haal de config op voor een workspace. Geeft NOOIT de encrypted key terug. */
export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await requireWorkspaceMembership(ctx, workspaceId);
    const row = await ctx.db
      .query("aiLeadResponseConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
    // Destructure de encrypted key eruit — nooit teruggeven aan de client.
    const { anthropicApiKeyEncrypted, ...rest } = row ?? {};
    return {
      ...DEFAULT_AI_CONFIG,
      ...rest,
      hasApiKey: Boolean(anthropicApiKeyEncrypted),
    };
  },
});

/** Upsert de AI-agent config. De `anthropicApiKey` (plaintext) wordt encrypted opgeslagen. */
export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    enabled: v.optional(v.boolean()),
    mode: v.optional(
      v.union(v.literal("off"), v.literal("suggest"), v.literal("auto")),
    ),
    channelOrder: v.optional(
      v.array(
        v.union(
          v.literal("whatsapp"),
          v.literal("sms"),
          v.literal("email"),
        ),
      ),
    ),
    bookingUrl: v.optional(v.string()),
    model: v.optional(v.string()),
    businessContext: v.optional(v.string()),
    tone: v.optional(v.string()),
    signature: v.optional(v.string()),
    whatsappTemplateName: v.optional(v.string()),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
    dailyCap: v.optional(v.number()),
    anthropicApiKey: v.optional(v.string()), // plaintext input → encrypted opgeslagen
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const {
      workspaceId,
      anthropicApiKey,
      enabled,
      mode,
      channelOrder,
      bookingUrl,
      model,
      businessContext,
      tone,
      signature,
      whatsappTemplateName,
      quietHoursStart,
      quietHoursEnd,
      dailyCap,
    } = args;

    // Bouw de patch op als typed object (geen `as never`-cast nodig).
    const patch: {
      enabled?: boolean;
      mode?: "off" | "suggest" | "auto";
      channelOrder?: Array<"whatsapp" | "sms" | "email">;
      bookingUrl?: string;
      model?: string;
      businessContext?: string;
      tone?: string;
      signature?: string;
      whatsappTemplateName?: string;
      quietHoursStart?: number;
      quietHoursEnd?: number;
      dailyCap?: number;
      anthropicApiKeyEncrypted?: string;
    } = {};

    if (enabled !== undefined) patch.enabled = enabled;
    if (mode !== undefined) patch.mode = mode;
    if (channelOrder !== undefined) patch.channelOrder = channelOrder;
    if (bookingUrl !== undefined) patch.bookingUrl = bookingUrl;
    if (model !== undefined) patch.model = model;
    if (businessContext !== undefined) patch.businessContext = businessContext;
    if (tone !== undefined) patch.tone = tone;
    if (signature !== undefined) patch.signature = signature;
    if (whatsappTemplateName !== undefined)
      patch.whatsappTemplateName = whatsappTemplateName;
    if (quietHoursStart !== undefined) patch.quietHoursStart = quietHoursStart;
    if (quietHoursEnd !== undefined) patch.quietHoursEnd = quietHoursEnd;
    if (dailyCap !== undefined) patch.dailyCap = dailyCap;

    // Sla de key ENKEL encrypted op — plaintext wordt nooit gepersisteerd.
    if (anthropicApiKey) {
      patch.anthropicApiKeyEncrypted = await encryptSecret(anthropicApiKey);
    }

    const existing = await ctx.db
      .query("aiLeadResponseConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("aiLeadResponseConfigs", {
        workspaceId,
        enabled: patch.enabled ?? DEFAULT_AI_CONFIG.enabled,
        mode: patch.mode ?? DEFAULT_AI_CONFIG.mode,
        channelOrder: patch.channelOrder ?? DEFAULT_AI_CONFIG.channelOrder,
        bookingUrl: patch.bookingUrl ?? DEFAULT_AI_CONFIG.bookingUrl,
        model: patch.model ?? DEFAULT_AI_CONFIG.model,
        ...patch,
      });
    }

    return { ok: true };
  },
});

/**
 * Interne query — geeft de volledige rij incl. `anthropicApiKeyEncrypted`
 * terug. Alleen aanroepen vanuit internalAction/internalMutation, nooit
 * blootstellen aan de client.
 */
export const getConfigInternal = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) =>
    ctx.db
      .query("aiLeadResponseConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique(),
});

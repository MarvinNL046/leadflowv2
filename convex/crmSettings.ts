import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * CRM workspace-settings (per-workspace configurable):
 *   - maxCallAttempts: 3-strike threshold (default 3)
 *   - defaultFollowUpDays: dagen tussen "Niet bereikt"-pogingen (default 2)
 *   - followUpReminderDays: dagen voor follow_up_due trigger (default 2)
 *
 * Get/Update via UI op /crm/settings. Backend (recordCallNoAnswer)
 * leest settings via getEffectiveSettings (fallback naar defaults).
 */

export const DEFAULT_SETTINGS = {
  maxCallAttempts: 3,
  defaultFollowUpDays: 2,
  followUpReminderDays: 2,
  timezone: "Europe/Amsterdam",
} as const;

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
 * Get settings for workspace. Returnt huidige waarden met defaults voor
 * ontbrekende velden. UI gebruikt voor display + form-pre-fill.
 */
export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const settings = await ctx.db
      .query("crmSettings")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .first();
    return {
      _id: settings?._id ?? null,
      maxCallAttempts:
        settings?.maxCallAttempts ?? DEFAULT_SETTINGS.maxCallAttempts,
      defaultFollowUpDays:
        settings?.defaultFollowUpDays ?? DEFAULT_SETTINGS.defaultFollowUpDays,
      followUpReminderDays:
        settings?.followUpReminderDays ??
        DEFAULT_SETTINGS.followUpReminderDays,
      timezone: settings?.timezone ?? DEFAULT_SETTINGS.timezone,
    };
  },
});

/**
 * Upsert settings — patcht bestaand of insert nieuw row.
 */
export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    maxCallAttempts: v.optional(v.number()),
    defaultFollowUpDays: v.optional(v.number()),
    followUpReminderDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    // Validatie: positief, redelijke bovengrenzen
    if (
      args.maxCallAttempts !== undefined &&
      (args.maxCallAttempts < 1 || args.maxCallAttempts > 20)
    ) {
      throw new Error("Max belpogingen moet tussen 1 en 20 zijn");
    }
    if (
      args.defaultFollowUpDays !== undefined &&
      (args.defaultFollowUpDays < 1 || args.defaultFollowUpDays > 60)
    ) {
      throw new Error("Follow-up dagen moet tussen 1 en 60 zijn");
    }
    if (
      args.followUpReminderDays !== undefined &&
      (args.followUpReminderDays < 1 || args.followUpReminderDays > 60)
    ) {
      throw new Error("Reminder dagen moet tussen 1 en 60 zijn");
    }

    const existing = await ctx.db
      .query("crmSettings")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .first();

    const patch: Record<string, unknown> = {};
    if (args.maxCallAttempts !== undefined)
      patch.maxCallAttempts = args.maxCallAttempts;
    if (args.defaultFollowUpDays !== undefined)
      patch.defaultFollowUpDays = args.defaultFollowUpDays;
    if (args.followUpReminderDays !== undefined)
      patch.followUpReminderDays = args.followUpReminderDays;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("crmSettings", {
        workspaceId: args.workspaceId,
        timezone: DEFAULT_SETTINGS.timezone,
        ...patch,
      });
    }
  },
});

/**
 * Effectieve settings ophalen vanuit een mutation-handler (interne
 * gebruik door recordCallNoAnswer). Geen auth-check want interne call.
 */
export async function getEffectiveSettings(
  ctx: { db: MutationCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<{
  maxCallAttempts: number;
  defaultFollowUpDays: number;
  followUpReminderDays: number;
}> {
  const settings = await ctx.db
    .query("crmSettings")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .first();
  return {
    maxCallAttempts:
      settings?.maxCallAttempts ?? DEFAULT_SETTINGS.maxCallAttempts,
    defaultFollowUpDays:
      settings?.defaultFollowUpDays ?? DEFAULT_SETTINGS.defaultFollowUpDays,
    followUpReminderDays:
      settings?.followUpReminderDays ?? DEFAULT_SETTINGS.followUpReminderDays,
  };
}

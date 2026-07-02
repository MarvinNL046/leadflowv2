import { v } from "convex/values";
import { getUserId } from "./lib/identity";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  DEFAULT_CALLBACK_PRESETS,
  validateCallbackPresets,
} from "./crmSettingsLogic";

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
  customerCallbackDays: 7,
  sendEmailOnUnreachable: false,
  dashboardWindowDays: 90,
  timezone: "Europe/Amsterdam",
} as const;

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

/** Org-naam van een workspace (fallback-default voor companyName). */
async function orgNameFor(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<string> {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) return "";
  const org = await ctx.db.get(workspace.orgId);
  return org?.name ?? "";
}

/**
 * Get settings for workspace. Returnt huidige waarden met defaults voor
 * ontbrekende velden. UI gebruikt voor display + form-pre-fill.
 */
export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const orgName = await orgNameFor(ctx, args.workspaceId);
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
      callbackPresets:
        settings?.callbackPresets && settings.callbackPresets.length > 0
          ? settings.callbackPresets
          : DEFAULT_CALLBACK_PRESETS,
      customerCallbackDays:
        settings?.customerCallbackDays ??
        DEFAULT_SETTINGS.customerCallbackDays,
      sendEmailOnUnreachable:
        settings?.sendEmailOnUnreachable ??
        DEFAULT_SETTINGS.sendEmailOnUnreachable,
      dashboardWindowDays:
        settings?.dashboardWindowDays ??
        DEFAULT_SETTINGS.dashboardWindowDays,
      companyName: settings?.companyName ?? orgName,
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
    callbackPresets: v.optional(
      v.array(v.object({ days: v.number(), label: v.string() })),
    ),
    customerCallbackDays: v.optional(v.number()),
    sendEmailOnUnreachable: v.optional(v.boolean()),
    dashboardWindowDays: v.optional(v.number()),
    companyName: v.optional(v.string()),
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
    if (args.callbackPresets !== undefined) {
      const err = validateCallbackPresets(args.callbackPresets);
      if (err) throw new Error(err);
    }
    if (
      args.customerCallbackDays !== undefined &&
      (args.customerCallbackDays < 1 || args.customerCallbackDays > 60)
    ) {
      throw new Error("Safety-net dagen moet tussen 1 en 60 zijn");
    }
    if (
      args.dashboardWindowDays !== undefined &&
      (args.dashboardWindowDays < 7 || args.dashboardWindowDays > 730)
    ) {
      throw new Error("Dashboard-venster moet tussen 7 en 730 dagen zijn");
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
    if (args.callbackPresets !== undefined)
      patch.callbackPresets = args.callbackPresets;
    if (args.customerCallbackDays !== undefined)
      patch.customerCallbackDays = args.customerCallbackDays;
    if (args.sendEmailOnUnreachable !== undefined)
      patch.sendEmailOnUnreachable = args.sendEmailOnUnreachable;
    if (args.dashboardWindowDays !== undefined)
      patch.dashboardWindowDays = args.dashboardWindowDays;
    // Leeg → wis (undefined) zodat get/getEffectiveSettings terugvalt op de
    // org-naam (?? werkt niet op een lege string).
    if (args.companyName !== undefined)
      patch.companyName = args.companyName.trim() || undefined;

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
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<{
  maxCallAttempts: number;
  defaultFollowUpDays: number;
  followUpReminderDays: number;
  customerCallbackDays: number;
  sendEmailOnUnreachable: boolean;
  dashboardWindowDays: number;
  companyName: string;
}> {
  const orgName = await orgNameFor(ctx, workspaceId);
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
    customerCallbackDays:
      settings?.customerCallbackDays ?? DEFAULT_SETTINGS.customerCallbackDays,
    sendEmailOnUnreachable:
      settings?.sendEmailOnUnreachable ??
      DEFAULT_SETTINGS.sendEmailOnUnreachable,
    dashboardWindowDays:
      settings?.dashboardWindowDays ?? DEFAULT_SETTINGS.dashboardWindowDays,
    companyName: settings?.companyName ?? orgName,
  };
}

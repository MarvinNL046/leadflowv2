import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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
 * Alle email-templates voor een workspace, gesorteerd op naam.
 * Voor de templates-beheer-UI in /crm/settings/templates.
 */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const rows = await ctx.db
      .query("emailTemplates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Eén template op naam (case-insensitive). Voor de Bel Nu-modal die
 * vooraf-ingevulde body wil tonen op basis van de v1-template-namen
 * ("Buiten Werkgebied", "Niet Bereikt", "Afscheidsmail (Deal Verloren)").
 */
export const getByName = query({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const rows = await ctx.db
      .query("emailTemplates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const lower = args.name.toLowerCase();
    return rows.find((r) => r.name.toLowerCase() === lower) ?? null;
  },
});

/** Update subject + body van een template. */
export const update = mutation({
  args: {
    templateId: v.id("emailTemplates"),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl) throw new Error("Template niet gevonden");
    await requireWorkspaceMembership(ctx, tpl.workspaceId);

    if (!args.subject.trim()) throw new Error("Onderwerp mag niet leeg zijn");
    if (!args.body.trim()) throw new Error("Body mag niet leeg zijn");

    await ctx.db.patch(args.templateId, {
      subject: args.subject,
      body: args.body,
    });
    return null;
  },
});

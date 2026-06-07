import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { slugifyKey, validateDefinition } from "./customFieldsLogic";

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
 * Definitions + bijbehorende waardes voor één contact, gesorteerd op
 * sortOrder. Returns [{ definition, value }, ...] zodat de UI ook
 * lege velden kan tonen ("—") in plaats van alleen ingevulde waardes.
 */
export const listForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return null;
    await requireWorkspaceMembership(ctx, contact.workspaceId);

    const defs = await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_workspace_entity", (q) =>
        q.eq("workspaceId", contact.workspaceId).eq("entityType", "contact"),
      )
      .collect();

    const values = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "contact").eq("entityId", args.contactId),
      )
      .collect();

    const valueByDef = new Map(values.map((v) => [v.definitionId, v.value]));

    return defs
      .filter((d) => d.isManual !== true)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({ definition: d, value: valueByDef.get(d._id) ?? null }));
  },
});

export const listManualDefinitions = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const defs = await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_workspace_entity", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("entityType", "contact"),
      )
      .collect();
    return defs
      .filter((d) => d.isManual === true)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const listManualForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return [];
    await requireWorkspaceMembership(ctx, contact.workspaceId);
    const defs = (
      await ctx.db
        .query("customFieldDefinitions")
        .withIndex("by_workspace_entity", (q) =>
          q.eq("workspaceId", contact.workspaceId).eq("entityType", "contact"),
        )
        .collect()
    ).filter((d) => d.isManual === true);
    const values = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "contact").eq("entityId", args.contactId),
      )
      .collect();
    const byDef = new Map(values.map((v) => [v.definitionId, v.value]));
    return defs
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({ definition: d, value: byDef.get(d._id) ?? null }));
  },
});

export const createDefinition = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    label: v.string(),
    fieldType: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("boolean"),
      v.literal("date"),
      v.literal("select"),
    ),
    selectOptions: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const err = validateDefinition({
      label: args.label,
      fieldType: args.fieldType,
      selectOptions: args.selectOptions,
    });
    if (err) throw new Error(err);
    const key = slugifyKey(args.label);
    if (!key) throw new Error("Ongeldige veldnaam");
    const existing = await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_workspace_entity", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("entityType", "contact"),
      )
      .collect();
    if (existing.some((d) => d.key === key)) {
      throw new Error("Een veld met deze naam bestaat al");
    }
    const maxOrder = existing.reduce((m, d) => Math.max(m, d.sortOrder), 0);
    await ctx.db.insert("customFieldDefinitions", {
      workspaceId: args.workspaceId,
      entityType: "contact",
      key,
      label: args.label.trim(),
      fieldType: args.fieldType,
      selectOptions:
        args.fieldType === "select" ? (args.selectOptions ?? []) : undefined,
      isRequired: args.isRequired ?? false,
      sortOrder: maxOrder + 1,
      isManual: true,
    });
    return null;
  },
});

export const updateDefinition = mutation({
  args: {
    definitionId: v.id("customFieldDefinitions"),
    label: v.optional(v.string()),
    selectOptions: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const def = await ctx.db.get(args.definitionId);
    if (!def) throw new Error("Veld niet gevonden");
    await requireWorkspaceMembership(ctx, def.workspaceId);
    const patch: Record<string, unknown> = {};
    if (args.label !== undefined) {
      const err = validateDefinition({
        label: args.label,
        fieldType: def.fieldType,
        selectOptions: args.selectOptions ?? def.selectOptions,
      });
      if (err) throw new Error(err);
      patch.label = args.label.trim();
    }
    if (args.selectOptions !== undefined && def.fieldType === "select") {
      const opts = args.selectOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 1) {
        throw new Error("Een keuzelijst heeft minstens 1 optie nodig");
      }
    }
    if (args.selectOptions !== undefined) patch.selectOptions = args.selectOptions;
    if (args.isRequired !== undefined) patch.isRequired = args.isRequired;
    await ctx.db.patch(args.definitionId, patch);
    return null;
  },
});

export const deleteDefinition = mutation({
  args: { definitionId: v.id("customFieldDefinitions") },
  handler: async (ctx, args) => {
    const def = await ctx.db.get(args.definitionId);
    if (!def) throw new Error("Veld niet gevonden");
    await requireWorkspaceMembership(ctx, def.workspaceId);
    const vals = await ctx.db
      .query("customFieldValues")
      .withIndex("by_definition", (q) =>
        q.eq("definitionId", args.definitionId),
      )
      .collect();
    for (const val of vals) await ctx.db.delete(val._id);
    await ctx.db.delete(args.definitionId);
    return null;
  },
});

export const setContactValue = mutation({
  args: {
    contactId: v.id("contacts"),
    definitionId: v.id("customFieldDefinitions"),
    value: v.any(),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact niet gevonden");
    await requireWorkspaceMembership(ctx, contact.workspaceId);
    const def = await ctx.db.get(args.definitionId);
    if (!def || def.workspaceId !== contact.workspaceId) {
      throw new Error("Veld niet gevonden");
    }
    const existing = await ctx.db
      .query("customFieldValues")
      .withIndex("by_definition", (q) =>
        q.eq("definitionId", args.definitionId),
      )
      .filter((q) => q.eq(q.field("entityId"), args.contactId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("customFieldValues", {
        definitionId: args.definitionId,
        entityType: "contact",
        entityId: args.contactId,
        value: args.value,
      });
    }
    return null;
  },
});

import { v } from "convex/values";
import { getUserId } from "./lib/identity";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Taken (follow-ups). Handmatig aan te maken op een contact, én via de
 * suite-API gevoed door cashflow's heractiveren-flow ("verlopen offerte
 * nabellen"). Zelfde membership-guards als notes.ts.
 */

async function requireMembershipForWorkspace(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<Id<"users">> {
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
  return userId;
}

async function requireMembershipForTask(
  ctx: QueryCtx | MutationCtx,
  taskId: Id<"tasks">,
) {
  const task = await ctx.db.get(taskId);
  if (!task) throw new Error("Task not found");
  await requireMembershipForWorkspace(ctx, task.workspaceId);
  return task;
}

/** Open taken van de workspace, vroegste vervaldatum eerst (zonder = achteraan). */
export const listOpen = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireMembershipForWorkspace(ctx, args.workspaceId);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "open"),
      )
      .take(300);
    const enriched = await Promise.all(
      tasks.map(async (task) => {
        const contact =
          task.contactId !== undefined
            ? await ctx.db.get(task.contactId)
            : null;
        return {
          ...task,
          contactName: contact
            ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
              contact.company ||
              contact.email ||
              "Contact"
            : null,
          contactPhone: contact?.phone ?? null,
        };
      }),
    );
    return enriched.sort(
      (a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity),
    );
  },
});

/** Aantal open taken (sidebar-badge). Begrensde telling (cap 300). */
export const countOpen = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireMembershipForWorkspace(ctx, args.workspaceId);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "open"),
      )
      .take(300);
    return tasks.length;
  },
});

/** Taken van één contact (open eerst, dan afgeronde — max 50). */
export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    await requireMembershipForWorkspace(ctx, contact.workspaceId);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .take(50);
    return tasks.sort((a, b) =>
      a.status === b.status
        ? (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)
        : a.status === "open"
          ? -1
          : 1,
    );
  },
});

export const create = mutation({
  args: {
    contactId: v.id("contacts"),
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    const userId = await requireMembershipForWorkspace(
      ctx,
      contact.workspaceId,
    );
    const title = args.title.trim();
    if (title.length === 0) throw new Error("Titel mag niet leeg zijn");
    return await ctx.db.insert("tasks", {
      workspaceId: contact.workspaceId,
      contactId: args.contactId,
      title,
      description: args.description?.trim() || undefined,
      dueDate: args.dueDate,
      status: "open",
      createdById: userId,
    });
  },
});

/** Afvinken / heropenen. */
export const setDone = mutation({
  args: { taskId: v.id("tasks"), done: v.boolean() },
  handler: async (ctx, args) => {
    await requireMembershipForTask(ctx, args.taskId);
    await ctx.db.patch(args.taskId, {
      status: args.done ? "done" : "open",
      doneAt: args.done ? Date.now() : undefined,
    });
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await requireMembershipForTask(ctx, args.taskId);
    await ctx.db.delete(args.taskId);
  },
});

/**
 * API-pad (suite, x-api-key via convex/http.ts): idempotent op `source` —
 * bestaat er in deze workspace al een taak met die source, dan wordt die
 * teruggegeven (heropend als hij nog niet was afgerond blijft hij open;
 * een afgeronde taak wordt NIET heropend — bewuste keuze: opnieuw
 * aanmaken na afronden betekent een nieuwe actie en mag een nieuwe taak
 * worden, dus dan maken we er wél een nieuwe).
 */
export const createFromApi = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.optional(v.id("contacts")),
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ taskId: Id<"tasks">; created: boolean }> => {
    if (args.source !== undefined) {
      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_workspace_source", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("source", args.source),
        )
        .filter((q) => q.eq(q.field("status"), "open"))
        .first();
      if (existing !== null) {
        return { taskId: existing._id, created: false };
      }
    }
    const taskId = await ctx.db.insert("tasks", {
      workspaceId: args.workspaceId,
      contactId: args.contactId,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      dueDate: args.dueDate,
      status: "open",
      source: args.source,
    });
    return { taskId, created: true };
  },
});

/**
 * API-pad: taak afronden op source (bv. "cashflow:quote:<id>") — de
 * heractiveren-flow vinkt de nabel-taak automatisch af zodra de offerte
 * opnieuw is aangeboden of afgeschreven. Idempotent: geen open taak met
 * die source is gewoon { completed: false }.
 */
export const completeBySource = internalMutation({
  args: { workspaceId: v.id("workspaces"), source: v.string() },
  handler: async (ctx, args): Promise<{ completed: boolean }> => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_workspace_source", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("source", args.source),
      )
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();
    if (task === null) return { completed: false };
    await ctx.db.patch(task._id, { status: "done", doneAt: Date.now() });
    return { completed: true };
  },
});

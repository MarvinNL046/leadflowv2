import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  contactMatchesRules,
  isMailable,
  dedupeByEmail,
  type MatchableContact,
  type SegmentRules,
} from "./segmentsLogic";

const rulesValidator = v.object({
  match: v.union(v.literal("all"), v.literal("any")),
  conditions: v.array(v.object({ field: v.string(), op: v.string(), value: v.any() })),
});

async function requireWorkspace(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", workspace.orgId))
    .first();
  if (!membership) throw new Error("Not a member of this workspace");
}

/** Bouw het MatchableContact-object: vlak de joins af die een segment nodig
 *  heeft (laatste opportunity-stage + attributie-bron + custom fields). */
async function toMatchable(
  ctx: QueryCtx,
  contact: Doc<"contacts">,
): Promise<MatchableContact> {
  const lastOpp = await ctx.db
    .query("opportunities")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .order("desc")
    .first();
  const attribution = await ctx.db
    .query("leadAttribution")
    .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
    .first();
  const customRows = await ctx.db
    .query("customFieldValues")
    .withIndex("by_entity", (q) =>
      q.eq("entityType", "contact").eq("entityId", String(contact._id)),
    )
    .collect();
  const custom: Record<string, unknown> = {};
  for (const row of customRows) {
    const def = await ctx.db.get(row.definitionId);
    if (def) custom[def.key] = row.value;
  }
  return {
    emailMarketingStatus: contact.emailMarketingStatus,
    email: contact.email,
    tags: contact.tags ?? [],
    city: contact.city,
    province: contact.province,
    callCount: contact.callCount,
    createdAt: contact._creationTime,
    stageId: lastOpp?.stageId,
    source: attribution?.source,
    custom,
  };
}

/** Gedeelde resolver: alle contacten in workspace → filter rules + mailbaar +
 *  dedupe. Geeft lichtgewicht recipient-rijen terug. */
async function resolve(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  rules: SegmentRules,
): Promise<Array<{ contactId: Id<"contacts">; email: string; firstName?: string; lastName?: string }>> {
  const contacts = await ctx.db
    .query("contacts")
    .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  const out: Array<{ contactId: Id<"contacts">; email: string; firstName?: string; lastName?: string }> = [];
  for (const c of contacts) {
    if (c.deletedAt) continue;
    if (!isMailable({ emailMarketingStatus: c.emailMarketingStatus, email: c.email })) continue;
    const matchable = await toMatchable(ctx, c);
    if (!contactMatchesRules(matchable, rules)) continue;
    out.push({ contactId: c._id, email: c.email as string, firstName: c.firstName, lastName: c.lastName });
  }
  return dedupeByEmail(out);
}

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db
      .query("segments")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
    rules: rulesValidator,
  },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db.insert("segments", {
      workspaceId: args.workspaceId,
      name: args.name,
      description: args.description,
      rules: args.rules,
    });
  },
});

export const update = mutation({
  args: {
    segmentId: v.id("segments"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    rules: v.optional(rulesValidator),
  },
  handler: async (ctx, args) => {
    const seg = await ctx.db.get(args.segmentId);
    if (!seg) throw new Error("Segment not found");
    await requireWorkspace(ctx, seg.workspaceId);
    await ctx.db.patch(args.segmentId, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.rules !== undefined ? { rules: args.rules } : {}),
    });
  },
});

export const remove = mutation({
  args: { segmentId: v.id("segments") },
  handler: async (ctx, args) => {
    const seg = await ctx.db.get(args.segmentId);
    if (!seg) throw new Error("Segment not found");
    await requireWorkspace(ctx, seg.workspaceId);
    await ctx.db.delete(args.segmentId);
  },
});

/** Live preview voor de builder: aantal + steekproef (max 10 namen/emails).
 *  Draait de regels zónder ze op te slaan. */
export const preview = query({
  args: { workspaceId: v.id("workspaces"), rules: rulesValidator },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    const rows = await resolve(ctx, args.workspaceId, args.rules);
    return {
      count: rows.length,
      sample: rows.slice(0, 10).map((r) => ({
        email: r.email,
        name: [r.firstName, r.lastName].filter(Boolean).join(" "),
      })),
    };
  },
});

/** Internal: ontvangers voor een opgeslagen segment (broadcast-pipeline). */
export const resolveRecipients = internalQuery({
  args: { segmentId: v.id("segments") },
  handler: async (ctx, args) => {
    const seg = await ctx.db.get(args.segmentId);
    if (!seg) return [];
    return await resolve(ctx, seg.workspaceId, seg.rules);
  },
});

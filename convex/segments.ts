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

/** Bepaal welke joins een rule-set echt nodig heeft — voorkomt onnodige reads. */
function neededJoins(rules: SegmentRules) {
  let stage = false, source = false, custom = false;
  for (const c of rules.conditions) {
    if (c.field === "stage") stage = true;
    else if (c.field === "source") source = true;
    else if (c.field.startsWith("custom:")) custom = true;
  }
  return { stage, source, custom };
}

type Joins = ReturnType<typeof neededJoins>;

/** Bouw het MatchableContact-object: vlak de joins af die een segment nodig
 *  heeft (laatste opportunity-stage + attributie-bron + custom fields).
 *  Sla joins over die de rules niet gebruiken om reads te beperken. */
async function toMatchable(
  ctx: QueryCtx,
  contact: Doc<"contacts">,
  joins?: Joins,
): Promise<MatchableContact> {
  const needStage = joins == null || joins.stage;
  const needSource = joins == null || joins.source;
  const needCustom = joins == null || joins.custom;

  const lastOpp = needStage
    ? await ctx.db
        .query("opportunities")
        .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
        .order("desc")
        .first()
    : null;

  const attribution = needSource
    ? await ctx.db
        .query("leadAttribution")
        .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
        .first()
    : null;

  const custom: Record<string, unknown> = {};
  if (needCustom) {
    const customRows = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "contact").eq("entityId", String(contact._id)),
      )
      .collect();
    for (const row of customRows) {
      const def = await ctx.db.get(row.definitionId);
      if (def) custom[def.key] = row.value;
    }
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
 *  Draait de regels zónder ze op te slaan. Gescand tot een cap om reads
 *  onder de Convex-limiet (4096) te houden; capped=true als de scan de cap
 *  raakte (werkelijk aantal kan hoger zijn). */
export const preview = query({
  args: { workspaceId: v.id("workspaces"), rules: rulesValidator },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    const joins = neededJoins(args.rules);
    // Worst-case reads per contact: met custom-joins tot ~10; zonder <3.
    const scanCap = joins.custom ? 300 : (joins.stage || joins.source) ? 800 : 2500;
    // Fix 5: gebruik paginate() i.p.v. take() zodat isDone betrouwbaar aangeeft
    // of de scan de cap raakte. take(N) geeft altijd exact N rijen terug als
    // er ≥ N zijn, waardoor capped altijd true is voor grote workspaces.
    const page = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", args.workspaceId))
      .paginate({ cursor: null, numItems: scanCap });
    let count = 0;
    const sample: Array<{ email: string; name: string }> = [];
    for (const c of page.page) {
      if (c.deletedAt) continue;
      if (!isMailable({ emailMarketingStatus: c.emailMarketingStatus, email: c.email })) continue;
      const m = await toMatchable(ctx, c, joins);
      if (!contactMatchesRules(m, args.rules)) continue;
      count++;
      if (sample.length < 10) {
        sample.push({
          email: c.email as string,
          name: [c.firstName, c.lastName].filter(Boolean).join(" "),
        });
      }
    }
    return { count, sample, capped: !page.isDone };
  },
});

/** Internal: gepagineerde resolver voor broadcast-pipeline.
 *  Geeft één pagina ontvangers terug; roep herhaald aan totdat isDone=true. */
export const resolvePage = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    rules: rulesValidator,
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const joins = neededJoins(args.rules);
    const page = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", args.workspaceId))
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    const recipients: Array<{
      contactId: Id<"contacts">;
      email: string;
      firstName?: string;
      lastName?: string;
    }> = [];
    for (const c of page.page) {
      if (c.deletedAt) continue;
      if (!isMailable({ emailMarketingStatus: c.emailMarketingStatus, email: c.email })) continue;
      const m = await toMatchable(ctx, c, joins);
      if (!contactMatchesRules(m, args.rules)) continue;
      recipients.push({
        contactId: c._id,
        email: c.email as string,
        firstName: c.firstName,
        lastName: c.lastName,
      });
    }
    return { recipients, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

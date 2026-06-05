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
 * Workflow dashboard-queries — public, met workspace-membership-guard.
 * Geen mutaties yet (visual builder komt later, workflows worden via
 * seed-script of migration.ts-mutations aangemaakt).
 */

async function requireWorkspaceMembership(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<Id<"users">> {
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
  return userId;
}

/**
 * Workflows-overview voor dashboard. Returnt per workflow:
 *  - meta (naam, status, beschrijving, counts)
 *  - recent 10 executions met contact-naam join
 *
 * 1 query voor de hele lijst — keeps roundtrips laag.
 */
export const listForDashboard = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(50);

    const enriched = await Promise.all(
      workflows.map(async (wf) => {
        const executions = await ctx.db
          .query("workflowExecutions")
          .withIndex("by_workflow", (q) => q.eq("workflowId", wf._id))
          .order("desc")
          .take(10);

        const execsWithContact = await Promise.all(
          executions.map(async (e) => {
            let contactName = "Onbekend";
            if (e.entityType === "contact") {
              const c = await ctx.db.get(e.entityId as Id<"contacts">);
              if (c) {
                contactName =
                  [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                  c.email ||
                  c.phone ||
                  "Onbekend";
              }
            }
            return {
              _id: e._id,
              _creationTime: e._creationTime,
              status: e.status,
              currentNodeId: e.currentNodeId,
              startedAt: e.startedAt,
              completedAt: e.completedAt,
              pausedUntil: e.pausedUntil,
              entityType: e.entityType,
              entityId: e.entityId,
              contactName,
            };
          }),
        );

        return {
          _id: wf._id,
          name: wf.name,
          description: wf.description,
          status: wf.status,
          totalExecutions: wf.totalExecutions,
          successfulExecutions: wf.successfulExecutions,
          failedExecutions: wf.failedExecutions,
          lastExecutedAt: wf.lastExecutedAt,
          triggerTypes: wf.triggerConfig.map((t) => t.type),
          recentExecutions: execsWithContact,
        };
      }),
    );

    return enriched;
  },
});

/**
 * Per-execution detail voor /crm/workflows/$id. Returnt workflow-meta,
 * execution-state, alle nodes (voor naam-lookup), en logs in volgorde
 * van aanmaken (oldest first = timeline-bottom-up).
 */
export const getExecutionDetail = query({
  args: { executionId: v.id("workflowExecutions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) return null;

    const workflow = await ctx.db.get(execution.workflowId);
    if (!workflow) return null;
    await requireWorkspaceMembership(ctx, workflow.workspaceId);

    const nodes = await ctx.db
      .query("workflowNodes")
      .withIndex("by_workflow", (q) => q.eq("workflowId", workflow._id))
      .collect();
    const nodeByNodeId = new Map(nodes.map((n) => [n.nodeId, n]));

    const logs = await ctx.db
      .query("workflowExecutionLogs")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .collect();
    // Logs in chronologische volgorde (creation-time ascending)
    logs.sort((a, b) => a._creationTime - b._creationTime);

    const enrichedLogs = logs.map((l) => {
      const n = nodeByNodeId.get(l.nodeId);
      return {
        _id: l._id,
        _creationTime: l._creationTime,
        nodeId: l.nodeId,
        nodeType: l.nodeType,
        nodeLabel: n?.label ?? l.nodeId,
        nodeSubType: n?.subType,
        status: l.status,
        output: l.output,
        error: l.error,
        durationMs: l.durationMs,
      };
    });

    let contactName: string | null = null;
    if (execution.entityType === "contact") {
      const c = await ctx.db.get(execution.entityId as Id<"contacts">);
      if (c) {
        contactName =
          [c.firstName, c.lastName].filter(Boolean).join(" ") ||
          c.email ||
          c.phone ||
          null;
      }
    }

    return {
      workflow: {
        _id: workflow._id,
        name: workflow.name,
        description: workflow.description,
      },
      execution: {
        _id: execution._id,
        _creationTime: execution._creationTime,
        status: execution.status,
        currentNodeId: execution.currentNodeId,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        pausedUntil: execution.pausedUntil,
        entityType: execution.entityType,
        entityId: execution.entityId,
        contactName,
      },
      logs: enrichedLogs,
    };
  },
});

/**
 * DEBUG — logs per execution voor verifieren wat per node lukte/faalde.
 * Public temporary; vervangen door per-execution detail-route later.
 */
export const debugExecutionLogs = query({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const wf = await ctx.db.get(args.workflowId);
    if (!wf) return null;
    await requireWorkspaceMembership(ctx, wf.workspaceId);

    const executions = await ctx.db
      .query("workflowExecutions")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .order("desc")
      .take(5);

    return await Promise.all(
      executions.map(async (e) => {
        const logs = await ctx.db
          .query("workflowExecutionLogs")
          .withIndex("by_execution", (q) => q.eq("executionId", e._id))
          .collect();
        return {
          executionId: e._id,
          status: e.status,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          logs: logs.map((l) => ({
            nodeId: l.nodeId,
            nodeType: l.nodeType,
            status: l.status,
            error: l.error,
            output: l.output,
            durationMs: l.durationMs,
          })),
        };
      }),
    );
  },
});

/**
 * Detail van één workflow + recent executions + per-execution logs.
 * Voor toekomstige workflow-detail-page.
 */
export const getDetail = query({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const wf = await ctx.db.get(args.workflowId);
    if (!wf) return null;
    await requireWorkspaceMembership(ctx, wf.workspaceId);

    const nodes = await ctx.db
      .query("workflowNodes")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();
    const edges = await ctx.db
      .query("workflowEdges")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();

    return { workflow: wf, nodes, edges };
  },
});

// ──────────────────────────────────────────────────────────────────────
// BUILDER MUTATIONS
// ──────────────────────────────────────────────────────────────────────

/**
 * Validator voor één builder-node. Lineaire ketting: trigger gevolgd
 * door N actie/delay nodes. Edges worden automatisch sequentieel
 * aangemaakt op basis van array-volgorde.
 */
const linearNodeValidator = v.union(
  v.object({
    type: v.literal("delay"),
    delaySeconds: v.number(),
  }),
  v.object({
    type: v.literal("action"),
    subType: v.literal("send_email"),
    subject: v.string(),
    body: v.string(),
  }),
  v.object({
    type: v.literal("action"),
    subType: v.literal("send_sms"),
    body: v.string(),
  }),
  v.object({
    type: v.literal("action"),
    subType: v.literal("send_whatsapp"),
    body: v.string(),
  }),
  v.object({
    type: v.literal("action"),
    subType: v.literal("ai_respond"),
    mode: v.union(v.literal("suggest"), v.literal("auto")),
    channelOrder: v.array(
      v.union(v.literal("whatsapp"), v.literal("sms"), v.literal("email")),
    ),
    bookingUrl: v.string(),
    whatsappTemplateName: v.optional(v.string()),
    goal: v.optional(v.string()),
  }),
);

const triggerTypeValidator = v.union(
  v.literal("contact_created"),
  v.literal("opportunity_won"),
  v.literal("opportunity_lost"),
  v.literal("lead_unreachable"),
  v.literal("follow_up_due"),
);

/**
 * Maakt een nieuwe lineaire workflow met trigger + sequentiële nodes.
 * Voor non-lineair (parallel branches): hardcoded seed (Snelle Response)
 * of toekomstige visual builder.
 */
export const createLinear = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
    triggerType: triggerTypeValidator,
    nodes: v.array(linearNodeValidator),
    activate: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const name = args.name.trim();
    if (name.length === 0) throw new Error("Naam mag niet leeg zijn");
    if (args.nodes.length === 0) {
      throw new Error("Voeg minstens één node toe");
    }

    const workflowId = await ctx.db.insert("workflows", {
      workspaceId: args.workspaceId,
      name,
      description: args.description?.trim() || undefined,
      status: args.activate ? "active" : "draft",
      triggerConfig: [
        { type: args.triggerType, nodeId: "trigger-1" },
      ],
      version: 1,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
    });

    // Trigger-node
    await ctx.db.insert("workflowNodes", {
      workflowId,
      nodeId: "trigger-1",
      type: "trigger",
      subType: args.triggerType,
      positionX: 0,
      positionY: 0,
      config: {},
      label: "Nieuw contact",
    });

    // Action/delay nodes + edges sequentieel
    let prevNodeId = "trigger-1";
    for (let i = 0; i < args.nodes.length; i++) {
      const n = args.nodes[i];
      const nodeId = `node-${i + 1}`;
      let label = nodeId;
      let config: Record<string, unknown> = {};

      if (n.type === "delay") {
        label = `Wacht ${n.delaySeconds}s`;
        config = { delaySeconds: n.delaySeconds };
      } else if (n.subType === "send_email") {
        label = "Email";
        config = { subject: n.subject, body: n.body };
      } else if (n.subType === "send_sms") {
        label = "SMS";
        config = { body: n.body };
      } else if (n.subType === "send_whatsapp") {
        label = "WhatsApp";
        config = { body: n.body };
      } else if (n.subType === "ai_respond") {
        label = "AI-reactie";
        config = {
          mode: n.mode,
          channelOrder: n.channelOrder,
          bookingUrl: n.bookingUrl,
          whatsappTemplateName: n.whatsappTemplateName,
          goal: n.goal,
        };
      }

      await ctx.db.insert("workflowNodes", {
        workflowId,
        nodeId,
        type: n.type,
        subType: n.type === "action" ? n.subType : undefined,
        positionX: 200 * (i + 1),
        positionY: 0,
        config,
        label,
      });

      await ctx.db.insert("workflowEdges", {
        workflowId,
        sourceNodeId: prevNodeId,
        targetNodeId: nodeId,
      });

      prevNodeId = nodeId;
    }

    return { workflowId };
  },
});

/**
 * Replace content van bestaande workflow: name + description +
 * triggerType + nodes/edges. Behoud workflow-row + executions-historie
 * + counters. CAVEAT: lopende executions pauseren op specifieke nodeId;
 * bij replace verdwijnen die nodes → executions blijven hangen of
 * falen bij volgende dispatch. Voor MVP accepteren we dit. Productie-
 * fix later: versioning (workflow-rows blijven gekoppeld aan version).
 */
export const replaceContent = mutation({
  args: {
    workflowId: v.id("workflows"),
    name: v.string(),
    description: v.optional(v.string()),
    triggerType: triggerTypeValidator,
    nodes: v.array(linearNodeValidator),
  },
  handler: async (ctx, args) => {
    const wf = await ctx.db.get(args.workflowId);
    if (!wf) throw new Error("Workflow niet gevonden");
    await requireWorkspaceMembership(ctx, wf.workspaceId);

    const name = args.name.trim();
    if (name.length === 0) throw new Error("Naam mag niet leeg zijn");
    if (args.nodes.length === 0) {
      throw new Error("Voeg minstens één node toe");
    }

    // Delete bestaande nodes + edges
    const oldNodes = await ctx.db
      .query("workflowNodes")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();
    for (const n of oldNodes) {
      await ctx.db.delete(n._id);
    }
    const oldEdges = await ctx.db
      .query("workflowEdges")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();
    for (const e of oldEdges) {
      await ctx.db.delete(e._id);
    }

    // Update workflow meta
    await ctx.db.patch(args.workflowId, {
      name,
      description: args.description?.trim() || undefined,
      triggerConfig: [{ type: args.triggerType, nodeId: "trigger-1" }],
      version: wf.version + 1,
    });

    // Insert nieuwe trigger-node
    await ctx.db.insert("workflowNodes", {
      workflowId: args.workflowId,
      nodeId: "trigger-1",
      type: "trigger",
      subType: args.triggerType,
      positionX: 0,
      positionY: 0,
      config: {},
      label:
        args.triggerType === "contact_created"
          ? "Nieuw contact"
          : args.triggerType === "opportunity_won"
            ? "Opportunity gewonnen"
            : "Opportunity verloren",
    });

    let prevNodeId = "trigger-1";
    for (let i = 0; i < args.nodes.length; i++) {
      const n = args.nodes[i];
      const nodeId = `node-${i + 1}`;
      let label = nodeId;
      let config: Record<string, unknown> = {};

      if (n.type === "delay") {
        label = `Wacht ${n.delaySeconds}s`;
        config = { delaySeconds: n.delaySeconds };
      } else if (n.subType === "send_email") {
        label = "Email";
        config = { subject: n.subject, body: n.body };
      } else if (n.subType === "send_sms") {
        label = "SMS";
        config = { body: n.body };
      } else if (n.subType === "send_whatsapp") {
        label = "WhatsApp";
        config = { body: n.body };
      } else if (n.subType === "ai_respond") {
        label = "AI-reactie";
        config = {
          mode: n.mode,
          channelOrder: n.channelOrder,
          bookingUrl: n.bookingUrl,
          whatsappTemplateName: n.whatsappTemplateName,
          goal: n.goal,
        };
      }

      await ctx.db.insert("workflowNodes", {
        workflowId: args.workflowId,
        nodeId,
        type: n.type,
        subType: n.type === "action" ? n.subType : undefined,
        positionX: 200 * (i + 1),
        positionY: 0,
        config,
        label,
      });

      await ctx.db.insert("workflowEdges", {
        workflowId: args.workflowId,
        sourceNodeId: prevNodeId,
        targetNodeId: nodeId,
      });

      prevNodeId = nodeId;
    }

    return { workflowId: args.workflowId };
  },
});

/**
 * Permanent delete van een workflow + alle nodes/edges. BEHOUDT
 * executions+logs voor audit-trail (FK naar workflowId blijft, maar
 * workflow-row is weg — getDetail returnt null voor die executions).
 *
 * Geen status-guard: confirm-dialog op UI is voldoende safety.
 */
export const permanentDelete = mutation({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const wf = await ctx.db.get(args.workflowId);
    if (!wf) throw new Error("Workflow niet gevonden");
    await requireWorkspaceMembership(ctx, wf.workspaceId);
    const nodes = await ctx.db
      .query("workflowNodes")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();
    for (const n of nodes) await ctx.db.delete(n._id);
    const edges = await ctx.db
      .query("workflowEdges")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();
    for (const e of edges) await ctx.db.delete(e._id);
    await ctx.db.delete(args.workflowId);
  },
});

/**
 * Status togglen: draft → active → paused → archived. Engine respecteert
 * status=active filter bij trigger-matching.
 */
export const setStatus = mutation({
  args: {
    workflowId: v.id("workflows"),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
  },
  handler: async (ctx, args) => {
    const wf = await ctx.db.get(args.workflowId);
    if (!wf) throw new Error("Workflow niet gevonden");
    await requireWorkspaceMembership(ctx, wf.workspaceId);
    await ctx.db.patch(args.workflowId, { status: args.status });
  },
});

/** Maakt kant-en-klaar een "AI eerste reactie op nieuwe lead"-workflow:
 *  trigger contact_created → AI-reactie-node (suggest). Eén klik vanuit
 *  AI-instellingen, zodat je niet from-scratch hoeft te bouwen. */
export const createAiFirstResponseWorkflow = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await requireWorkspaceMembership(ctx, workspaceId);
    const workflowId = await ctx.db.insert("workflows", {
      workspaceId,
      name: "AI eerste reactie op nieuwe lead",
      description:
        "Genereert automatisch een concept-antwoord bij elke nieuwe lead.",
      status: "active",
      triggerConfig: [{ type: "contact_created", nodeId: "trigger-1" }],
      version: 1,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
    });
    await ctx.db.insert("workflowNodes", {
      workflowId,
      nodeId: "trigger-1",
      type: "trigger",
      subType: "contact_created",
      positionX: 0,
      positionY: 0,
      config: {},
      label: "Nieuwe lead",
    });
    await ctx.db.insert("workflowNodes", {
      workflowId,
      nodeId: "node-1",
      type: "action",
      subType: "ai_respond",
      positionX: 200,
      positionY: 0,
      config: {
        mode: "suggest",
        channelOrder: ["sms", "email"],
        bookingUrl: "https://afspraken.staycoolairco.nl/",
      },
      label: "AI-reactie",
    });
    await ctx.db.insert("workflowEdges", {
      workflowId,
      sourceNodeId: "trigger-1",
      targetNodeId: "node-1",
    });
    return { workflowId };
  },
});

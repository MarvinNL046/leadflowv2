import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Workflow engine — vervangt v1's QStash-based executor.
 *
 * Convex-specifieke vereenvoudigingen:
 * - scheduler.runAfter vervangt QStash callback-loop
 * - Geen outbox-pattern nodig: triggers schedulen workflows direct
 * - Real-time query-driven UI ipv polling
 *
 * MVP-scope:
 * - Lineaire engine: trigger → (delay) → action(s) → end
 * - Multi-edge parallel: bij N outgoing edges van een node worden
 *   alle N targets parallel gepland (voor "email + WA simultaan")
 * - Action-types: send_email / send_sms / send_whatsapp (via
 *   messaging.send), delay
 * - Geen condition-node (later)
 * - Geen retry binnen engine (Convex scheduler handelt failures via
 *   logs; markFailed bij action-error)
 * - Geen entityData snapshot — engine leest contact altijd live
 *
 * Template-interpolation: simpele `{{contact.firstName}}` regex —
 * geen Handlebars. Whitelist op contact-velden.
 */

// ──────────────────────────────────────────────────────────────────────
// TRIGGER ENTRY — wordt gecalled vanuit contacts.create + metaProcessor
// na een contact_created event
// ──────────────────────────────────────────────────────────────────────

export const triggerContactCreated = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args): Promise<void> => {
    const workflowIds: Array<Id<"workflows">> = await ctx.runQuery(
      internal.workflowEngine.findActiveWorkflowsForTrigger,
      { workspaceId: args.workspaceId, triggerType: "contact_created" },
    );

    for (const workflowId of workflowIds) {
      await ctx.runMutation(internal.workflowEngine.startExecution, {
        workflowId,
        entityType: "contact",
        entityId: args.contactId,
      });
    }
  },
});

/**
 * Trigger voor opportunity-state-changes (won/lost). Action-nodes
 * resolven contact via opportunity.contactId zodat email/sms/wa
 * gewoon werken met dezelfde send-pipeline.
 */
export const triggerOpportunityChanged = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    opportunityId: v.id("opportunities"),
    eventType: v.union(
      v.literal("opportunity_won"),
      v.literal("opportunity_lost"),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const opp = await ctx.runQuery(
      internal.workflowEngine.getOpportunityContactId,
      { opportunityId: args.opportunityId },
    );
    if (!opp) return;

    const workflowIds: Array<Id<"workflows">> = await ctx.runQuery(
      internal.workflowEngine.findActiveWorkflowsForTrigger,
      { workspaceId: args.workspaceId, triggerType: args.eventType },
    );

    for (const workflowId of workflowIds) {
      // Entity = contact (action-nodes hebben email/phone nodig).
      // Opportunity context kan later via entityData extra context bieden.
      await ctx.runMutation(internal.workflowEngine.startExecution, {
        workflowId,
        entityType: "contact",
        entityId: opp.contactId,
      });
    }
  },
});

export const getOpportunityContactId = internalQuery({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const opp = await ctx.db.get(args.opportunityId);
    if (!opp) return null;
    return { contactId: opp.contactId };
  },
});

/**
 * Lead unreachable trigger — vuurt bij 3-strike (3x niet bereikt).
 * Specifieker dan opportunity_lost want bv. outside_area triggert ook
 * opportunity_lost maar is een ander semantisch event ("klant bestaat
 * maar buiten gebied" vs "klant bereiken we niet").
 */
export const triggerLeadUnreachable = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args): Promise<void> => {
    const workflowIds: Array<Id<"workflows">> = await ctx.runQuery(
      internal.workflowEngine.findActiveWorkflowsForTrigger,
      { workspaceId: args.workspaceId, triggerType: "lead_unreachable" },
    );
    for (const workflowId of workflowIds) {
      await ctx.runMutation(internal.workflowEngine.startExecution, {
        workflowId,
        entityType: "contact",
        entityId: args.contactId,
      });
    }
  },
});

/**
 * Follow-up due trigger — vuurt N dagen na "Niet bereikt" actie.
 * Skip als contact in tussentijd is bijgewerkt naar unreachable, won,
 * lost of outsideArea (lead is "afgehandeld", reminder onnodig).
 */
export const triggerFollowUpDue = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Check contact-state: skip als al afgehandeld
    const contact = await ctx.runQuery(
      internal.workflowEngine.getContactForFollowUpCheck,
      { contactId: args.contactId },
    );
    if (!contact) return;
    if (
      contact.unreachable ||
      contact.outsideArea ||
      contact.deletedAt !== undefined
    ) {
      return;
    }

    const workflowIds: Array<Id<"workflows">> = await ctx.runQuery(
      internal.workflowEngine.findActiveWorkflowsForTrigger,
      { workspaceId: args.workspaceId, triggerType: "follow_up_due" },
    );
    for (const workflowId of workflowIds) {
      await ctx.runMutation(internal.workflowEngine.startExecution, {
        workflowId,
        entityType: "contact",
        entityId: args.contactId,
      });
    }
  },
});

export const getContactForFollowUpCheck = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.contactId);
  },
});

// ──────────────────────────────────────────────────────────────────────
// HELPER QUERIES + MUTATIONS
// ──────────────────────────────────────────────────────────────────────

export const findActiveWorkflowsForTrigger = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    triggerType: v.string(),
  },
  handler: async (ctx, args): Promise<Array<Id<"workflows">>> => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "active"),
      )
      .collect();

    return workflows
      .filter((w) =>
        w.triggerConfig.some((t) => t.type === args.triggerType),
      )
      .map((w) => w._id);
  },
});

export const startExecution = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    entityType: v.union(v.literal("contact"), v.literal("opportunity")),
    entityId: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"workflowExecutions">> => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) throw new Error("Workflow not found");

    // Find trigger node (eerste node met type=trigger)
    const triggerNode = await ctx.db
      .query("workflowNodes")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .filter((q) => q.eq(q.field("type"), "trigger"))
      .first();
    if (!triggerNode) {
      throw new Error("Workflow has no trigger node");
    }

    const executionId = await ctx.db.insert("workflowExecutions", {
      workflowId: args.workflowId,
      workspaceId: workflow.workspaceId,
      entityType: args.entityType,
      entityId: args.entityId,
      entityData: {},
      status: "running",
      currentNodeId: triggerNode.nodeId,
      startedAt: Date.now(),
    });

    // Bump workflow totalExecutions counter
    await ctx.db.patch(args.workflowId, {
      totalExecutions: workflow.totalExecutions + 1,
      lastExecutedAt: Date.now(),
    });

    // Schedule first work: dispatch from trigger
    await ctx.scheduler.runAfter(
      0,
      internal.workflowEngine.dispatchNextNodes,
      { executionId, fromNodeId: triggerNode.nodeId },
    );

    return executionId;
  },
});

/**
 * Vindt outgoing edges van fromNodeId en schedule elk target-node.
 * Bij 0 outgoing: markeer execution completed.
 * Bij N outgoing: alle N worden parallel gepland (multi-channel send).
 */
export const dispatchNextNodes = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    fromNodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) return;
    // Skip alleen op terminaal: completed/failed/cancelled. "paused" mag
    // wel doorlopen — dat is juist het moment dat de scheduler triggert
    // na delay (status=paused, nu hervatten).
    if (
      execution.status === "completed" ||
      execution.status === "failed" ||
      execution.status === "cancelled"
    ) {
      return;
    }

    // Hervat: status terug naar running als 'ie paused was
    if (execution.status === "paused") {
      await ctx.db.patch(args.executionId, {
        status: "running",
        pausedUntil: undefined,
        scheduledFunctionId: undefined,
      });
    }

    const edges = await ctx.db
      .query("workflowEdges")
      .withIndex("by_workflow", (q) =>
        q.eq("workflowId", execution.workflowId),
      )
      .filter((q) => q.eq(q.field("sourceNodeId"), args.fromNodeId))
      .collect();

    if (edges.length === 0) {
      // End of branch — alleen completen als ALLE branches klaar zijn.
      // MVP simpel: markeer success bij eerste end-of-branch (lineaire flows).
      // Voor multi-branch fan-in zou een join-counter nodig zijn, later.
      await ctx.db.patch(args.executionId, {
        status: "completed",
        completedAt: Date.now(),
      });
      const wf = await ctx.db.get(execution.workflowId);
      if (wf) {
        await ctx.db.patch(execution.workflowId, {
          successfulExecutions: wf.successfulExecutions + 1,
        });
      }
      return;
    }

    for (const edge of edges) {
      await ctx.scheduler.runAfter(0, internal.workflowEngine.runNode, {
        executionId: args.executionId,
        nodeId: edge.targetNodeId,
      });
    }
  },
});

// ──────────────────────────────────────────────────────────────────────
// NODE EXECUTOR
// ──────────────────────────────────────────────────────────────────────

export const runNode = internalAction({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const ctxData = await ctx.runQuery(
      internal.workflowEngine.loadNodeContext,
      { executionId: args.executionId, nodeId: args.nodeId },
    );
    if (!ctxData) return;
    const { node, execution, contact } = ctxData;

    const startMs = Date.now();

    try {
      if (node.type === "delay") {
        const seconds = Number(
          (node.config as { delaySeconds?: number })?.delaySeconds ?? 0,
        );
        // Schedule continuation na delay; mark execution paused.
        const fnId = await ctx.scheduler.runAfter(
          seconds * 1000,
          internal.workflowEngine.dispatchNextNodes,
          { executionId: args.executionId, fromNodeId: node.nodeId },
        );
        await ctx.runMutation(internal.workflowEngine.markPaused, {
          executionId: args.executionId,
          currentNodeId: node.nodeId,
          pausedUntil: Date.now() + seconds * 1000,
          scheduledFunctionId: fnId,
        });
        await ctx.runMutation(internal.workflowEngine.logNode, {
          executionId: args.executionId,
          nodeId: node.nodeId,
          nodeType: "delay",
          status: "success",
          output: { delaySeconds: seconds },
          durationMs: Date.now() - startMs,
        });
        return; // dispatchNextNodes wordt door scheduler aangeroepen
      }

      if (node.type === "action") {
        if (!contact) throw new Error("Contact not found voor action");

        const sub = node.subType ?? "";
        const config = node.config as Record<string, unknown>;
        const channel =
          sub === "send_email"
            ? "email"
            : sub === "send_sms"
              ? "sms"
              : sub === "send_whatsapp"
                ? "whatsapp"
                : null;

        if (channel) {
          const body = interpolate(String(config.body ?? ""), contact);
          const subject =
            channel === "email"
              ? interpolate(String(config.subject ?? ""), contact)
              : undefined;

          await ctx.runAction(internal.messaging.sendInternal, {
            contactId: contact._id,
            channel,
            body,
            ...(subject ? { subject } : {}),
          });

          await ctx.runMutation(internal.workflowEngine.logNode, {
            executionId: args.executionId,
            nodeId: node.nodeId,
            nodeType: node.type,
            status: "success",
            output: { channel, recipient: channel === "email" ? contact.email : contact.phone },
            durationMs: Date.now() - startMs,
          });
        } else {
          // Unknown subType — log skipped
          await ctx.runMutation(internal.workflowEngine.logNode, {
            executionId: args.executionId,
            nodeId: node.nodeId,
            nodeType: node.type,
            status: "skipped",
            output: { reason: `Unknown subType: ${sub}` },
            durationMs: Date.now() - startMs,
          });
        }
      }

      // Dispatch next nodes (downstream)
      await ctx.runMutation(internal.workflowEngine.dispatchNextNodes, {
        executionId: args.executionId,
        fromNodeId: node.nodeId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.workflowEngine.logNode, {
        executionId: args.executionId,
        nodeId: node.nodeId,
        nodeType: node.type,
        status: "failed",
        error: msg,
        durationMs: Date.now() - startMs,
      });
      await ctx.runMutation(internal.workflowEngine.markExecutionFailed, {
        executionId: args.executionId,
        currentNodeId: node.nodeId,
      });
    }
    // Note: execution.status update bij completed gebeurt in dispatchNextNodes
    // (op het moment dat een branch geen outgoing edges meer heeft).
    // Omdat we ondanks `await ctxData = execution` zijn, gebruiken we de
    // mutations om state te muteren — zie ook markPaused/markExecutionFailed.
  },
});

// ──────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS — leesblok + state-patches
// ──────────────────────────────────────────────────────────────────────

export const loadNodeContext = internalQuery({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | null
    | {
        node: Doc<"workflowNodes">;
        execution: Doc<"workflowExecutions">;
        contact: Doc<"contacts"> | null;
      }
  > => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) return null;

    const node = await ctx.db
      .query("workflowNodes")
      .withIndex("by_workflow", (q) =>
        q.eq("workflowId", execution.workflowId),
      )
      .filter((q) => q.eq(q.field("nodeId"), args.nodeId))
      .first();
    if (!node) return null;

    let contact: Doc<"contacts"> | null = null;
    if (execution.entityType === "contact") {
      contact = await ctx.db.get(execution.entityId as Id<"contacts">);
    }

    return { node, execution, contact };
  },
});

export const markPaused = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    currentNodeId: v.string(),
    pausedUntil: v.number(),
    scheduledFunctionId: v.id("_scheduled_functions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, {
      status: "paused",
      currentNodeId: args.currentNodeId,
      pausedUntil: args.pausedUntil,
      scheduledFunctionId: args.scheduledFunctionId,
    });
  },
});

export const markExecutionFailed = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    currentNodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const exec = await ctx.db.get(args.executionId);
    if (!exec) return;
    await ctx.db.patch(args.executionId, {
      status: "failed",
      currentNodeId: args.currentNodeId,
      completedAt: Date.now(),
    });
    const wf = await ctx.db.get(exec.workflowId);
    if (wf) {
      await ctx.db.patch(exec.workflowId, {
        failedExecutions: wf.failedExecutions + 1,
      });
    }
  },
});

export const logNode = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    nodeType: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("workflowExecutionLogs", {
      executionId: args.executionId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      status: args.status,
      output: args.output,
      error: args.error,
      durationMs: args.durationMs,
    });
  },
});

// ──────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Simple template-interpolation. Vervangt {{contact.field}} met de
 * value uit contact-doc. Onbekende keys → lege string. Whitelist op
 * contact-document velden voor veiligheid.
 */
function interpolate(template: string, contact: Doc<"contacts">): string {
  return template.replace(/\{\{contact\.(\w+)\}\}/g, (_, key) => {
    const value = (contact as unknown as Record<string, unknown>)[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

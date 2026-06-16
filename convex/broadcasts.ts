import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { renderTemplate, htmlToPlainText, leadTemplateVars } from "./templateRender";
import { signUnsubToken } from "./unsubscribeToken";
import { nextBatch, injectUnsubFooter, buildListUnsubHeaders } from "./broadcastsLogic";

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 10_000;

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

const ZERO_STATS = { total: 0, sent: 0, delivered: 0, bounced: 0, unsubscribed: 0, failed: 0 };

// ── Queries ──────────────────────────────────────────────────────────
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db
      .query("broadcasts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return null;
    await requireWorkspace(ctx, b.workspaceId);
    return b;
  },
});

// ── Mutations ────────────────────────────────────────────────────────
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    segmentId: v.id("segments"),
  },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db.insert("broadcasts", {
      workspaceId: args.workspaceId,
      name: args.name,
      subject: args.subject,
      body: args.body,
      segmentId: args.segmentId,
      status: "draft",
      stats: ZERO_STATS,
    });
  },
});

export const cancel = mutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return;
    await requireWorkspace(ctx, b.workspaceId);
    if (b.status === "scheduled" || b.status === "sending") {
      await ctx.db.patch(args.broadcastId, { status: "cancelled" });
    }
  },
});

// ── Actions: testmail + verzenden ────────────────────────────────────
export const sendTest = action({
  args: { broadcastId: v.id("broadcasts"), toEmail: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    await ctx.runQuery(internal.broadcasts.assertBroadcastAccess, { broadcastId: args.broadcastId });
    const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: args.broadcastId });
    if (!b) throw new Error("Broadcast niet gevonden");
    const vars = leadTemplateVars({ firstName: "Test", lastName: "" }, b.companyName);
    const html = injectUnsubFooter(
      renderTemplate(b.body ?? "", vars),
      "https://example.com/unsubscribe?token=TEST",
    );
    await postBatch([
      {
        from: b.from,
        to: args.toEmail,
        subject: `[TEST] ${renderTemplate(b.subject, vars)}`,
        html,
        text: htmlToPlainText(html),
      },
    ]);
    return { ok: true };
  },
});

export const sendNow = action({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args): Promise<{ total: number }> => {
    await ctx.runQuery(internal.broadcasts.assertBroadcastAccess, { broadcastId: args.broadcastId });
    const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: args.broadcastId });
    if (!b) throw new Error("Broadcast niet gevonden");
    const recipients = await ctx.runQuery(internal.segments.resolveRecipients, {
      segmentId: b.segmentId,
    });
    await ctx.runMutation(internal.broadcasts.startSending, {
      broadcastId: args.broadcastId,
      total: recipients.length,
    });
    await ctx.scheduler.runAfter(0, internal.broadcasts.runBatch, {
      broadcastId: args.broadcastId,
    });
    return { total: recipients.length };
  },
});

// ── Internal: orchestratie ───────────────────────────────────────────

/** Auth-gate voor publieke broadcast-acties: verifieert dat de aanroeper lid
 *  is van de workspace van deze broadcast. Auth propageert via ctx.runQuery
 *  vanuit de action. runBatch (system-scheduled) gebruikt dit NIET. */
export const assertBroadcastAccess = internalQuery({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) throw new Error("Broadcast niet gevonden");
    await requireWorkspace(ctx, b.workspaceId);
    return null;
  },
});

export const loadForSend = internalQuery({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return null;
    const settings = await ctx.db
      .query("crmSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", b.workspaceId))
      .first();
    const ws = await ctx.db.get(b.workspaceId);
    const org = ws ? await ctx.db.get(ws.orgId) : null;
    return {
      ...b,
      companyName: settings?.companyName ?? org?.name ?? "StayCool Airco",
      from: process.env.EMAIL_FROM ?? "noreply@example.com",
    };
  },
});

export const startSending = internalMutation({
  args: { broadcastId: v.id("broadcasts"), total: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.broadcastId, {
      status: "sending",
      startedAt: Date.now(),
      stats: { ...ZERO_STATS, total: args.total },
    });
  },
});

// CORRECTION vs plan: constrain by workspaceId + channel via the real index
// (the plan used a no-op `(q)=>q` full scan which does not typecheck cleanly).
// Filter relatedEntity in code. Takes workspaceId so the index can be used.
export const alreadySentContactIds = internalQuery({
  args: { broadcastId: v.id("broadcasts"), workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("channel", "email"),
      )
      .collect();
    return rows
      .filter(
        (m) =>
          m.relatedEntityType === "broadcast" &&
          m.relatedEntityId === (args.broadcastId as string) &&
          m.status !== "failed",
      )
      .map((m) => m.contactId)
      .filter((id): id is Id<"contacts"> => id !== undefined);
  },
});

export const recordSends = internalMutation({
  args: {
    broadcastId: v.id("broadcasts"),
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    sends: v.array(
      v.object({
        contactId: v.id("contacts"),
        to: v.string(),
        externalMessageId: v.optional(v.string()),
        failed: v.boolean(),
        errorMessage: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let sent = 0;
    let failed = 0;
    for (const s of args.sends) {
      await ctx.db.insert("messages", {
        workspaceId: args.workspaceId,
        contactId: s.contactId,
        channel: "email",
        direction: "outbound",
        status: s.failed ? "failed" : "sent",
        externalMessageId: s.externalMessageId,
        to: s.to,
        subject: args.subject,
        body: "",
        relatedEntityType: "broadcast",
        relatedEntityId: args.broadcastId as string,
        sentAt: s.failed ? undefined : Date.now(),
        errorMessage: s.errorMessage,
      });
      if (s.failed) failed++;
      else sent++;
    }
    const b = await ctx.db.get(args.broadcastId);
    if (b) {
      await ctx.db.patch(args.broadcastId, {
        stats: { ...b.stats, sent: b.stats.sent + sent, failed: b.stats.failed + failed },
      });
    }
  },
});

export const finishSending = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (b && b.status === "sending") {
      await ctx.db.patch(args.broadcastId, { status: "sent", completedAt: Date.now() });
    }
  },
});

export const markFailed = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (b && b.status === "sending") {
      await ctx.db.patch(args.broadcastId, { status: "failed", completedAt: Date.now() });
    }
  },
});

export const runBatch = internalAction({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args): Promise<void> => {
    const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: args.broadcastId });
    if (!b || b.status === "cancelled") return;

    const recipients = await ctx.runQuery(internal.segments.resolveRecipients, {
      segmentId: b.segmentId,
    });
    const sentIds = new Set(
      (
        await ctx.runQuery(internal.broadcasts.alreadySentContactIds, {
          broadcastId: args.broadcastId,
          workspaceId: b.workspaceId,
        })
      ).map(String),
    );
    const batchIds = nextBatch(
      recipients.map((r) => String(r.contactId)),
      sentIds,
      BATCH_SIZE,
    );

    if (batchIds.length === 0) {
      await ctx.runMutation(internal.broadcasts.finishSending, { broadcastId: args.broadcastId });
      return;
    }

    const batchIdSet = new Set(batchIds);
    const batch = recipients.filter((r) => batchIdSet.has(String(r.contactId)));
    const siteUrl = process.env.CONVEX_SITE_URL ?? "";

    const emails = await Promise.all(
      batch.map(async (r) => {
        const token = await signUnsubToken(String(r.contactId));
        const unsubUrl = `${siteUrl}/unsubscribe?token=${token}`;
        const vars = leadTemplateVars(
          { firstName: r.firstName ?? "", lastName: r.lastName ?? "" },
          b.companyName,
        );
        const html = injectUnsubFooter(renderTemplate(b.body ?? "", vars), unsubUrl);
        return {
          from: b.from,
          to: r.email,
          subject: renderTemplate(b.subject, vars),
          html,
          text: htmlToPlainText(html),
          headers: buildListUnsubHeaders(unsubUrl),
          _contactId: r.contactId,
        };
      }),
    );

    let results: Array<{ id?: string }> = [];
    let batchFailed = false;
    try {
      results = await postBatch(emails.map(({ _contactId, ...e }) => e));
    } catch {
      batchFailed = true;
    }

    await ctx.runMutation(internal.broadcasts.recordSends, {
      broadcastId: args.broadcastId,
      workspaceId: b.workspaceId,
      subject: b.subject,
      sends: emails.map((e, i) => ({
        contactId: e._contactId,
        to: e.to,
        externalMessageId: batchFailed ? undefined : results[i]?.id,
        failed: batchFailed,
        errorMessage: batchFailed ? "Resend batch-call mislukt" : undefined,
      })),
    });

    // Bij een mislukte batch-call: markeer de broadcast als failed en STOP
    // (geen reschedule). De failed-rows tellen niet als 'verzonden', dus een
    // latere handmatige hervatting pakt deze contacten alsnog op.
    if (batchFailed) {
      await ctx.runMutation(internal.broadcasts.markFailed, { broadcastId: args.broadcastId });
      return;
    }
    // Volgende batch inplannen (getemporiseerd) zolang er nog ontvangers zijn.
    await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.broadcasts.runBatch, {
      broadcastId: args.broadcastId,
    });
  },
});

// ── Resend batch-helper ──────────────────────────────────────────────
async function postBatch(
  emails: Array<{
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
  }>,
): Promise<Array<{ id?: string }>> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY niet geconfigureerd");
  const res = await fetch(RESEND_BATCH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend batch ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  return data.data ?? [];
}

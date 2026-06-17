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
import { buildListUnsubHeaders } from "./broadcastsLogic";
import { renderEmailShell } from "./emailShell";
import { dedupeByEmail } from "./segmentsLogic";

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
    bodyBlocks: v.optional(v.array(v.any())),
    segmentId: v.id("segments"),
  },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db.insert("broadcasts", {
      workspaceId: args.workspaceId,
      name: args.name,
      subject: args.subject,
      body: args.body,
      bodyBlocks: args.bodyBlocks,
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
    const html = renderEmailShell(renderTemplate(b.body ?? "", vars), {
      companyName: b.companyName,
      unsubUrl: "https://example.com/unsubscribe?token=TEST",
      previewText: renderTemplate(b.subject, vars),
    });
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

    // Fix 1: atomic draft-guard — flip status draft→sending before doing any work.
    // A second call (double-click, scheduler retry) sees status != "draft" and aborts.
    const begin = await ctx.runMutation(internal.broadcasts.beginSend, {
      broadcastId: args.broadcastId,
    });
    if (!begin.started) throw new Error("Deze broadcast is al gestart of verzonden.");

    try {
      const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: args.broadcastId });
      if (!b) throw new Error("Broadcast niet gevonden");

      // Stap 1: haal alle ontvangers op via gepagineerde internalQuery
      const seg = await ctx.runQuery(internal.broadcasts.loadSegment, { segmentId: b.segmentId });
      if (!seg) throw new Error("Segment niet gevonden");

      const allRecipients: Array<{
        contactId: Id<"contacts">;
        email: string;
        firstName?: string;
        lastName?: string;
      }> = [];
      let cursor: string | null = null;
      let isDone = false;
      while (!isDone) {
        const result: {
          recipients: Array<{ contactId: Id<"contacts">; email: string; firstName?: string; lastName?: string }>;
          continueCursor: string;
          isDone: boolean;
        } = await ctx.runQuery(internal.segments.resolvePage, {
          workspaceId: b.workspaceId,
          rules: seg.rules,
          cursor,
          numItems: 500,
        });
        allRecipients.push(...result.recipients);
        cursor = result.continueCursor;
        isDone = result.isDone;
      }

      // Stap 2: dedupe op lowercased email
      const deduped = dedupeByEmail(allRecipients);

      // Stap 3: schrijf broadcastRecipients-rijen in chunks van ≤ 500
      const CHUNK = 500;
      for (let i = 0; i < deduped.length; i += CHUNK) {
        await ctx.runMutation(internal.broadcasts.addRecipients, {
          broadcastId: args.broadcastId,
          workspaceId: b.workspaceId,
          rows: deduped.slice(i, i + CHUNK),
        });
      }

      // Stap 4: sla totaal op en plan eerste batch in
      await ctx.runMutation(internal.broadcasts.setTotal, {
        broadcastId: args.broadcastId,
        total: deduped.length,
      });
      await ctx.scheduler.runAfter(0, internal.broadcasts.runBatch, {
        broadcastId: args.broadcastId,
      });
      return { total: deduped.length };
    } catch (err) {
      // Reset naar "draft" zodat de gebruiker de broadcast opnieuw kan proberen.
      await ctx.runMutation(internal.broadcasts.resetToDraft, { broadcastId: args.broadcastId });
      throw err;
    }
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
    const companyName = settings?.companyName ?? org?.name ?? "StayCool Airco";
    // Afzender-adres komt uit EMAIL_FROM (gedeelde, in Resend geverifieerde
    // sender). Bevat de env al een display-naam ("Naam <addr>") dan gebruiken
    // we die ongewijzigd; bij een kaal adres zetten we de workspace-bedrijfsnaam
    // ervoor → per-tenant afzender-naam zonder per-workspace config.
    const fromAddress = process.env.EMAIL_FROM ?? "noreply@example.com";
    const from = fromAddress.includes("<")
      ? fromAddress
      : `${companyName} <${fromAddress}>`;
    return {
      ...b,
      companyName,
      from,
    };
  },
});

export const loadSegment = internalQuery({
  args: { segmentId: v.id("segments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.segmentId);
  },
});

/** Reset een broadcast van "sending" terug naar "draft" als sendNow-setup
 *  mislukt. Zo kan de gebruiker de broadcast opnieuw proberen te verzenden. */
export const resetToDraft = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (b && b.status === "sending") {
      await ctx.db.patch(args.broadcastId, { status: "draft", startedAt: undefined });
    }
  },
});

/** Fix 1: Atomische draft-guard. Leest en flipt status in één transactie.
 *  Geeft { started: false } als broadcast niet in "draft" staat — zodat
 *  een tweede aanroep (double-click, scheduler-retry) altijd veilig stopt. */
export const beginSend = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return { started: false as const };
    if (b.status !== "draft") return { started: false as const };
    await ctx.db.patch(args.broadcastId, { status: "sending", startedAt: Date.now() });
    return { started: true as const };
  },
});

/** Sla het totale aantal ontvangers op nadat addRecipients klaar is.
 *  Status is al "sending" (gezet door beginSend). */
export const setTotal = internalMutation({
  args: { broadcastId: v.id("broadcasts"), total: v.number() },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return;
    await ctx.db.patch(args.broadcastId, { stats: { ...b.stats, total: args.total } });
  },
});

/** Schrijf een chunk broadcastRecipients-rijen (status: pending). */
export const addRecipients = internalMutation({
  args: {
    broadcastId: v.id("broadcasts"),
    workspaceId: v.id("workspaces"),
    rows: v.array(v.object({
      contactId: v.id("contacts"),
      email: v.string(),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    for (const r of args.rows) {
      await ctx.db.insert("broadcastRecipients", {
        broadcastId: args.broadcastId,
        workspaceId: args.workspaceId,
        contactId: r.contactId,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        status: "pending",
      });
    }
  },
});

// FASE-1 LIMITATION: als de runBatch-action crasht ná claimBatch maar vóór recordSends,
// blijven die rijen op status "sending" staan (at-most-once: niet opnieuw verzonden — de
// veilige richting voor e-mail). Geen auto-recovery cron in fase 1; handmatige hervatting
// of een toekomstige sweep die "sending"-rijen ouder dan N min terugzet naar "pending".

/** Fix 2b: Atomic claim — leest pending-rijen EN flipt ze naar "sending" in
 *  één mutatie. Twee gelijktijdige runBatch-aanroepen kunnen dezelfde rijen
 *  NOOIT allebei claimen: de tweede ziet ze al als "sending" en slaat ze over. */
export const claimBatch = internalMutation({
  args: { broadcastId: v.id("broadcasts"), limit: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("broadcastRecipients")
      .withIndex("by_broadcast_status", (q) =>
        q.eq("broadcastId", args.broadcastId).eq("status", "pending"),
      )
      .take(args.limit);
    for (const r of rows) {
      await ctx.db.patch(r._id, { status: "sending" });
    }
    return rows.map((r) => ({
      _id: r._id,
      contactId: r.contactId,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
    }));
  },
});

export const recordSends = internalMutation({
  args: {
    broadcastId: v.id("broadcasts"),
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    sends: v.array(
      v.object({
        recipientId: v.id("broadcastRecipients"),
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
      // Patch de broadcastRecipients-rij (sending → sent/failed)
      await ctx.db.patch(s.recipientId, {
        status: s.failed ? "failed" : "sent",
        externalMessageId: s.externalMessageId,
        errorMessage: s.errorMessage,
      });
      // Insert messages-rij (VERPLICHT: Resend-webhook gebruikt by_external_id)
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
    if (!b || b.status !== "sending") return;
    // Guard: finaliseer de broadcast pas als er GEEN "pending" én GEEN "sending"
    // ontvangers meer zijn. In-flight "sending"-rijen (batch crashte na claimBatch
    // maar vóór recordSends) voorkomen premature afsluiting.
    const stillPending = await ctx.db
      .query("broadcastRecipients")
      .withIndex("by_broadcast_status", (q) =>
        q.eq("broadcastId", args.broadcastId).eq("status", "pending"),
      )
      .first();
    const stillSending = await ctx.db
      .query("broadcastRecipients")
      .withIndex("by_broadcast_status", (q) =>
        q.eq("broadcastId", args.broadcastId).eq("status", "sending"),
      )
      .first();
    if (stillPending || stillSending) return; // niet finaliseren zolang er werk in-flight is
    await ctx.db.patch(args.broadcastId, { status: "sent", completedAt: Date.now() });
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

export const bumpStatFromExternalId = internalMutation({
  args: {
    externalMessageId: v.string(),
    field: v.union(v.literal("delivered"), v.literal("bounced"), v.literal("unsubscribed")),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_external_id", (q) => q.eq("externalMessageId", args.externalMessageId))
      .first();
    if (!message || message.relatedEntityType !== "broadcast" || !message.relatedEntityId) return;
    const b = await ctx.db.get(message.relatedEntityId as Id<"broadcasts">);
    if (!b) return;
    await ctx.db.patch(b._id, { stats: { ...b.stats, [args.field]: b.stats[args.field] + 1 } });
  },
});

export const runBatch = internalAction({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args): Promise<void> => {
    const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: args.broadcastId });
    if (!b || b.status === "cancelled") return;

    // Fix 2c: gebruik claimBatch i.p.v. nextPendingRecipients — atomisch claim
    // flipt pending→sending zodat gelijktijdige runBatch-aanroepen dezelfde
    // batch nooit dubbel verwerken.
    const claimed = await ctx.runMutation(internal.broadcasts.claimBatch, {
      broadcastId: args.broadcastId,
      limit: BATCH_SIZE,
    });

    if (claimed.length === 0) {
      await ctx.runMutation(internal.broadcasts.finishSending, { broadcastId: args.broadcastId });
      return;
    }

    const siteUrl = process.env.CONVEX_SITE_URL ?? "";

    const emails = await Promise.all(
      claimed.map(async (r) => {
        const token = await signUnsubToken(String(r.contactId));
        const unsubUrl = `${siteUrl}/unsubscribe?token=${token}`;
        const vars = leadTemplateVars(
          { firstName: r.firstName ?? "", lastName: r.lastName ?? "" },
          b.companyName,
        );
        const html = renderEmailShell(renderTemplate(b.body ?? "", vars), {
          companyName: b.companyName,
          unsubUrl,
          previewText: renderTemplate(b.subject, vars),
        });
        return {
          from: b.from,
          to: r.email,
          subject: renderTemplate(b.subject, vars),
          html,
          text: htmlToPlainText(html),
          headers: buildListUnsubHeaders(unsubUrl),
          _recipientId: r._id,
          _contactId: r.contactId,
        };
      }),
    );

    // Fix 3: onderscheid echte Resend-fout van JSON-parse-fout.
    // fetch-throws of !res.ok → batchFailed=true.
    // res.ok maar res.json() gooit → partial results, ontvangers toch "sent"
    // (externalMessageId=undefined). Crash hier NIET de hele batch.
    let results: Array<{ id?: string }> = [];
    let batchFailed = false;
    try {
      results = await postBatch(emails.map(({ _recipientId: _r, _contactId: _c, ...e }) => e));
    } catch {
      batchFailed = true;
    }

    // Fix 4: waarschuw bij lengte-mismatch zonder te crashen.
    if (!batchFailed && results.length !== emails.length) {
      console.warn(
        `[runBatch] Resend-response bevat ${results.length} items maar we stuurden ${emails.length} e-mails. Ontbrekende ids worden als undefined opgeslagen.`,
      );
    }

    await ctx.runMutation(internal.broadcasts.recordSends, {
      broadcastId: args.broadcastId,
      workspaceId: b.workspaceId,
      subject: b.subject,
      sends: emails.map((e, i) => ({
        recipientId: e._recipientId,
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
    // Volgende batch inplannen (getemporiseerd) zolang er nog pending-rijen zijn.
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
  // Fix 3: JSON-parse-fout is geen netwerk/Resend-fout; vang apart op zodat
  // de batch niet als "failed" wordt gemarkeerd terwijl de e-mails wél
  // verstuurd zijn. Geef lege array terug — caller slaat ids op als undefined.
  try {
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    return data.data ?? [];
  } catch {
    console.warn("[postBatch] res.ok maar JSON-parse mislukt; ids worden niet opgeslagen.");
    return [];
  }
}

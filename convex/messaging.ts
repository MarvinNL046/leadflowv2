import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Unified messaging — één action `send` met channel-discriminator routes
 * naar Resend (email), Voidfix SMS, of Voidfix WhatsApp Web. Alle outbound
 * landt in `messages` table met status-tracking (pending → sent/failed).
 *
 * V2 MVP-scope (kleiner dan v1):
 * - Geen rate-limiting yet (komt later via @convex-dev/rate-limiter)
 * - Geen inbound webhooks (delivery-receipts/replies) yet
 * - Geen per-org/per-workspace device routing — use platform-defaults
 *   in env (VOIDFIX_SMS_DEVICE_ID). Per-workspace WA session ID kan
 *   later via whatsappWebConfig table.
 * - Geen React Email templates — plain text/HTML body
 * - Geen phone E.164 normalisatie — opgeslagen waarde wordt 1:1 gebruikt
 *
 * Env-vars (set via `npx convex env set`):
 *   RESEND_API_KEY              — email via Resend
 *   EMAIL_FROM                  — default sender (b.v. "LeadFlow <noreply@…>")
 *   VOIDFIX_API_KEY             — shared key voor SMS + WA Voidfix APIs
 *   VOIDFIX_SMS_DEVICE_ID       — platform-default Android device
 *   VOIDFIX_WA_SESSION_ID       — platform-default WA session (optioneel,
 *                                 anders per-workspace via whatsappWebConfig)
 */

const VOIDFIX_SMS_URL = "https://sms.voidfix.com/api/external/send-message";
const VOIDFIX_WA_URL = "https://wa.voidfix.com/api/external/send-message";
const RESEND_URL = "https://api.resend.com/emails";

// ──────────────────────────────────────────────────────────────────────
// MAIN ACTION
// ──────────────────────────────────────────────────────────────────────

export const send = action({
  args: {
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    body: v.string(),
    subject: v.optional(v.string()),  // email only
    htmlBody: v.optional(v.string()), // email only
  },
  handler: async (ctx, args): Promise<{
    messageId: Id<"messages">;
    status: "sent" | "failed";
  }> => {
    // Resolve contact + auth via internal query
    const ctxData = await ctx.runQuery(
      internal.messaging.resolveForSend,
      { contactId: args.contactId, channel: args.channel },
    );
    if ("error" in ctxData) {
      throw new Error(ctxData.error);
    }
    const { contact, workspaceId, userId, recipient } = ctxData;

    // Insert messages-row pending
    const messageId = await ctx.runMutation(
      internal.messaging.insertPending,
      {
        workspaceId,
        contactId: args.contactId,
        channel: args.channel,
        to: recipient,
        body: args.body,
        subject: args.subject,
        htmlBody: args.htmlBody,
        sentById: userId,
      },
    );

    // Channel-specific send
    try {
      let externalId: string | undefined;
      if (args.channel === "email") {
        externalId = await sendViaResend({
          to: recipient,
          subject: args.subject ?? "(geen onderwerp)",
          text: args.body,
          html: args.htmlBody,
        });
      } else if (args.channel === "sms") {
        externalId = await sendViaVoidfixSms({
          to: recipient,
          message: args.body,
        });
      } else {
        externalId = await sendViaVoidfixWa({
          to: recipient,
          message: args.body,
        });
      }

      await ctx.runMutation(internal.messaging.markSent, {
        messageId,
        externalId,
      });
      return { messageId, status: "sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.messaging.markFailed, {
        messageId,
        errorMessage: msg,
      });
      // Re-throw zodat UI toast krijgt
      throw new Error(msg);
    }
  },
});

/**
 * Internal variant — voor systeem-acties (workflow engine, scheduled
 * jobs) die geen user-session hebben. Skipt auth-check; resolve contact
 * direct via internal query. Engine moet zelf zorgen dat contact in
 * verwachte workspace zit.
 */
export const sendInternal = internalAction({
  args: {
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    body: v.string(),
    subject: v.optional(v.string()),
    htmlBody: v.optional(v.string()),
    sentById: v.optional(v.id("users")),  // optioneel; nil voor systeem
  },
  handler: async (ctx, args): Promise<{
    messageId: Id<"messages">;
    status: "sent" | "failed";
  }> => {
    const data = await ctx.runQuery(
      internal.messaging.resolveForSendInternal,
      { contactId: args.contactId, channel: args.channel },
    );
    if ("error" in data) {
      throw new Error(data.error);
    }
    const { workspaceId, recipient } = data;

    const messageId = await ctx.runMutation(
      internal.messaging.insertPendingInternal,
      {
        workspaceId,
        contactId: args.contactId,
        channel: args.channel,
        to: recipient,
        body: args.body,
        subject: args.subject,
        htmlBody: args.htmlBody,
        sentById: args.sentById,
      },
    );

    try {
      let externalId: string | undefined;
      if (args.channel === "email") {
        externalId = await sendViaResend({
          to: recipient,
          subject: args.subject ?? "(geen onderwerp)",
          text: args.body,
          html: args.htmlBody,
        });
      } else if (args.channel === "sms") {
        externalId = await sendViaVoidfixSms({
          to: recipient,
          message: args.body,
        });
      } else {
        externalId = await sendViaVoidfixWa({
          to: recipient,
          message: args.body,
        });
      }
      await ctx.runMutation(internal.messaging.markSent, {
        messageId,
        externalId,
      });
      return { messageId, status: "sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.messaging.markFailed, {
        messageId,
        errorMessage: msg,
      });
      throw new Error(msg);
    }
  },
});

// ──────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS — auth + db
// ──────────────────────────────────────────────────────────────────────

export const resolveForSend = internalQuery({
  args: {
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { error: string }
    | {
        contact: Doc<"contacts">;
        workspaceId: Id<"workspaces">;
        userId: Id<"users">;
        recipient: string;
      }
  > => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { error: "Not authenticated" };

    const contact = await ctx.db.get(args.contactId);
    if (!contact) return { error: "Contact not found" };

    // Membership check
    const workspace = await ctx.db.get(contact.workspaceId);
    if (!workspace) return { error: "Workspace not found" };
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) return { error: "Not a member of this workspace" };

    // Recipient lookup per channel
    let recipient: string | undefined;
    if (args.channel === "email") recipient = contact.email;
    else recipient = contact.phone;  // sms + wa beide phone
    if (!recipient) {
      return {
        error: `Contact heeft geen ${args.channel === "email" ? "email" : "telefoonnummer"}`,
      };
    }

    return {
      contact,
      workspaceId: contact.workspaceId,
      userId,
      recipient,
    };
  },
});

export const insertPending = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    to: v.string(),
    body: v.string(),
    subject: v.optional(v.string()),
    htmlBody: v.optional(v.string()),
    sentById: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      workspaceId: args.workspaceId,
      contactId: args.contactId,
      channel: args.channel,
      direction: "outbound",
      status: "pending",
      to: args.to,
      body: args.body,
      subject: args.subject,
      htmlBody: args.htmlBody,
      sentById: args.sentById,
    });
  },
});

/** Internal-versie: sentById optioneel (systeem-message zonder user). */
export const insertPendingInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    to: v.string(),
    body: v.string(),
    subject: v.optional(v.string()),
    htmlBody: v.optional(v.string()),
    sentById: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      workspaceId: args.workspaceId,
      contactId: args.contactId,
      channel: args.channel,
      direction: "outbound",
      status: "pending",
      to: args.to,
      body: args.body,
      subject: args.subject,
      htmlBody: args.htmlBody,
      sentById: args.sentById,
    });
  },
});

// ──────────────────────────────────────────────────────────────────────
// INBOUND WEBHOOKS — delivery-receipts + replies vanaf Resend/Voidfix
// ──────────────────────────────────────────────────────────────────────

/**
 * Update messages-row op externalMessageId match. Voor Resend
 * delivery/bounce events of toekomstige Voidfix delivery-receipts.
 * Silent skip als externalId niet gevonden (campaign-mails van buiten
 * v2 of duplicate events na cleanup).
 */
export const updateStatusByExternalId = internalMutation({
  args: {
    externalMessageId: v.string(),
    newStatus: v.union(
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("bounced"),
      v.literal("read"),
    ),
    deliveredAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db
      .query("messages")
      .withIndex("by_external_id", (q) =>
        q.eq("externalMessageId", args.externalMessageId),
      )
      .first();
    if (!msg) return { matched: false };

    const patch: Record<string, unknown> = { status: args.newStatus };
    if (args.deliveredAt !== undefined) patch.deliveredAt = args.deliveredAt;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    if (args.newStatus === "read") patch.readAt = Date.now();

    await ctx.db.patch(msg._id, patch);
    return { matched: true, messageId: msg._id };
  },
});

/**
 * Record inbound message (reply van klant). Lookup contact via phone
 * binnen workspace. Contact niet gevonden → bewaar message met
 * contactId=undefined zodat Marvin via UI kan koppelen.
 */
export const recordInbound = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    from: v.string(),
    body: v.string(),
    externalMessageId: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mediaType: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Idempotency: skip als externalId al binnenkwam
    if (args.externalMessageId) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_external_id", (q) =>
          q.eq("externalMessageId", args.externalMessageId),
        )
        .first();
      if (existing) return { duplicate: true, messageId: existing._id };
    }

    // Contact-lookup: phone voor sms/wa, email voor email
    let contactId: Id<"contacts"> | undefined;

    if (args.channel === "email") {
      const normalizedEmail = args.from.toLowerCase().trim();
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_workspace_email", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("email", normalizedEmail),
        )
        .first();
      if (contact) contactId = contact._id;
    } else {
      // Voidfix kan met of zonder + prefix sturen. Probeer beide
      // varianten zodat lookup matched ongeacht format.
      const digits = args.from.replace(/[^\d+]/g, "");
      const withPlus = digits.startsWith("+") ? digits : `+${digits}`;
      const withoutPlus = digits.startsWith("+") ? digits.slice(1) : digits;

      const variants = [withPlus, withoutPlus];
      for (const phone of variants) {
        const contact = await ctx.db
          .query("contacts")
          .withIndex("by_workspace_phone", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("phone", phone),
          )
          .first();
        if (contact) {
          contactId = contact._id;
          break;
        }
      }
    }

    const messageId = await ctx.db.insert("messages", {
      workspaceId: args.workspaceId,
      contactId,
      channel: args.channel,
      direction: "inbound",
      status: "delivered",
      externalMessageId: args.externalMessageId,
      to: "",  // inbound — recipient is wijzelf, leeg laten
      from: args.from,
      body: args.body,
      mediaUrl: args.mediaUrl,
      mediaType: args.mediaType,
      sentAt: args.receivedAt ?? Date.now(),
      deliveredAt: args.receivedAt ?? Date.now(),
    });

    return { matched: !!contactId, messageId };
  },
});

/** Internal: Staycool default workspace voor inbound webhooks (MVP single-tenant). */
export const getStaycoolWorkspaceIdInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "staycool"))
      .unique();
    if (!org) return null;
    const ws = await ctx.db
      .query("workspaces")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    return ws?._id ?? null;
  },
});

/** Auth-loze resolver voor systeem-sends. */
export const resolveForSendInternal = internalQuery({
  args: {
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { error: string }
    | { workspaceId: Id<"workspaces">; recipient: string }
  > => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return { error: "Contact not found" };
    const recipient =
      args.channel === "email" ? contact.email : contact.phone;
    if (!recipient) {
      return {
        error: `Contact heeft geen ${args.channel === "email" ? "email" : "telefoonnummer"}`,
      };
    }
    return { workspaceId: contact.workspaceId, recipient };
  },
});

export const markSent = internalMutation({
  args: {
    messageId: v.id("messages"),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "sent",
      externalMessageId: args.externalId,
      sentAt: Date.now(),
    });
  },
});

export const markFailed = internalMutation({
  args: {
    messageId: v.id("messages"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "failed",
      errorMessage: args.errorMessage,
    });
  },
});

// ──────────────────────────────────────────────────────────────────────
// LIST messages voor detail-page (later messages-tab)
// ──────────────────────────────────────────────────────────────────────

async function requireMembershipForContact(
  ctx: QueryCtx,
  contactId: Id<"contacts">,
): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const contact = await ctx.db.get(contactId);
  if (!contact) throw new Error("Contact not found");
  const workspace = await ctx.db.get(contact.workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();
  if (!membership) throw new Error("Not a member of this workspace");
}

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    await requireMembershipForContact(ctx, args.contactId);
    return await ctx.db
      .query("messages")
      .withIndex("by_contact_sent", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .take(50);
  },
});

/**
 * Paginated workspace-wide messages voor de /crm/messages inbox.
 * Optionele channel-filter; default = alle kanalen.
 */
export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    channel: v.optional(
      v.union(
        v.literal("email"),
        v.literal("sms"),
        v.literal("whatsapp"),
        v.literal("messenger"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) throw new Error("Not a member of this workspace");

    const baseQuery = args.channel
      ? ctx.db
          .query("messages")
          .withIndex("by_workspace_channel_sent", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("channel", args.channel!),
          )
      : ctx.db
          .query("messages")
          .withIndex("by_workspace_channel_sent", (q) =>
            q.eq("workspaceId", args.workspaceId),
          );

    const page = await baseQuery.order("desc").paginate(args.paginationOpts);

    // Verrijk met contact-naam per row
    const enriched = await Promise.all(
      page.page.map(async (m) => {
        let contactName: string | null = null;
        if (m.contactId) {
          const c = await ctx.db.get(m.contactId);
          if (c) {
            contactName =
              [c.firstName, c.lastName].filter(Boolean).join(" ") ||
              c.email ||
              c.phone ||
              null;
          }
        }
        return { ...m, contactName };
      }),
    );

    return { ...page, page: enriched };
  },
});

// ──────────────────────────────────────────────────────────────────────
// PROVIDER HELPERS — geen ctx-toegang, pure fetch
// ──────────────────────────────────────────────────────────────────────

async function sendViaResend(args: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "noreply@example.com";
  if (!apiKey) throw new Error("RESEND_API_KEY niet geconfigureerd");

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? "";
}

async function sendViaVoidfixSms(args: {
  to: string;
  message: string;
}): Promise<string> {
  const apiKey = process.env.VOIDFIX_API_KEY;
  const deviceId = process.env.VOIDFIX_SMS_DEVICE_ID;
  if (!apiKey) throw new Error("VOIDFIX_API_KEY niet geconfigureerd");
  if (!deviceId)
    throw new Error("VOIDFIX_SMS_DEVICE_ID niet geconfigureerd");

  const res = await fetch(VOIDFIX_SMS_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deviceId,
      to: args.to,
      message: args.message,
      sim: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Voidfix SMS ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { messageId?: string; id?: string };
  return data.messageId ?? data.id ?? "";
}

async function sendViaVoidfixWa(args: {
  to: string;
  message: string;
}): Promise<string> {
  const apiKey = process.env.VOIDFIX_API_KEY;
  const sessionId = process.env.VOIDFIX_WA_SESSION_ID;
  if (!apiKey) throw new Error("VOIDFIX_API_KEY niet geconfigureerd");
  if (!sessionId)
    throw new Error("VOIDFIX_WA_SESSION_ID niet geconfigureerd");

  const res = await fetch(VOIDFIX_WA_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId,
      to: args.to,
      message: args.message,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Voidfix WA ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { messageId?: string; id?: string };
  return data.messageId ?? data.id ?? "";
}

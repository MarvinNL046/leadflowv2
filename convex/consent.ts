import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/** Zet contact op unsubscribed (gebruiker klikte afmelden). Idempotent. */
export const unsubscribeContact = internalMutation({
  args: {
    contactId: v.id("contacts"),
    reason: v.union(v.literal("user"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return { ok: false as const };
    if (contact.emailMarketingStatus === "cleaned") return { ok: true as const };
    await ctx.db.patch(args.contactId, {
      emailMarketingStatus: "unsubscribed",
      marketingUnsubscribedAt: Date.now(),
      marketingUnsubscribedReason: args.reason,
    });
    return { ok: true as const };
  },
});

/** Markeer het contact achter een externalMessageId als cleaned (hard bounce
 *  of spam-klacht). Wordt aangeroepen vanuit de Resend-webhook. */
export const cleanContactByExternalId = internalMutation({
  args: {
    externalMessageId: v.string(),
    reason: v.union(v.literal("bounced"), v.literal("complained")),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_external_id", (q) =>
        q.eq("externalMessageId", args.externalMessageId),
      )
      .first();
    if (!message?.contactId) return { ok: false as const };
    await ctx.db.patch(message.contactId, {
      emailMarketingStatus: "cleaned",
      marketingUnsubscribedAt: Date.now(),
      marketingUnsubscribedReason: args.reason,
    });
    return { ok: true as const, broadcastId: message.relatedEntityId };
  },
});

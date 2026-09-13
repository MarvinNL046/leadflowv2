import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { requireWorkspacePermission } from "./lib/permissions";
import { requireAdmin } from "./marketplace/admin";
import { product } from "./appRequests";

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function hashCode(code: string) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)),
  );
}
export const lease = v.object({
  bindingId: v.string(),
  orgId: v.string(),
  revision: v.number(),
  issuedAt: v.number(),
  allowedUntil: v.number(),
});
export const createCode = mutation({
  args: { workspaceId: v.id("workspaces"), product },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { orgId, userId, membership } = await requireWorkspacePermission(
      ctx,
      args.workspaceId,
    );
    if (membership.role !== "owner")
      throw new ConvexError("Alleen de eigenaar kan bedrijven koppelen");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Niet ingelogd");
    const code = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const old = await ctx.db
      .query("suitePairingCodes")
      .withIndex("by_orgId_and_product", (q) =>
        q.eq("orgId", orgId).eq("product", args.product),
      )
      .unique();
    const data = {
      orgId,
      product: args.product,
      userId,
      subject: identity.subject,
      issuer: identity.issuer,
      hash: await hashCode(code),
      expiresAt: Date.now() + 600000,
    };
    if (old) await ctx.db.replace(old._id, data);
    else await ctx.db.insert("suitePairingCodes", data);
    return code;
  },
});
// Called only by the authenticated product server; never exposed to clients.
export const pair = internalMutation({
  args: {
    product,
    code: v.string(),
    targetOrgId: v.string(),
    subject: v.string(),
    issuer: v.string(),
  },
  returns: lease,
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.code) || args.targetOrgId.length > 100)
      throw new ConvexError("Ongeldige koppeling");
    const hash = await hashCode(args.code);
    const token = await ctx.db
      .query("suitePairingCodes")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (
      !token ||
      token.expiresAt <= Date.now() ||
      token.product !== args.product ||
      token.subject !== args.subject ||
      token.issuer !== args.issuer
    )
      throw new ConvexError(
        "Ongeldige of verlopen code; gebruik dezelfde eigenaar in beide apps",
      );
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", token.userId).eq("orgId", token.orgId),
      )
      .take(101);
    if (
      memberships.length > 100 ||
      !memberships.some((m) => m.role === "owner")
    )
      throw new ConvexError("Eigenaar heeft geen toegang meer");
    const existing = await ctx.db
      .query("suiteBindings")
      .withIndex("by_orgId_and_product", (q) =>
        q.eq("orgId", token.orgId).eq("product", args.product),
      )
      .unique();
    const target = await ctx.db
      .query("suiteBindings")
      .withIndex("by_product_and_targetOrgId", (q) =>
        q.eq("product", args.product).eq("targetOrgId", args.targetOrgId),
      )
      .unique();
    if (
      (existing && existing.targetOrgId !== args.targetOrgId) ||
      (target && target.orgId !== token.orgId)
    )
      throw new ConvexError("Bedrijf is al anders gekoppeld");
    const bindingId = existing
      ? existing._id
      : await ctx.db.insert("suiteBindings", {
          orgId: token.orgId,
          product: args.product,
          targetOrgId: args.targetOrgId,
          pairedBy: token.userId,
          pairedAt: Date.now(),
          revision: 0,
          enabled: false,
          validUntil: 0,
        });
    // Same-target retry is safe after a lost response. Different targets are rejected.
    const binding = await ctx.db.get(bindingId);
    if (!binding) throw new Error("Missing binding");
    return {
      bindingId,
      orgId: args.targetOrgId,
      revision: binding.revision,
      issuedAt: Date.now(),
      allowedUntil: binding.enabled
        ? Math.min(binding.validUntil, Date.now() + 900000)
        : 0,
    };
  },
});
export const currentLease = internalQuery({
  args: { product, bindingId: v.id("suiteBindings"), targetOrgId: v.string() },
  returns: lease,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.bindingId);
    if (
      !row ||
      row.product !== args.product ||
      row.targetOrgId !== args.targetOrgId
    )
      throw new ConvexError("Onbekende binding");
    return {
      bindingId: row._id,
      orgId: row.targetOrgId,
      revision: row.revision,
      issuedAt: Date.now(),
      allowedUntil: row.enabled
        ? Math.min(row.validUntil, Date.now() + 900000)
        : 0,
    };
  },
});
export const setAccess = mutation({
  args: {
    bindingId: v.id("suiteBindings"),
    enabled: v.boolean(),
    validUntil: v.number(),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx),
      row = await ctx.db.get(args.bindingId),
      now = Date.now(),
      note = args.note.trim();
    if (
      !row ||
      note.length < 5 ||
      note.length > 500 ||
      !Number.isFinite(args.validUntil) ||
      (args.enabled &&
        (args.validUntil <= now || args.validUntil > now + 366 * 86400000))
    )
      throw new ConvexError(
        "Geef een toelichting en een einddatum binnen één jaar",
      );
    const validUntil = args.enabled ? args.validUntil : 0;
    await ctx.db.patch(row._id, {
      enabled: args.enabled,
      validUntil,
      revision: row.revision + 1,
    });
    await ctx.db.insert("suiteAccessAudit", {
      bindingId: row._id,
      actor,
      changedAt: now,
      enabled: args.enabled,
      validUntil,
      note,
    });
    return null;
  },
});
export const company = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    canPair: v.boolean(),
    bindings: v.array(
      v.object({ product, enabled: v.boolean(), validUntil: v.number() }),
    ),
  }),
  handler: async (ctx, { workspaceId }) => {
    const { orgId, membership } = await requireWorkspacePermission(
      ctx,
      workspaceId,
    );
    const rows = await ctx.db
      .query("suiteBindings")
      .withIndex("by_orgId_and_product", (q) => q.eq("orgId", orgId))
      .take(3);
    return {
      canPair: membership.role === "owner",
      bindings: rows.map((r) => ({
        product: r.product,
        enabled: r.enabled && r.validUntil > Date.now(),
        validUntil: r.validUntil,
      })),
    };
  },
});
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        id: v.id("suiteBindings"),
        company: v.string(),
        product,
        targetOrgId: v.string(),
        enabled: v.boolean(),
        validUntil: v.number(),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("suiteBindings")
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(50, args.paginationOpts.numItems),
      });
    return {
      isDone: rows.isDone,
      continueCursor: rows.continueCursor,
      page: await Promise.all(
        rows.page.map(async (r) => ({
          id: r._id,
          company: (await ctx.db.get(r.orgId))?.name ?? "Verwijderd",
          product: r.product,
          targetOrgId: r.targetOrgId,
          enabled: r.enabled,
          validUntil: r.validUntil,
        })),
      ),
    };
  },
});

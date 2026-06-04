import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { decryptSecret } from "./lib/crypto";

/**
 * Integrations layer — Meta (Facebook Lead Ads) + WhatsApp via Voidfix.
 *
 * Auth-pattern: elke handler valideert dat de huidige user owner/admin is
 * van de org/workspace voor de gevraagde resource. Geen userId-args, alles
 * via `getAuthUserId(ctx)` per Convex-guidelines.
 *
 * Voidfix WA REST API base: https://wa.voidfix.com
 * Auth header: X-API-Key = process.env.VOIDFIX_API_KEY
 * Endpoints gebruikt:
 *   POST /api/external/qr-code              → genereer/refresh QR
 *   GET  /api/external/session-status/:id   → poll connectie-status
 *   GET  /api/external/sessions             → list (debug)
 *
 * Meta Graph API base: https://graph.facebook.com/v21.0
 * Page-token gebruikt voor /forms en /subscribed_apps endpoints.
 */

const VOIDFIX_WA_BASE = "https://wa.voidfix.com";
const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

// ──────────────────────────────────────────────────────────────────────
// AUTH HELPERS
// ──────────────────────────────────────────────────────────────────────

async function requireOrgAccess(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
): Promise<{ userId: Id<"users">; role: "owner" | "admin" | "member" }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Niet ingelogd");

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
    .first();

  if (!membership) throw new Error("Geen toegang tot deze organisatie");
  return { userId, role: membership.role };
}

async function requireWorkspaceAccess(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<{ userId: Id<"users">; orgId: Id<"orgs"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Niet ingelogd");

  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Workspace niet gevonden");

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();
  if (!membership) throw new Error("Geen toegang tot deze workspace");

  return { userId, orgId: workspace.orgId };
}

// ══════════════════════════════════════════════════════════════════════
// META QUERIES
// ══════════════════════════════════════════════════════════════════════

/** Status van Meta-koppeling voor een org: connected? + welke pages? */
export const getMetaConnectionStatus = query({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.orgId);

    const connection = await ctx.db
      .query("metaConnections")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!connection) {
      return { connected: false as const };
    }

    const pages = await ctx.db
      .query("metaPages")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return {
      connected: true as const,
      connection: {
        id: connection._id,
        metaUserId: connection.metaUserId,
        connectedAt: connection._creationTime,
        syncedAt: connection.syncedAt ?? null,
      },
      pages: pages.map((p) => ({
        id: p._id,
        pageId: p.pageId,
        pageName: p.pageName,
        workspaceId: p.workspaceId ?? null,
      })),
    };
  },
});

/** Per-page lijst van forms voor de Meta-koppeling van een org. */
export const listMetaPagesWithForms = query({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.orgId);

    const pages = await ctx.db
      .query("metaPages")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const result = await Promise.all(
      pages.map(async (page) => {
        const forms = await ctx.db
          .query("metaForms")
          .withIndex("by_page_form", (q) => q.eq("pageId", page._id))
          .collect();
        return {
          id: page._id,
          pageId: page.pageId,
          pageName: page.pageName,
          workspaceId: page.workspaceId ?? null,
          forms: forms.map((f) => ({
            id: f._id,
            formId: f.formId,
            formName: f.formName ?? "(naamloos)",
            isActive: f.isActive,
            lastSyncAt: f.lastSyncAt ?? null,
            fieldCount: Array.isArray(f.formFields) ? f.formFields.length : 0,
          })),
        };
      }),
    );
    return result;
  },
});

/** Routes per source-id (per orgId) + denormalized labels voor de UI. Voor
 *  elke route resolven we workspace-naam, pipeline-naam, stage-naam,
 *  assignee-naam, en — als sourceType="meta_form" — ook page+form-naam. */
export const listLeadIngestRoutes = query({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.orgId);

    const routes = await ctx.db
      .query("leadIngestRoutes")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();

    return Promise.all(
      routes.map(async (r) => {
        const workspace = await ctx.db.get(r.targetWorkspaceId);
        const pipeline = r.defaultPipelineId
          ? await ctx.db.get(r.defaultPipelineId)
          : null;
        const stage = r.defaultStageId
          ? await ctx.db.get(r.defaultStageId)
          : null;
        const assignee = r.assignToUserId
          ? await ctx.db.get(r.assignToUserId)
          : null;

        // Voor meta_form: resolve form + page op naam.
        let formInfo: {
          formId: string;
          formName: string;
          pageName: string;
        } | null = null;
        if (r.sourceType === "meta_form") {
          // Find form by external formId via filter (sourceIdentifier =
          // Meta form-id, niet de Convex Id<"metaForms">). Klein-volume
          // table, scan-by-orgId is prima.
          const formsForOrg = await ctx.db
            .query("metaForms")
            .filter((q) => q.eq(q.field("orgId"), args.orgId))
            .collect();
          const form = formsForOrg.find(
            (f) => f.formId === r.sourceIdentifier,
          );
          if (form) {
            const page = await ctx.db.get(form.pageId);
            formInfo = {
              formId: form.formId,
              formName: form.formName ?? "(naamloos)",
              pageName: page?.pageName ?? "(onbekende pagina)",
            };
          } else {
            formInfo = {
              formId: r.sourceIdentifier,
              formName: "(formulier nog niet gesynced)",
              pageName: "(onbekend)",
            };
          }
        }

        return {
          id: r._id,
          sourceType: r.sourceType,
          sourceIdentifier: r.sourceIdentifier,
          targetWorkspaceId: r.targetWorkspaceId,
          workspaceName: workspace?.name ?? "(onbekend)",
          defaultPipelineId: r.defaultPipelineId ?? null,
          pipelineName: pipeline?.name ?? null,
          defaultStageId: r.defaultStageId ?? null,
          stageName: stage?.name ?? null,
          assignToUserId: r.assignToUserId ?? null,
          assigneeName: assignee
            ? assignee.name ?? assignee.email ?? "(naamloos)"
            : null,
          defaultLeadValue: r.defaultLeadValue ?? null,
          isActive: r.isActive ?? true,
          formInfo,
        };
      }),
    );
  },
});

/** Workspaces in deze org — voor selectie in route-dialog. */
export const listWorkspacesForOrg = query({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.orgId);
    const workspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return workspaces.map((w) => ({
      id: w._id,
      name: w.name,
      isDefault: w.isDefault,
    }));
  },
});

/** Pipelines + stages voor een workspace — voor selectie in route-dialog. */
export const listPipelinesWithStages = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const pipelines = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return Promise.all(
      pipelines.map(async (p) => {
        const stages = await ctx.db
          .query("pipelineStages")
          .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", p._id))
          .collect();
        return {
          id: p._id,
          name: p.name,
          isDefault: p.isDefault,
          stages: stages
            .sort((a, b) => a.order - b.order)
            .map((s) => ({
              id: s._id,
              name: s.name,
              isWonStage: s.isWonStage,
              isLostStage: s.isLostStage,
            })),
        };
      }),
    );
  },
});

/** Members van een org — voor auto-assignee-selectie. */
export const listOrgMembers = query({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.orgId);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const seen = new Set<string>();
    const result: Array<{
      userId: Id<"users">;
      name: string;
      email: string;
      role: "owner" | "admin" | "member";
    }> = [];
    for (const m of memberships) {
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      const user = await ctx.db.get(m.userId);
      if (!user) continue;
      result.push({
        userId: m.userId,
        name: user.name ?? "(naamloos)",
        email: user.email ?? "",
        role: m.role,
      });
    }
    return result;
  },
});

// ══════════════════════════════════════════════════════════════════════
// META MUTATIONS
// ══════════════════════════════════════════════════════════════════════

/** Map een Meta-page aan een specifieke workspace (multi-workspace orgs). */
export const assignMetaPageToWorkspace = mutation({
  args: {
    pageId: v.id("metaPages"),
    workspaceId: v.union(v.id("workspaces"), v.null()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) throw new Error("Page niet gevonden");
    await requireOrgAccess(ctx, page.orgId);

    if (args.workspaceId) {
      const ws = await ctx.db.get(args.workspaceId);
      if (!ws || ws.orgId !== page.orgId) {
        throw new Error("Workspace hoort niet bij deze org");
      }
    }
    await ctx.db.patch(args.pageId, {
      workspaceId: args.workspaceId ?? undefined,
    });
    return null;
  },
});

/** Upsert route: stuur leads van form X naar workspace Y + pipeline/stage
 *  /assignee/value defaults. Sourceidentifier is uniek per sourceType. */
export const upsertLeadIngestRoute = mutation({
  args: {
    /** Wijzig bestaande route i.p.v. nieuwe maken. */
    id: v.optional(v.id("leadIngestRoutes")),
    orgId: v.id("orgs"),
    sourceType: v.union(v.literal("meta_form"), v.literal("api_key")),
    sourceIdentifier: v.string(),
    targetWorkspaceId: v.id("workspaces"),
    defaultPipelineId: v.optional(v.id("pipelines")),
    defaultStageId: v.optional(v.id("pipelineStages")),
    assignToUserId: v.optional(v.id("users")),
    defaultLeadValue: v.optional(v.number()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.orgId);

    // Validate workspace hoort bij de org
    const ws = await ctx.db.get(args.targetWorkspaceId);
    if (!ws || ws.orgId !== args.orgId) {
      throw new Error("Workspace hoort niet bij deze org");
    }

    // Validate pipeline+stage in workspace (als gezet)
    if (args.defaultPipelineId) {
      const pipeline = await ctx.db.get(args.defaultPipelineId);
      if (!pipeline || pipeline.workspaceId !== args.targetWorkspaceId) {
        throw new Error("Pipeline hoort niet bij de target workspace");
      }
    }
    if (args.defaultStageId) {
      if (!args.defaultPipelineId) {
        throw new Error("Stage gekozen zonder pipeline");
      }
      const stage = await ctx.db.get(args.defaultStageId);
      if (!stage || stage.pipelineId !== args.defaultPipelineId) {
        throw new Error("Stage hoort niet bij de gekozen pipeline");
      }
    }

    // Validate assignee is member van de org
    if (args.assignToUserId) {
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_user_org", (q) =>
          q.eq("userId", args.assignToUserId!).eq("orgId", args.orgId),
        )
        .first();
      if (!membership) {
        throw new Error("Assignee is geen lid van deze org");
      }
    }

    const patchData = {
      targetWorkspaceId: args.targetWorkspaceId,
      defaultPipelineId: args.defaultPipelineId,
      defaultStageId: args.defaultStageId,
      assignToUserId: args.assignToUserId,
      defaultLeadValue: args.defaultLeadValue,
      isActive: args.isActive,
    };

    // Update bestaande row als id meegegeven
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Route niet gevonden");
      if (existing.orgId !== args.orgId) {
        throw new Error("Geen toegang tot deze route");
      }
      // Check: andere route met dezelfde source-id?
      const conflict = await ctx.db
        .query("leadIngestRoutes")
        .withIndex("by_source", (q) =>
          q
            .eq("sourceType", args.sourceType)
            .eq("sourceIdentifier", args.sourceIdentifier),
        )
        .first();
      if (conflict && conflict._id !== args.id) {
        throw new Error("Andere route gebruikt deze source-id al");
      }
      await ctx.db.patch(args.id, {
        sourceType: args.sourceType,
        sourceIdentifier: args.sourceIdentifier,
        ...patchData,
      });
      return args.id;
    }

    // Nieuwe route: check op duplicate source-id
    const dup = await ctx.db
      .query("leadIngestRoutes")
      .withIndex("by_source", (q) =>
        q
          .eq("sourceType", args.sourceType)
          .eq("sourceIdentifier", args.sourceIdentifier),
      )
      .first();
    if (dup) {
      throw new Error(
        "Er bestaat al een route voor deze source. Bewerk die in plaats van een nieuwe te maken.",
      );
    }

    return await ctx.db.insert("leadIngestRoutes", {
      orgId: args.orgId,
      sourceType: args.sourceType,
      sourceIdentifier: args.sourceIdentifier,
      ...patchData,
    });
  },
});

/** Verwijder een route. */
export const deleteLeadIngestRoute = mutation({
  args: { id: v.id("leadIngestRoutes") },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) return null;
    await requireOrgAccess(ctx, route.orgId);
    await ctx.db.delete(args.id);
    return null;
  },
});

/** Deactiveer Meta-koppeling. Pages + connection krijgen isActive=false.
 *  Forms blijven bestaan (audit-trail). */
export const disconnectMeta = mutation({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.orgId);

    const connection = await ctx.db
      .query("metaConnections")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .first();
    if (connection) {
      await ctx.db.patch(connection._id, { isActive: false });
    }

    const pages = await ctx.db
      .query("metaPages")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const page of pages) {
      await ctx.db.patch(page._id, { isActive: false });
    }
    return null;
  },
});

// ══════════════════════════════════════════════════════════════════════
// META FORMS SYNC (action — gebruikt Graph API)
// ══════════════════════════════════════════════════════════════════════

/**
 * Haalt forms op van Meta voor een gegeven page en upsert ze naar
 * metaForms-tabel. Gebruikt de page access-token uit metaPages.
 *
 * Graph endpoint: GET /{page-id}/leadgen_forms?fields=id,name,questions
 */
export const syncFormsForPage = action({
  args: { pageId: v.id("metaPages") },
  handler: async (ctx, args): Promise<{
    synced: number;
    errors: string[];
  }> => {
    const pageData: {
      page: { pageId: string; accessToken: string; orgId: Id<"orgs"> };
    } = await ctx.runQuery(internal.integrations.getPageForSync, {
      pageId: args.pageId,
    });

    const url = new URL(
      `${META_GRAPH_BASE}/${pageData.page.pageId}/leadgen_forms`,
    );
    url.searchParams.set("fields", "id,name,questions,status,locale");
    url.searchParams.set("limit", "100");
    // Token-at-rest is encrypted (zie lib/crypto); decrypt vlak vóór de
    // Graph-call. Legacy-tolerant: pre-encryptie tokens komen ongewijzigd terug.
    url.searchParams.set(
      "access_token",
      await decryptSecret(pageData.page.accessToken),
    );

    const errors: string[] = [];
    let synced = 0;

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        const text = await res.text();
        return { synced: 0, errors: [`Graph API ${res.status}: ${text}`] };
      }
      const json = (await res.json()) as {
        data?: Array<{
          id: string;
          name?: string;
          questions?: unknown;
        }>;
        error?: { message?: string };
      };
      if (json.error) {
        return { synced: 0, errors: [json.error.message ?? "Onbekende fout"] };
      }
      for (const form of json.data ?? []) {
        await ctx.runMutation(internal.integrations.upsertFormInternal, {
          orgId: pageData.page.orgId,
          pageId: args.pageId,
          formId: form.id,
          formName: form.name,
          formFields: form.questions,
        });
        synced++;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return { synced, errors };
  },
});

// Internal helpers voor de action ───────────────────────────────────────

export const getPageForSync = internalQuery({
  args: { pageId: v.id("metaPages") },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) throw new Error("Page niet gevonden");
    if (!page.isActive) throw new Error("Page is gedeactiveerd");
    return {
      page: {
        pageId: page.pageId,
        accessToken: page.accessToken,
        orgId: page.orgId,
      },
    };
  },
});

/**
 * Upsert connection + pages na succesvolle Meta OAuth callback. Aangeroepen
 * vanuit de HTTP route. Pages krijgen de page-token uit Graph /me/accounts;
 * subscriptie naar leadgen-webhook is een aparte stap (kan handmatig vanuit
 * Meta dashboard of via een vervolgactie).
 */
export const upsertMetaConnectionInternal = internalMutation({
  args: {
    orgId: v.id("orgs"),
    metaUserId: v.string(),
    accessToken: v.string(),
    pages: v.array(
      v.object({
        pageId: v.string(),
        pageName: v.string(),
        accessToken: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Connection: één per org+metaUserId; reuse als bestaand.
    const existingConn = await ctx.db
      .query("metaConnections")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.eq(q.field("metaUserId"), args.metaUserId))
      .first();

    if (existingConn) {
      await ctx.db.patch(existingConn._id, {
        accessToken: args.accessToken,
        isActive: true,
        syncedAt: Date.now(),
      });
    } else {
      // Deactiveer eventuele andere connections voor deze org (1 actieve
      // Meta-koppeling per org houden we aan voor MVP).
      const others = await ctx.db
        .query("metaConnections")
        .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
        .collect();
      for (const o of others) {
        await ctx.db.patch(o._id, { isActive: false });
      }
      await ctx.db.insert("metaConnections", {
        orgId: args.orgId,
        metaUserId: args.metaUserId,
        accessToken: args.accessToken,
        isActive: true,
        syncedAt: Date.now(),
      });
    }

    // Pages: upsert per pageId binnen deze org.
    let pagesUpserted = 0;
    for (const p of args.pages) {
      const existingPage = await ctx.db
        .query("metaPages")
        .withIndex("by_pageId_active", (q) => q.eq("pageId", p.pageId))
        .first();

      if (existingPage) {
        // Veiligheidscheck: page mag niet bij andere org horen
        if (existingPage.orgId !== args.orgId) {
          // Skip — page is bij andere org geclaimd. Log + door.
          console.warn(
            `[meta-oauth] page ${p.pageId} hoort bij andere org, skipping`,
          );
          continue;
        }
        await ctx.db.patch(existingPage._id, {
          pageName: p.pageName,
          accessToken: p.accessToken,
          isActive: true,
        });
      } else {
        await ctx.db.insert("metaPages", {
          orgId: args.orgId,
          pageId: p.pageId,
          pageName: p.pageName,
          accessToken: p.accessToken,
          isActive: true,
        });
      }
      pagesUpserted++;
    }

    return { pagesUpserted };
  },
});

export const upsertFormInternal = internalMutation({
  args: {
    orgId: v.id("orgs"),
    pageId: v.id("metaPages"),
    formId: v.string(),
    formName: v.optional(v.string()),
    formFields: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("metaForms")
      .withIndex("by_page_form", (q) =>
        q.eq("pageId", args.pageId).eq("formId", args.formId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        formName: args.formName,
        formFields: args.formFields,
        lastSyncAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("metaForms", {
      orgId: args.orgId,
      pageId: args.pageId,
      formId: args.formId,
      formName: args.formName,
      formFields: args.formFields,
      isActive: true,
      lastSyncAt: Date.now(),
    });
  },
});

// ══════════════════════════════════════════════════════════════════════
// WHATSAPP via VOIDFIX
// ══════════════════════════════════════════════════════════════════════

/** Status van WhatsApp-koppeling voor een workspace. */
export const getWhatsappConfig = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const cfg: Doc<"whatsappWebConfig"> | null = await ctx.db
      .query("whatsappWebConfig")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    if (!cfg) return null;
    return {
      id: cfg._id,
      sessionId: cfg.sessionId,
      phoneNumber: cfg.phoneNumber,
      isActive: cfg.isActive,
      lastSeenAt: cfg.lastSeenAt ?? null,
    };
  },
});

/**
 * Genereer (of refresh) een Voidfix QR-code voor deze workspace.
 *
 * Flow:
 *   1. Action: vraag QR op via Voidfix REST.
 *   2. Internal mutation: upsert whatsappWebConfig met sessionId (isActive=false).
 *   3. Return base64 QR + sessionId naar UI.
 *
 * Gebruikt bestaande sessionId als die er is — Voidfix gebruikt 'm dan
 * weer (handig voor re-link na timeout).
 */
export const linkWhatsapp = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<{
    success: boolean;
    qrCode?: string;
    sessionId?: string;
    expiresIn?: number;
    error?: string;
  }> => {
    const apiKey = process.env.VOIDFIX_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "VOIDFIX_API_KEY niet geconfigureerd in Convex env",
      };
    }

    // Lookup existing config (om sessionId te hergebruiken)
    const existing: { sessionId: string | null } = await ctx.runQuery(
      internal.integrations.getWhatsappConfigInternal,
      { workspaceId: args.workspaceId },
    );

    const body: Record<string, string> = {
      name: `LeadFlow Workspace ${args.workspaceId.slice(0, 8)}`,
    };
    if (existing.sessionId) {
      body.sessionId = existing.sessionId;
    }

    let qrData: {
      sessionId?: string;
      qrCode?: string;
      expiresIn?: number;
    };
    try {
      const res = await fetch(`${VOIDFIX_WA_BASE}/api/external/qr-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const json = JSON.parse(text) as {
        success?: boolean;
        data?: { sessionId?: string; qrCode?: string; expiresIn?: number };
        sessionId?: string;
        qrCode?: string;
        expiresIn?: number;
        error?: string;
        message?: string;
      };
      if (json.success === false) {
        return {
          success: false,
          error: json.error ?? json.message ?? "Voidfix gaf een fout",
        };
      }
      qrData = json.data ?? {
        sessionId: json.sessionId,
        qrCode: json.qrCode,
        expiresIn: json.expiresIn,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Voidfix onbereikbaar",
      };
    }

    if (!qrData.sessionId || !qrData.qrCode) {
      return {
        success: false,
        error: "Voidfix gaf geen sessionId/qrCode terug",
      };
    }

    await ctx.runMutation(internal.integrations.upsertWhatsappSession, {
      workspaceId: args.workspaceId,
      sessionId: qrData.sessionId,
      isActive: false,
    });

    return {
      success: true,
      qrCode: qrData.qrCode,
      sessionId: qrData.sessionId,
      expiresIn: qrData.expiresIn,
    };
  },
});

/**
 * Poll Voidfix session-status. Frontend roept dit elke ~5s na QR-genereren
 * tot isConnected=true. Update DB als status wijzigt.
 */
export const checkWhatsappStatus = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<{
    success: boolean;
    isConnected?: boolean;
    phoneNumber?: string;
    status?: string;
    error?: string;
  }> => {
    const apiKey = process.env.VOIDFIX_API_KEY;
    if (!apiKey) {
      return { success: false, error: "VOIDFIX_API_KEY niet geconfigureerd" };
    }

    const cfg: { sessionId: string | null } = await ctx.runQuery(
      internal.integrations.getWhatsappConfigInternal,
      { workspaceId: args.workspaceId },
    );
    if (!cfg.sessionId) {
      return { success: false, error: "Nog geen sessie aangemaakt" };
    }

    try {
      const res = await fetch(
        `${VOIDFIX_WA_BASE}/api/external/session-status/${encodeURIComponent(cfg.sessionId)}`,
        {
          headers: { "X-API-Key": apiKey },
        },
      );
      const text = await res.text();
      const json = JSON.parse(text) as {
        success?: boolean;
        data?: {
          isConnected?: boolean;
          phoneNumber?: string;
          status?: string;
        };
        isConnected?: boolean;
        phoneNumber?: string;
        status?: string;
        error?: string;
      };
      if (json.success === false) {
        return { success: false, error: json.error ?? "Status-call mislukt" };
      }
      const data = json.data ?? json;
      const isConnected = Boolean(data.isConnected);

      // Patch DB
      await ctx.runMutation(internal.integrations.updateWhatsappSession, {
        workspaceId: args.workspaceId,
        isActive: isConnected,
        phoneNumber: data.phoneNumber,
      });

      return {
        success: true,
        isConnected,
        phoneNumber: data.phoneNumber,
        status: data.status,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Voidfix onbereikbaar",
      };
    }
  },
});

/** Lokaal disconnecten: verwijder config-row. Voidfix-session loopt
 *  vanzelf af (timeout). */
export const disconnectWhatsapp = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const cfg = await ctx.db
      .query("whatsappWebConfig")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    if (cfg) {
      await ctx.db.delete(cfg._id);
    }
    return null;
  },
});

// Internal helpers voor whatsapp ────────────────────────────────────────

export const getWhatsappConfigInternal = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const cfg = await ctx.db
      .query("whatsappWebConfig")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    return { sessionId: cfg?.sessionId ?? null };
  },
});

export const upsertWhatsappSession = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    sessionId: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappWebConfig")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        sessionId: args.sessionId,
        isActive: args.isActive,
      });
      return existing._id;
    }
    return await ctx.db.insert("whatsappWebConfig", {
      workspaceId: args.workspaceId,
      sessionId: args.sessionId,
      phoneNumber: "",
      isActive: args.isActive,
    });
  },
});

export const updateWhatsappSession = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    isActive: v.boolean(),
    phoneNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappWebConfig")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      isActive: args.isActive,
      phoneNumber: args.phoneNumber ?? existing.phoneNumber,
      lastSeenAt: args.isActive ? Date.now() : existing.lastSeenAt,
    });
    return null;
  },
});

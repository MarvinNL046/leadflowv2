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
 * Pipelines + pipeline-stages voor het Kanban board op /crm/pipelines.
 *
 * V2 MVP-scope:
 * - Eén default pipeline per workspace ("Sales") met 5 stages
 * - Geen multi-pipeline UI yet — getDefault returnt de eerste
 * - Geen drag-drop herordening van stages — vaste set bij seed
 */

const DEFAULT_STAGES = [
  { name: "Lead", color: "#94a3b8", isWonStage: false, isLostStage: false },
  { name: "Contact", color: "#60a5fa", isWonStage: false, isLostStage: false },
  { name: "Voorstel", color: "#a78bfa", isWonStage: false, isLostStage: false },
  { name: "Gewonnen", color: "#34d399", isWonStage: true, isLostStage: false },
  { name: "Verloren", color: "#f87171", isWonStage: false, isLostStage: true },
];

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
 * Default pipeline + stages voor een workspace. Returnt {pipeline, stages}
 * gesorteerd op stage-order. Auto-seed (idempotent) als nog niets bestaat.
 */
export const getDefault = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const pipeline = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (!pipeline) return null;

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", pipeline._id))
      .collect();

    return { pipeline, stages };
  },
});

/**
 * Idempotent seed — maakt default pipeline + DEFAULT_STAGES voor deze
 * workspace als er nog geen default pipeline is. Veilig om meermaals te
 * draaien (no-op bij hit). Returnt pipelineId.
 */
export const seedDefault = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);

    const existing = await ctx.db
      .query("pipelines")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    if (existing) return { pipelineId: existing._id, created: false };

    const pipelineId = await ctx.db.insert("pipelines", {
      workspaceId: args.workspaceId,
      name: "Sales",
      isDefault: true,
    });

    for (let i = 0; i < DEFAULT_STAGES.length; i++) {
      const s = DEFAULT_STAGES[i];
      await ctx.db.insert("pipelineStages", {
        pipelineId,
        name: s.name,
        order: i,
        color: s.color,
        isWonStage: s.isWonStage,
        isLostStage: s.isLostStage,
      });
    }

    return { pipelineId, created: true };
  },
});

/** Hernoem een pipeline. Trims + non-empty check; geen unique-constraint. */
export const renamePipeline = mutation({
  args: {
    pipelineId: v.id("pipelines"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    const trimmed = args.name.trim();
    if (!trimmed) throw new Error("Naam mag niet leeg zijn");
    if (trimmed.length > 80) throw new Error("Naam mag max 80 tekens zijn");

    await ctx.db.patch(args.pipelineId, { name: trimmed });
    return null;
  },
});

/** Hernoem een stage. */
export const renameStage = mutation({
  args: {
    stageId: v.id("pipelineStages"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage niet gevonden");
    const pipeline = await ctx.db.get(stage.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    const trimmed = args.name.trim();
    if (!trimmed) throw new Error("Naam mag niet leeg zijn");
    if (trimmed.length > 50) throw new Error("Naam mag max 50 tekens zijn");

    await ctx.db.patch(args.stageId, { name: trimmed });
    return null;
  },
});

/**
 * Voeg een nieuwe stage toe aan een pipeline. Default rol = "normal"
 * (geen won/lost flag). Toevoegen vóór de eerste won/lost-stage zodat
 * actieve stages bij elkaar staan en Gewonnen/Verloren achteraan blijven.
 */
export const addStage = mutation({
  args: {
    pipelineId: v.id("pipelines"),
    name: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    const trimmed = args.name.trim();
    if (!trimmed) throw new Error("Naam mag niet leeg zijn");
    if (trimmed.length > 50) throw new Error("Naam mag max 50 tekens zijn");

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();
    if (stages.length >= 12) {
      throw new Error("Max 12 stages per pipeline");
    }

    // Insert vóór de eerste won/lost-stage zodat actieve stages bij elkaar
    // blijven. Indien geen closed-stages: append.
    const firstClosedIdx = stages.findIndex(
      (s) => s.isWonStage || s.isLostStage,
    );
    const insertAt = firstClosedIdx === -1 ? stages.length : firstClosedIdx;

    // Maak ruimte vanaf insertAt door order met +1 te bumpen.
    for (let i = stages.length - 1; i >= insertAt; i--) {
      await ctx.db.patch(stages[i]._id, { order: stages[i].order + 1 });
    }

    const id = await ctx.db.insert("pipelineStages", {
      pipelineId: args.pipelineId,
      name: trimmed,
      order: insertAt,
      color: args.color ?? "#94a3b8",
      isWonStage: false,
      isLostStage: false,
    });
    return id;
  },
});

/**
 * Verwijder een stage. Blokkeert als:
 *  - stage opportunities bevat (gebruiker moet eerst verplaatsen)
 *  - stage de enige won of enige lost-stage is (invariant: altijd 1 van elk)
 *  - stage de laatste niet-won/lost stage is (invariant: altijd ≥1 actief)
 */
export const deleteStage = mutation({
  args: { stageId: v.id("pipelineStages") },
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage niet gevonden");
    const pipeline = await ctx.db.get(stage.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    // Refuse als opps in deze stage staan.
    const oppInStage = await ctx.db
      .query("opportunities")
      .withIndex("by_workspace_stage", (q) =>
        q.eq("workspaceId", pipeline.workspaceId).eq("stageId", args.stageId),
      )
      .first();
    if (oppInStage) {
      throw new Error(
        "Stage bevat nog opportunities — verplaats die eerst naar een andere stage",
      );
    }

    const siblings = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", stage.pipelineId))
      .collect();

    if (stage.isWonStage) {
      const otherWon = siblings.find(
        (s) => s._id !== stage._id && s.isWonStage,
      );
      if (!otherWon) {
        throw new Error(
          "Markeer eerst een andere stage als Gewonnen voor je deze verwijdert",
        );
      }
    }
    if (stage.isLostStage) {
      const otherLost = siblings.find(
        (s) => s._id !== stage._id && s.isLostStage,
      );
      if (!otherLost) {
        throw new Error(
          "Markeer eerst een andere stage als Verloren voor je deze verwijdert",
        );
      }
    }
    if (!stage.isWonStage && !stage.isLostStage) {
      const otherActive = siblings.find(
        (s) => s._id !== stage._id && !s.isWonStage && !s.isLostStage,
      );
      if (!otherActive) {
        throw new Error("Pipeline moet minstens één actieve stage hebben");
      }
    }

    await ctx.db.delete(args.stageId);

    // Compact orders zodat er geen gat ontstaat — voorkomt verwarrende
    // sorteervolgorde later.
    const remaining = siblings
      .filter((s) => s._id !== stage._id)
      .sort((a, b) => a.order - b.order);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) {
        await ctx.db.patch(remaining[i]._id, { order: i });
      }
    }
    return null;
  },
});

/**
 * Bulk-update stage-volgorde. Verifieert dat alle stages bij dezelfde
 * pipeline horen en dat de gegeven lijst exact alle stages van die
 * pipeline bevat.
 */
export const reorderStages = mutation({
  args: {
    pipelineId: v.id("pipelines"),
    stageIds: v.array(v.id("pipelineStages")),
  },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();
    if (stages.length !== args.stageIds.length) {
      throw new Error("Stage-lijst onvolledig");
    }
    const knownIds = new Set(stages.map((s) => s._id));
    for (const id of args.stageIds) {
      if (!knownIds.has(id)) {
        throw new Error("Stage hoort niet bij deze pipeline");
      }
    }

    for (let i = 0; i < args.stageIds.length; i++) {
      const current = stages.find((s) => s._id === args.stageIds[i])!;
      if (current.order !== i) {
        await ctx.db.patch(args.stageIds[i], { order: i });
      }
    }
    return null;
  },
});

/** Update de kleur van een stage. */
export const updateStageColor = mutation({
  args: {
    stageId: v.id("pipelineStages"),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage niet gevonden");
    const pipeline = await ctx.db.get(stage.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    // Hex-validatie: #rgb, #rrggbb of #rrggbbaa.
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(args.color)) {
      throw new Error("Ongeldige kleurcode");
    }

    await ctx.db.patch(args.stageId, { color: args.color });
    return null;
  },
});

/**
 * Zet de rol van een stage: "normal" / "won" / "lost". Bij won/lost
 * krijgt de huidige drager automatisch "normal" — er is dus altijd
 * exact één isWonStage en één isLostStage stage per pipeline.
 *
 * "normal" wordt geweigerd als deze stage de enige won/lost-stage is
 * (gebruik dan eerst setStageRole op een andere stage).
 */
export const setStageRole = mutation({
  args: {
    stageId: v.id("pipelineStages"),
    role: v.union(
      v.literal("normal"),
      v.literal("won"),
      v.literal("lost"),
    ),
  },
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage niet gevonden");
    const pipeline = await ctx.db.get(stage.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);

    const siblings = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", stage.pipelineId))
      .collect();

    const currentRole: "normal" | "won" | "lost" = stage.isWonStage
      ? "won"
      : stage.isLostStage
        ? "lost"
        : "normal";
    if (currentRole === args.role) return null;

    // Weiger naar "normal" terug als deze stage de enige drager is + er
    // bovendien opps in zitten die afhangen van closedAt-semantiek.
    if (args.role === "normal") {
      if (stage.isWonStage) {
        const otherWon = siblings.find(
          (s) => s._id !== stage._id && s.isWonStage,
        );
        if (!otherWon) {
          throw new Error(
            "Markeer eerst een andere stage als Gewonnen — pipeline moet één Gewonnen-stage hebben",
          );
        }
      }
      if (stage.isLostStage) {
        const otherLost = siblings.find(
          (s) => s._id !== stage._id && s.isLostStage,
        );
        if (!otherLost) {
          throw new Error(
            "Markeer eerst een andere stage als Verloren — pipeline moet één Verloren-stage hebben",
          );
        }
      }
      await ctx.db.patch(args.stageId, {
        isWonStage: false,
        isLostStage: false,
      });
      return null;
    }

    // Zet huidige drager(s) van de nieuwe rol op normal.
    if (args.role === "won") {
      for (const s of siblings) {
        if (s._id !== stage._id && s.isWonStage) {
          await ctx.db.patch(s._id, { isWonStage: false });
        }
      }
      await ctx.db.patch(args.stageId, {
        isWonStage: true,
        isLostStage: false,
      });
    } else {
      for (const s of siblings) {
        if (s._id !== stage._id && s.isLostStage) {
          await ctx.db.patch(s._id, { isLostStage: false });
        }
      }
      await ctx.db.patch(args.stageId, {
        isWonStage: false,
        isLostStage: true,
      });
    }

    // Invariant-check achteraf: er moet nog ≥1 actieve (non-won/lost)
    // stage zijn, anders heeft de gebruiker zojuist de laatste normal
    // gepromoveerd. Rollback door deze mutation te laten throwen — patches
    // in dezelfde transactie worden teruggedraaid door Convex.
    const updated = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline_order", (q) => q.eq("pipelineId", stage.pipelineId))
      .collect();
    const hasActive = updated.some(
      (s) => !s.isWonStage && !s.isLostStage,
    );
    if (!hasActive) {
      throw new Error(
        "Pipeline moet minstens één actieve stage hebben (zonder Gewonnen/Verloren-vlag)",
      );
    }
    return null;
  },
});

/**
 * Zet de "vasthouden bij follow-up"-vlag op een stage: de follow-up-cron zet
 * opps in deze stage dan NIET auto terug naar Nieuw. Alleen voor actieve
 * stages (Gewonnen/Verloren bewegen sowieso niet).
 */
export const setStageNoResurface = mutation({
  args: { stageId: v.id("pipelineStages"), value: v.boolean() },
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage niet gevonden");
    const pipeline = await ctx.db.get(stage.pipelineId);
    if (!pipeline) throw new Error("Pipeline niet gevonden");
    await requireWorkspaceMembership(ctx, pipeline.workspaceId);
    if (stage.isWonStage || stage.isLostStage) {
      throw new Error(
        "Alleen actieve stages kunnen worden vastgehouden (niet Gewonnen/Verloren)",
      );
    }
    await ctx.db.patch(args.stageId, { noResurface: args.value });
    return null;
  },
});

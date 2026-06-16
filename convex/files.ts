import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Genereer een korte-levensduur upload-URL (Convex storage). Auth vereist. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Resolve een geüploade storageId naar een publiek-bereikbare URL (voor in de mail). */
export const resolveStorageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Upload niet gevonden");
    return url;
  },
});

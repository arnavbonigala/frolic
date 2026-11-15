import { v } from "convex/values";
import { internalMutation } from "../../../convex/_generated/server";

export const addSnapAs = internalMutation({
  args: { userId: v.id("users"), frolicId: v.id("frolics"), storageId: v.id("_storage"), takenAt: v.number() },
  handler: async (ctx, args) => {
    const frolic = await ctx.db.get("frolics", args.frolicId);
    if (!frolic?.snapAt) throw new Error("snap window closed");
    await ctx.db.insert("snaps", { ...args, groupId: frolic.groupId, snapAt: frolic.snapAt });
    return null;
  },
});

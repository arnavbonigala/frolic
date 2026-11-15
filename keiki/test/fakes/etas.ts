import { v } from "convex/values";
import { internalMutation } from "../../../convex/_generated/server";

export const setEtaAs = internalMutation({
  args: { userId: v.id("users"), frolicId: v.id("frolics"), minutes: v.number(), onTheWay: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("etas").withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", args.frolicId).eq("userId", args.userId)).unique();
    if (existing) await ctx.db.patch("etas", existing._id, { minutes: args.minutes, onTheWay: args.onTheWay, updatedAt: Date.now() });
    else await ctx.db.insert("etas", { ...args, updatedAt: Date.now() });
    return null;
  },
});

import { v } from "convex/values";
import { internalMutation } from "../../../convex/_generated/server";

export const checkInAs = internalMutation({
  args: { userId: v.id("users"), frolicId: v.id("frolics"), method: v.string() },
  handler: async (ctx, { userId, frolicId }) => {
    const existing = await ctx.db.query("checkins").withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId)).unique();
    if (!existing) await ctx.db.insert("checkins", { frolicId, userId, method: "imessage", at: Date.now() });
    return null;
  },
});

import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireMember, userFromToken } from "./lib/identity";

export const addMine = mutation({
  args: { deviceToken: v.string(), groupId: v.id("groups"), tags: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { deviceToken, groupId, tags }) => {
    if (tags.length > 12 || tags.some((tag) => tag.length < 1 || tag.length > 40)) {
      throw new ConvexError({ code: "BAD_TAGS", message: "Too many tags" });
    }
    const user = await userFromToken(ctx, deviceToken);
    await requireMember(ctx, groupId, user._id);
    const row = await ctx.db
      .query("tasteProfiles")
      .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
      .unique();
    const merged = [...new Set([...(row?.tags ?? []), ...tags])].slice(-24);
    if (row) {
      await ctx.db.patch(row._id, { tags: merged, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("tasteProfiles", { groupId, tags: merged, updatedAt: Date.now() });
    }
    return null;
  },
});

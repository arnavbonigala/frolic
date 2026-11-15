import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireMember, userFromToken } from "../lib/identity";
import { crewLines } from "./lines";

export const crewMemoryLines = query({
  args: { deviceToken: v.string(), groupId: v.id("groups") },
  returns: v.object({ lines: v.array(v.string()) }),
  handler: async (ctx, { deviceToken, groupId }) => {
    const user = await userFromToken(ctx, deviceToken);
    await requireMember(ctx, groupId, user._id);
    const rows = await ctx.db.query("memoryTagStats").withIndex("by_groupId_and_tag", (q) => q.eq("groupId", groupId)).take(200);
    return { lines: crewLines(rows.map((r) => ({ tag: r.tag, liked: r.liked, skipped: r.skipped }))) };
  },
});

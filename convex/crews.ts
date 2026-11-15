import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { dayIn, face, facesOf, memberCrews } from "./lib/crews";
import { userFromToken } from "./lib/identity";

async function unansweredToday(
  ctx: QueryCtx,
  group: Doc<"groups">,
  userId: Id<"users">,
): Promise<boolean> {
  const open = await ctx.db
    .query("frolics")
    .withIndex("by_groupId_and_status_and_day", (q) =>
      q.eq("groupId", group._id).eq("status", "open").eq("day", dayIn(group.timezone, Date.now())),
    )
    .take(3);
  for (const frolic of open) {
    const tap = await ctx.db
      .query("taps")
      .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolic._id).eq("userId", userId))
      .unique();
    if (!tap) return true;
  }
  return false;
}

export const mine = query({
  args: { deviceToken: v.string() },
  returns: v.array(
    v.object({
      groupId: v.id("groups"),
      name: v.string(),
      memberCount: v.number(),
      members: v.array(face),
      planOpen: v.boolean(),
    }),
  ),
  handler: async (ctx, { deviceToken }) => {
    const user = await userFromToken(ctx, deviceToken);
    const crews = await memberCrews(ctx, user._id);
    const out = [];
    for (const { group } of crews) {
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_groupId", (q) => q.eq("groupId", group._id))
        .take(100);
      const members = await facesOf(ctx, memberships, user._id);
      out.push({
        groupId: group._id,
        name: group.name,
        memberCount: members.length,
        members,
        planOpen: await unansweredToday(ctx, group, user._id),
      });
    }
    return out;
  },
});

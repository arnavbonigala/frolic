import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export function dayIn(timezone: string, at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export const closeMemoryDay = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("groups").paginate({ numItems: 100, cursor: args.cursor ?? null });
    const yesterday = Date.now() - 12 * 60 * 60 * 1000;
    for (const group of page.page) {
      await ctx.scheduler.runAfter(0, internal.memory.stats.closeDay, {
        groupId: group._id,
        day: dayIn(group.timezone, yesterday),
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.daily.closeMemoryDay, { cursor: page.continueCursor });
    }
    return null;
  },
});

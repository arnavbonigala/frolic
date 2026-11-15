import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation } from "../../_generated/server";

export const stampNow = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      1500,
      makeFunctionReference<"mutation">("qa/matcher/clockFixture:mark"),
      {},
    );
    return Date.now();
  },
});

export const mark = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await ctx.db.query("users").first();
    if (user === null) return null;
    await ctx.db.insert("availability", {
      groupId: (await ctx.db.query("groups").first())!._id,
      userId: user._id,
      day: "qa-clock",
      state: "window",
      updatedAt: Date.now(),
    });
    return null;
  },
});

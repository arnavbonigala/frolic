import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalQuery } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";

const planAmountRef = makeFunctionReference<"query", { frolicId: Id<"frolics"> }, number | null>(
  "whop/links:planAmount",
);

export const planAmount = internalQuery({
  args: { frolicId: v.id("frolics") },
  handler: async (ctx, { frolicId }) => {
    const plan = await ctx.db
      .query("whopPlans")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
      .first();
    return plan?.amountCents ?? null;
  },
});

export const checkoutLink = internalAction({
  args: { userId: v.id("users"), frolicId: v.id("frolics") },
  handler: async (ctx, { userId, frolicId }) => {
    const amountCents = await ctx.runQuery(planAmountRef, { frolicId });
    if (amountCents === null) return null;
    return { url: "https://whop.com/checkout/test_" + frolicId + "_" + userId, amountCents };
  },
});

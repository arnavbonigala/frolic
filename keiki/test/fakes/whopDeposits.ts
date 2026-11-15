import { v } from "convex/values";
import { internalAction } from "../../../convex/_generated/server";

export const checkoutLinkFor = internalAction({
  args: { userId: v.id("users"), frolicId: v.id("frolics") },
  handler: async (_ctx, { userId, frolicId }) => ({ url: "https://whop.com/checkout/test_" + frolicId + "_" + userId, amountCents: 500 }),
});

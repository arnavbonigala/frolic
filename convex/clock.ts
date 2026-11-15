import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const now = mutation({
  args: {},
  returns: v.number(),
  handler: async () => Date.now(),
});

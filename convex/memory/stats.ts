import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const closeDay = internalMutation({
  args: { groupId: v.id("groups"), day: v.string() },
  handler: async () => ({ counted: [] as string[] }),
});

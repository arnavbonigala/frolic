import { v } from "convex/values";
import { internalMutation } from "../../../convex/_generated/server";

export const recordEvent = internalMutation({
  args: { eventKey: v.string(), kind: v.string(), groupId: v.id("groups"), userId: v.optional(v.id("users")), payload: v.any() },
  handler: async () => null,
});

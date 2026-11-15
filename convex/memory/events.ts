import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const recordEvent = internalMutation({
  args: {
    eventKey: v.string(),
    kind: v.union(
      v.literal("tap"),
      v.literal("only_if"),
      v.literal("skip"),
      v.literal("limit"),
      v.literal("plan_shown"),
      v.literal("reveal"),
      v.literal("checkin"),
      v.literal("snap"),
      v.literal("group_skip"),
    ),
    groupId: v.id("groups"),
    userId: v.optional(v.id("users")),
    frolicId: v.optional(v.id("frolics")),
    payload: v.any(),
    revealAt: v.optional(v.number()),
    source: v.optional(v.union(v.literal("app"), v.literal("web"), v.literal("notification"), v.literal("imessage"))),
  },
  handler: async () => null,
});

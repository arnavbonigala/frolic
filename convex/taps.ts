import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { applyTap } from "./lib/core";
import { userFromToken } from "./lib/identity";
import { tapKind, tapSource, timeWindow } from "./schema";

export const tap = mutation({
  args: {
    deviceToken: v.string(),
    frolicId: v.id("frolics"),
    kind: tapKind,
    onlyIf: v.optional(v.array(v.id("users"))),
    window: v.optional(timeWindow),
    source: v.optional(v.union(v.literal("app"), v.literal("notification"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    return await applyTap(ctx, user._id, {
      frolicId: args.frolicId,
      kind: args.kind,
      onlyIf: args.onlyIf,
      window: args.window,
      source: args.source ?? "app",
    });
  },
});

export const tapAs = internalMutation({
  args: {
    userId: v.id("users"),
    frolicId: v.id("frolics"),
    kind: tapKind,
    onlyIf: v.optional(v.array(v.id("users"))),
    window: v.optional(timeWindow),
    source: tapSource,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await applyTap(ctx, args.userId, {
      frolicId: args.frolicId,
      kind: args.kind,
      onlyIf: args.onlyIf,
      window: args.window,
      source: args.source,
    });
  },
});

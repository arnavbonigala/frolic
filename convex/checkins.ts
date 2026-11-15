import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { findAttendee, getFrolic } from "./lib/core";
import { userFromToken } from "./lib/identity";

const method = v.union(v.literal("geofence"), v.literal("manual"), v.literal("imessage"));

async function checkIn(
  ctx: MutationCtx,
  userId: Id<"users">,
  frolicId: Id<"frolics">,
  how: "geofence" | "manual" | "imessage",
): Promise<Id<"checkins">> {
  const frolic = await getFrolic(ctx, frolicId);
  const attendee = await findAttendee(ctx, frolicId, userId);
  if (frolic.status !== "on" || attendee?.status !== "going") {
    throw new ConvexError({ code: "NOT_GOING", message: "Check in is for people going" });
  }
  const existing = await ctx.db
    .query("checkins")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("checkins", { frolicId, userId, method: how, at: Date.now() });
}

export const checkInMe = mutation({
  args: { deviceToken: v.string(), frolicId: v.id("frolics"), method: v.union(v.literal("geofence"), v.literal("manual")) },
  returns: v.id("checkins"),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    return await checkIn(ctx, user._id, args.frolicId, args.method);
  },
});

export const checkInAs = internalMutation({
  args: { userId: v.id("users"), frolicId: v.id("frolics"), method },
  returns: v.id("checkins"),
  handler: async (ctx, args) => await checkIn(ctx, args.userId, args.frolicId, args.method),
});

import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { findAttendee, getFrolic } from "./lib/core";
import { requireMember, userFromToken } from "./lib/identity";

async function setEta(
  ctx: MutationCtx,
  userId: Id<"users">,
  frolicId: Id<"frolics">,
  minutes: number,
  onTheWay: boolean,
): Promise<null> {
  const frolic = await getFrolic(ctx, frolicId);
  const attendee = await findAttendee(ctx, frolicId, userId);
  if (frolic.status !== "on" || attendee?.status !== "going") {
    throw new ConvexError({ code: "NOT_GOING", message: "On my way is for people going" });
  }
  if (!(minutes >= 0 && minutes <= 600)) {
    throw new ConvexError({ code: "BAD_MINUTES", message: "Minutes away is out of range" });
  }
  const fields = { minutes: Math.round(minutes), onTheWay, updatedAt: Date.now() };
  const existing = await ctx.db
    .query("etas")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .unique();
  if (existing) await ctx.db.patch("etas", existing._id, fields);
  else await ctx.db.insert("etas", { frolicId, userId, ...fields });
  return null;
}

export const setMine = mutation({
  args: { deviceToken: v.string(), frolicId: v.id("frolics"), minutes: v.number(), onTheWay: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    return await setEta(ctx, user._id, args.frolicId, args.minutes, args.onTheWay);
  },
});

export const setEtaAs = internalMutation({
  args: { userId: v.id("users"), frolicId: v.id("frolics"), minutes: v.number(), onTheWay: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => await setEta(ctx, args.userId, args.frolicId, args.minutes, args.onTheWay),
});

export const forFrolic = query({
  args: { deviceToken: v.string(), frolicId: v.id("frolics") },
  returns: v.array(v.object({ userId: v.id("users"), minutes: v.number(), onTheWay: v.boolean(), updatedAt: v.number() })),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    const frolic = await ctx.db.get("frolics", args.frolicId);
    if (!frolic) return [];
    await requireMember(ctx, frolic.groupId, user._id);
    if (frolic.status !== "on") return [];
    const rows = await ctx.db.query("etas").withIndex("by_frolicId", (q) => q.eq("frolicId", args.frolicId)).take(100);
    return rows.map((r) => ({ userId: r.userId, minutes: r.minutes, onTheWay: r.onTheWay, updatedAt: r.updatedAt }));
  },
});

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { findAttendee, getFrolic } from "./lib/core";
import { requireMember, userFromToken } from "./lib/identity";

export const SNAP_COUNTDOWN_MS = 3000;
export const SNAP_WINDOW_MS = 2 * 60 * 1000;

async function startSnap(ctx: MutationCtx, userId: Id<"users">, frolicId: Id<"frolics">): Promise<number> {
  const frolic = await getFrolic(ctx, frolicId);
  const attendee = await findAttendee(ctx, frolicId, userId);
  if (frolic.status !== "on" || attendee?.status !== "going") {
    throw new ConvexError({ code: "NOT_GOING", message: "The group snap is for people going" });
  }
  const now = Date.now();
  if (frolic.snapAt !== undefined && now < frolic.snapAt + SNAP_WINDOW_MS) return frolic.snapAt;
  const snapAt = now + SNAP_COUNTDOWN_MS;
  await ctx.db.patch("frolics", frolicId, { snapAt });
  await ctx.runMutation(internal.keiki.outbound.onSnapWindow, { frolicId, snapAt });
  return snapAt;
}

async function addSnap(
  ctx: MutationCtx,
  userId: Id<"users">,
  frolicId: Id<"frolics">,
  storageId: Id<"_storage">,
  takenAt: number,
): Promise<null> {
  const frolic = await getFrolic(ctx, frolicId);
  const checkin = await ctx.db
    .query("checkins")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .unique();
  if (!checkin) throw new ConvexError({ code: "NOT_CHECKED_IN", message: "Check in first" });
  const snapAt = frolic.snapAt;
  const now = Date.now();
  if (snapAt === undefined || now < snapAt - 1000 || now > snapAt + SNAP_WINDOW_MS) {
    throw new ConvexError({ code: "NO_SNAP_WINDOW", message: "The snap window is closed" });
  }
  const existing = await ctx.db
    .query("snaps")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .take(20);
  const same = existing.find((s) => s.snapAt === snapAt);
  if (same) await ctx.db.patch("snaps", same._id, { storageId, takenAt });
  else await ctx.db.insert("snaps", { frolicId, groupId: frolic.groupId, userId, storageId, snapAt, takenAt });
  return null;
}

export const start = mutation({
  args: { deviceToken: v.string(), frolicId: v.id("frolics") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    return await startSnap(ctx, user._id, args.frolicId);
  },
});

export const addMine = mutation({
  args: { deviceToken: v.string(), frolicId: v.id("frolics"), storageId: v.id("_storage"), takenAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    return await addSnap(ctx, user._id, args.frolicId, args.storageId, args.takenAt);
  },
});

export const addSnapAs = internalMutation({
  args: { userId: v.id("users"), frolicId: v.id("frolics"), storageId: v.id("_storage"), takenAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => await addSnap(ctx, args.userId, args.frolicId, args.storageId, args.takenAt),
});

export const forFrolic = query({
  args: { deviceToken: v.string(), frolicId: v.id("frolics") },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      url: v.union(v.string(), v.null()),
      takenAt: v.number(),
      mine: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    const frolic = await ctx.db.get("frolics", args.frolicId);
    if (!frolic) throw new ConvexError({ code: "NOT_FOUND", message: "This frolic is gone" });
    await requireMember(ctx, frolic.groupId, user._id);
    const rows = await ctx.db
      .query("snaps")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", args.frolicId))
      .take(50);
    const mine = rows.find((row) => row.userId === user._id);
    if (!mine) return [];
    const sameWindow = rows.filter((row) => row.snapAt === mine.snapAt);
    const out = [];
    for (const row of sameWindow) {
      out.push({
        userId: row.userId,
        url: await ctx.storage.getUrl(row.storageId),
        takenAt: row.takenAt,
        mine: row.userId === user._id,
      });
    }
    return out;
  },
});

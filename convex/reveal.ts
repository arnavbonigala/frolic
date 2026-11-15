import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { LEAVE_NUDGE_MS, deleteTaps } from "./lib/core";

export const flip = internalMutation({
  args: { frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, { frolicId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    const pending = await ctx.db
      .query("reveals")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
      .unique();
    if (!frolic || !pending || frolic.status !== "open") return null;
    const flippedAt = Date.now();
    const endsAt = pending.startsAt + frolic.durationMinutes * 60 * 1000;
    for (const userId of pending.userIds) {
      await ctx.db.insert("attendees", {
        frolicId,
        groupId: frolic.groupId,
        userId,
        role: "matched",
        status: "going",
        revealAt: pending.revealAt,
        bloomAt: pending.bloomAt,
      });
      await ctx.db.insert("revealLog", {
        frolicId,
        groupId: frolic.groupId,
        userId,
        revealAt: pending.revealAt,
        bloomAt: pending.bloomAt,
        flippedAt,
      });
    }
    await ctx.db.patch("frolics", frolicId, {
      status: "on",
      matchedAt: pending.matchedAt,
      revealAt: pending.revealAt,
      bloomAt: pending.bloomAt,
      startsAt: pending.startsAt,
      endsAt,
    });
    await ctx.db.delete("reveals", pending._id);
    await ctx.scheduler.runAfter(0, internal.keiki.outbound.onReveal, {
      frolicId,
      userIds: pending.userIds,
      bloomAt: pending.bloomAt,
    });
    const leaveAt = pending.startsAt - LEAVE_NUDGE_MS;
    if (leaveAt > Date.now()) {
      await ctx.scheduler.runAt(leaveAt, internal.keiki.outbound.onLeaveNudge, {
        frolicId,
        leaveAt,
      });
    }
    await ctx.scheduler.runAt(endsAt, internal.reveal.complete, { frolicId });
    return null;
  },
});

export const fade = internalMutation({
  args: { frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, { frolicId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    if (!frolic || frolic.status !== "open") return null;
    const pending = await ctx.db
      .query("reveals")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
      .unique();
    if (pending) return null;
    await deleteTaps(ctx, frolicId);
    await ctx.db.patch("frolics", frolicId, { status: "faded" });
    return null;
  },
});

export const complete = internalMutation({
  args: { frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, { frolicId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    if (!frolic || frolic.status !== "on") return null;
    await deleteTaps(ctx, frolicId);
    const waiting = await ctx.db
      .query("hopIns")
      .withIndex("by_frolicId_and_status", (q) =>
        q.eq("frolicId", frolicId).eq("status", "waiting"),
      )
      .take(200);
    for (const h of waiting) await ctx.db.patch("hopIns", h._id, { status: "left" });
    await ctx.db.patch("frolics", frolicId, { status: "done" });
    return null;
  },
});

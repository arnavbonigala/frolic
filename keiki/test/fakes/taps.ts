import { v } from "convex/values";
import { internalMutation } from "../../../convex/_generated/server";
import { internal } from "../../../convex/_generated/api";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";

const revealRef = makeFunctionReference<"mutation", { frolicId: Id<"frolics"> }, null>("taps:revealFake");

export const tapAs = internalMutation({
  args: {
    userId: v.id("users"),
    frolicId: v.id("frolics"),
    kind: v.union(v.literal("down"), v.literal("notToday")),
    onlyIf: v.optional(v.array(v.id("users"))),
    window: v.optional(v.object({ start: v.number(), end: v.number() })),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const frolic = await ctx.db.get("frolics", args.frolicId);
    if (!frolic) throw new Error("no frolic");
    const existing = await ctx.db
      .query("taps")
      .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", args.frolicId).eq("userId", args.userId))
      .unique();
    const row = {
      frolicId: args.frolicId,
      groupId: frolic.groupId,
      userId: args.userId,
      kind: args.kind,
      onlyIf: args.onlyIf ?? [],
      window: args.window,
      source: args.source as "imessage",
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.replace("taps", existing._id, row);
    else await ctx.db.insert("taps", row);
    if (frolic.status !== "open") return null;
    const taps = (await ctx.db.query("taps").withIndex("by_frolicId", (q) => q.eq("frolicId", args.frolicId)).take(64)).filter((t) => t.kind === "down");
    let set = taps;
    for (let changed = true; changed; ) {
      const ids = new Set(set.map((t) => t.userId));
      const next = set.filter((t) => t.onlyIf.every((id) => ids.has(id)));
      changed = next.length !== set.length;
      set = next;
    }
    if (set.length < 2) return null;
    const revealAt = Date.now() + 1500;
    await ctx.db.patch("frolics", args.frolicId, { status: "matched", matchedAt: Date.now(), revealAt, bloomAt: revealAt });
    for (const t of set) {
      await ctx.db.insert("attendees", { frolicId: args.frolicId, groupId: frolic.groupId, userId: t.userId, role: "matched", status: "going", revealAt, bloomAt: revealAt });
    }
    await ctx.scheduler.runAt(revealAt, revealRef, { frolicId: args.frolicId });
    return null;
  },
});

export const revealFake = internalMutation({
  args: { frolicId: v.id("frolics") },
  handler: async (ctx, { frolicId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    if (!frolic || frolic.revealAt === undefined) return null;
    await ctx.db.patch("frolics", frolicId, { status: "on" });
    const attendees = await ctx.db.query("attendees").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(64);
    await ctx.runMutation(internal.keiki.outbound.onReveal, { frolicId, userIds: attendees.map((a) => a.userId), bloomAt: frolic.revealAt });
    return null;
  },
});

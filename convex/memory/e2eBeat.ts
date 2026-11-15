import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

const HOUR = 60 * 60 * 1000;

export const skipBobaTwice = internalMutation({
  args: { run: v.string() },
  returns: v.union(v.null(), v.object({ suppressed: v.array(v.string()), days: v.array(v.string()) })),
  handler: async (ctx, { run }) => {
    const group = await ctx.db.query("groups").withIndex("by_e2eRun", (q) => q.eq("e2eRun", run)).first();
    if (!group) return null;
    const boba = (await ctx.db.query("places").withIndex("by_slug", (q) => q.eq("slug", "plentea")).take(1))[0];
    if (!boba) return null;
    const members = await ctx.db.query("memberships").withIndex("by_groupId", (q) => q.eq("groupId", group._id)).take(20);
    const now = Date.now();
    const days: string[] = [];
    for (const [i, day] of ["2026-11-01", "2026-11-02"].entries()) {
      const planId = await ctx.db.insert("plans", {
        groupId: group._id, day, kind: "daily", placeId: boba._id, title: "Boba at Plentea", line: "Open till 11.", cost: 8,
        startsAt: now - (48 - i * 24) * HOUR, durationMinutes: 30, source: "scorer", generatedAt: now, costLabel: "About $8 a tea",
        payUpFront: false, chips: [], whySource: "template", whyInputs: { placeName: "Plentea", topTags: ["boba"], rainSwap: false }, weatherSwap: false,
      });
      const frolicId = await ctx.db.insert("frolics", {
        groupId: group._id, day, kind: "daily", planId, status: "faded", window: { start: now - 50 * HOUR, end: now - 40 * HOUR },
        durationMinutes: 30, deadline: now - 40 * HOUR,
      });
      for (const m of members) {
        await ctx.runMutation(internal.memory.events.recordEvent, {
          eventKey: "e2e:skip:" + run + ":" + day + ":" + m.userId,
          kind: "skip",
          groupId: group._id,
          userId: m.userId,
          frolicId,
          source: "notification",
          payload: { title: "Boba at Plentea", tags: ["boba"], day },
        });
      }
      await ctx.runMutation(internal.memory.stats.closeDay, { groupId: group._id, day });
      days.push(day);
    }
    const stats = await ctx.db.query("memoryTagStats").withIndex("by_groupId_and_tag", (q) => q.eq("groupId", group._id)).take(50);
    return { suppressed: stats.filter((s) => s.skipped >= 2).map((s) => s.tag), days };
  },
});

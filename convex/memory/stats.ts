import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { bumpTagStat, enqueue, invalidateContext } from "./events";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const skippedBy = async (ctx: MutationCtx, groupId: Id<"groups">, day: string): Promise<Set<string>> => {
  const latest = new Map<string, { at: number; skipped: boolean }>();
  for (const kind of ["skip", "tap", "only_if"] as const) {
    const events = await ctx.db.query("memoryEvents").withIndex("by_groupId_and_kind", (q) => q.eq("groupId", groupId).eq("kind", kind)).order("desc").take(500);
    for (const e of events) {
      if (e.payload?.day !== day || !e.userId) continue;
      const seen = latest.get(e.userId);
      if (!seen || e._creationTime >= seen.at) latest.set(e.userId, { at: e._creationTime, skipped: kind === "skip" });
    }
  }
  return new Set([...latest].filter(([, v]) => v.skipped).map(([userId]) => userId));
};

const dayTags = async (ctx: MutationCtx, groupId: Id<"groups">, day: string): Promise<{ tags: string[]; revealed: boolean }> => {
  const frolics = await ctx.db.query("frolics").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day)).take(10);
  const tags = new Set<string>();
  let revealed = false;
  for (const frolic of frolics) {
    if (frolic.revealAt !== undefined || frolic.status === "on" || frolic.status === "done") revealed = true;
    const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
    if (!plan) continue;
    const place = await ctx.db.get("places", plan.placeId);
    if (place?.tags[0]) tags.add(place.tags[0].toLowerCase());
  }
  if (tags.size === 0) {
    const plans = await ctx.db.query("plans").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day)).take(10);
    for (const plan of plans) {
      const place = await ctx.db.get("places", plan.placeId);
      if (place?.tags[0]) tags.add(place.tags[0].toLowerCase());
    }
  }
  return { tags: [...tags], revealed };
};

export const MIN_SKIPPERS = 2;

export const closeDay = internalMutation({
  args: { groupId: v.id("groups"), day: v.string() },
  handler: async (ctx, { groupId, day }) => {
    const { tags, revealed } = await dayTags(ctx, groupId, day);
    if (tags.length === 0 || revealed) return { counted: [] as string[] };
    const skippers = await skippedBy(ctx, groupId, day);
    if (skippers.size < MIN_SKIPPERS) return { counted: [] as string[] };
    const counted: string[] = [];
    for (const tag of tags) {
      const row = await ctx.db.query("memoryTagStats").withIndex("by_groupId_and_tag", (q) => q.eq("groupId", groupId).eq("tag", tag)).unique();
      if (row?.lastSkipDay === day) continue;
      const count = await bumpTagStat(ctx, groupId, tag, "skipped", day);
      await enqueue(ctx, { eventKey: "group_skip:" + groupId + ":" + day + ":" + tag, kind: "group_skip", groupId, payload: { tag, count, day } });
      counted.push(tag);
    }
    await invalidateContext(ctx, groupId);
    return { counted };
  },
});

export const tagStats = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const rows = await ctx.db.query("memoryTagStats").withIndex("by_groupId_and_tag", (q) => q.eq("groupId", groupId)).take(200);
    return rows.map((r) => ({ tag: r.tag, liked: r.liked, skipped: r.skipped }));
  },
});

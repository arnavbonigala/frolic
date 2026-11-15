import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { bumpTagStat, enqueue, invalidateContext } from "./events";

const tagsOf = (payload: unknown): string[] => {
  const t = (payload as { tags?: unknown } | null)?.tags;
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
};

export const closeDay = internalMutation({
  args: { groupId: v.id("groups"), day: v.string() },
  handler: async (ctx, { groupId, day }) => {
    const onDay = async (kind: "plan_shown" | "reveal" | "skip") =>
      (await ctx.db.query("memoryEvents").withIndex("by_groupId_and_kind", (q) => q.eq("groupId", groupId).eq("kind", kind)).order("desc").take(200)).filter((e) => e.payload?.day === day);
    const shown = await onDay("plan_shown");
    if (shown.length === 0) return { counted: [] as string[] };
    if ((await onDay("reveal")).length > 0) return { counted: [] as string[] };
    if ((await onDay("skip")).length === 0) return { counted: [] as string[] };
    const counted: string[] = [];
    for (const tag of new Set(shown.flatMap((e) => tagsOf(e.payload)).map((t) => t.toLowerCase()))) {
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

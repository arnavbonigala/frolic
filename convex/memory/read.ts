import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getClient } from "./ingest";
import { buildContext, buildTaste, findWhyThis, type MemoryContext, type TasteProfile, type WhyThis } from "./context";
import { templateTaste, validateTasteLine, type TasteLine } from "./taste";
import { groupNamespace } from "./mapping";

export const cached = internalQuery({
  args: { groupId: v.id("groups"), day: v.string() },
  handler: async (ctx, { groupId, day }) => {
    const row = await ctx.db.query("memoryContextCache").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day)).unique();
    return row ? (row.context as MemoryContext) : null;
  },
});

export const saveCache = internalMutation({
  args: { groupId: v.id("groups"), day: v.string(), context: v.any() },
  handler: async (ctx, { groupId, day, context }) => {
    const row = await ctx.db.query("memoryContextCache").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day)).unique();
    if (row) await ctx.db.patch("memoryContextCache", row._id, { context, builtAt: Date.now() });
    else await ctx.db.insert("memoryContextCache", { groupId, day, context, builtAt: Date.now() });
    return null;
  },
});

export const getMemoryContext = internalAction({
  args: { groupId: v.id("groups"), day: v.string() },
  handler: async (ctx, { groupId, day }): Promise<MemoryContext> => {
    const hit = await ctx.runQuery(internal.memory.read.cached, { groupId, day });
    if (hit) return hit;
    const stats = await ctx.runQuery(internal.memory.stats.tagStats, { groupId });
    const context = await buildContext(getClient(), groupNamespace(groupId), stats);
    await ctx.runMutation(internal.memory.read.saveCache, { groupId, day, context });
    return context;
  },
});

export const whyThis = internalAction({
  args: { groupId: v.id("groups"), tags: v.array(v.string()) },
  handler: async (_ctx, { groupId, tags }): Promise<WhyThis | null> =>
    findWhyThis(getClient(), groupNamespace(groupId), tags).catch(() => null),
});

export const setTasteHeadline = internalMutation({
  args: {
    groupId: v.id("groups"),
    headline: v.string(),
    why: v.string(),
    source: v.union(v.literal("device"), v.literal("template"), v.literal("haiku")),
  },
  handler: async (ctx, { groupId, headline, why, source }) => {
    const problem = validateTasteLine({ headline, why });
    if (problem) throw new Error(problem);
    const row = await ctx.db.query("tasteProfiles").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).unique();
    const fields = { headline: headline.trim(), why: why.trim(), source, headlineAt: Date.now(), updatedAt: Date.now() };
    if (row) await ctx.db.patch("tasteProfiles", row._id, fields);
    else await ctx.db.insert("tasteProfiles", { groupId, tags: [], ...fields });
    return null;
  },
});

export const storedTasteLine = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const row = await ctx.db.query("tasteProfiles").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).unique();
    if (!row?.headline || !row.why || !row.source) return null;
    return { headline: row.headline, why: row.why, source: row.source, at: row.headlineAt ?? row.updatedAt };
  },
});

export const recentFrolics = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const rows = await ctx.db.query("frolics").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId)).order("desc").take(20);
    const out: { day: string; title: string }[] = [];
    for (const f of rows) {
      if (f.status !== "on" && f.status !== "done") continue;
      const plan = f.planId ? await ctx.db.get("plans", f.planId) : null;
      out.push({ day: f.day, title: plan?.title ?? "A frolic" });
      if (out.length === 5) break;
    }
    return out;
  },
});

export type TasteResult = TasteLine & {
  likes: string[];
  avoids: string[];
  vibe: string[];
  budget: string[];
  topTags: string[];
  inputs: { topTags: string[]; budget: string[]; recentFrolics: { day: string; title: string }[] };
  storedAt: number | null;
};

export const tasteProfile = internalAction({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }): Promise<TasteResult> => {
    const stats = await ctx.runQuery(internal.memory.stats.tagStats, { groupId });
    const taste: TasteProfile = await buildTaste(getClient(), groupNamespace(groupId), stats).catch(() => ({ headline: "", likes: [], avoids: [], vibe: [], budget: [], topTags: stats.filter((s) => s.liked > 0).sort((a, b) => b.liked - a.liked).slice(0, 3).map((s) => s.tag) }));
    const stored = await ctx.runQuery(internal.memory.read.storedTasteLine, { groupId });
    const recent = await ctx.runQuery(internal.memory.read.recentFrolics, { groupId });
    const line: TasteLine = stored ?? templateTaste(taste.topTags, taste.budget);
    return {
      ...line,
      likes: taste.likes,
      avoids: taste.avoids,
      vibe: taste.vibe,
      budget: taste.budget,
      topTags: taste.topTags,
      inputs: { topTags: taste.topTags, budget: taste.budget, recentFrolics: recent },
      storedAt: stored?.at ?? null,
    };
  },
});

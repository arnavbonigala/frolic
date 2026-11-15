import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getClient } from "./ingest";
import { buildContext, buildTaste, findWhyThis, type MemoryContext, type TasteProfile, type WhyThis } from "./context";
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

export const tasteProfile = internalAction({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }): Promise<TasteProfile> => {
    const stats = await ctx.runQuery(internal.memory.stats.tagStats, { groupId });
    return buildTaste(getClient(), groupNamespace(groupId), stats);
  },
});

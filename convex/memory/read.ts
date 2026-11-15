import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getClient } from "./ingest";
import { buildContext, buildContextFailure, buildTaste, findWhyThis, type MemoryContext, type TasteProfile, type WhyThis } from "./context";
import { templateTaste, validateTasteLine, type TasteLine } from "./taste";
import { groupNamespace } from "./mapping";
import { citeWhy, vWhyCitation, type PickRef, type WhyCitation } from "./why";

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
    const picks: string[] = await ctx.runQuery(internal.dailyPick.pickTags, { groupId, day });
    const answers: PickRef[] = await ctx.runQuery(internal.memory.why.pickAnswers, { groupId, day });
    const withPicks = (context: MemoryContext): MemoryContext => ({
      ...context,
      picks: answers,
      likedTags: [...context.likedTags, ...picks.filter((tag) => !context.likedTags.includes(tag) && !context.suppressed.includes(tag))],
    });
    const hit = await ctx.runQuery(internal.memory.read.cached, { groupId, day });
    if (hit) return withPicks(hit);
    const stats = await ctx.runQuery(internal.memory.stats.tagStats, { groupId });
    let context: MemoryContext;
    try {
      context = await buildContext(getClient(), groupNamespace(groupId), stats);
    } catch {
      return withPicks(buildContextFailure(stats));
    }
    await ctx.runMutation(internal.memory.read.saveCache, { groupId, day, context });
    return withPicks(context);
  },
});

export const whyThis = internalAction({
  args: { groupId: v.id("groups"), tags: v.array(v.string()) },
  handler: async (_ctx, { groupId, tags }): Promise<WhyThis | null> =>
    findWhyThis(getClient(), groupNamespace(groupId), tags),
});

export const whyCite = internalAction({
  args: {
    groupId: v.id("groups"),
    day: v.string(),
    placeSlug: v.string(),
    placeName: v.string(),
    placeTags: v.array(v.string()),
  },
  returns: v.union(vWhyCitation, v.null()),
  handler: async (_ctx, { groupId, day, placeSlug, placeName, placeTags }): Promise<WhyCitation | null> => {
    const hit = await findWhyThis(getClient(), groupNamespace(groupId), [...placeTags, placeName]);
    if (!hit) return null;
    const night = { id: hit.memoryId, text: hit.text, placeId: hit.placeId, date: hit.date };
    return citeWhy({ slug: placeSlug, name: placeName, tags: placeTags }, { pastNights: [night] }, { day });
  },
});

const TASTE_SOURCES = ["device", "template", "haiku"] as const;
type TasteSource = (typeof TASTE_SOURCES)[number];

export const encodeTasteLine = (line: TasteLine, at: number) => JSON.stringify({ headline: line.headline.trim(), why: line.why.trim(), source: line.source, at });

export function decodeTasteLine(card: string | undefined): (TasteLine & { at: number }) | null {
  if (!card) return null;
  try {
    const raw = JSON.parse(card) as Record<string, unknown>;
    const headline = typeof raw.headline === "string" ? raw.headline : null;
    const why = typeof raw.why === "string" ? raw.why : null;
    const source = TASTE_SOURCES.includes(raw.source as TasteSource) ? (raw.source as TasteSource) : null;
    const at = typeof raw.at === "number" ? raw.at : 0;
    if (!headline || !why || !source || validateTasteLine({ headline, why })) return null;
    return { headline, why, source, at };
  } catch {
    return null;
  }
}

export const setTasteHeadline = internalMutation({
  args: {
    groupId: v.id("groups"),
    headline: v.string(),
    why: v.string(),
    source: v.union(v.literal("device"), v.literal("template"), v.literal("haiku")),
  },
  handler: async (ctx, { groupId, headline, why, source }): Promise<null> => {
    const problem = validateTasteLine({ headline, why });
    if (problem) throw new Error(problem);
    const now = Date.now();
    const card = encodeTasteLine({ headline, why, source }, now);
    const row = await ctx.db.query("tasteProfiles").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).unique();
    if (row) await ctx.db.patch("tasteProfiles", row._id, { card, updatedAt: now });
    else await ctx.db.insert("tasteProfiles", { groupId, tags: [], card, updatedAt: now });
    return null;
  },
});

export const storedTasteLine = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const row = await ctx.db.query("tasteProfiles").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).unique();
    return decodeTasteLine(row?.card);
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

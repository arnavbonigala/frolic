import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { planWrites, type EventInput } from "./mapping";

export const eventKind = v.union(
  v.literal("tap"),
  v.literal("only_if"),
  v.literal("skip"),
  v.literal("limit"),
  v.literal("plan_shown"),
  v.literal("reveal"),
  v.literal("checkin"),
  v.literal("snap"),
  v.literal("group_skip"),
);

export const eventSource = v.union(v.literal("app"), v.literal("web"), v.literal("notification"), v.literal("imessage"));

export const MAX_ATTEMPTS = 6;
export const LEASE_MS = 300_000;

export const eventArgs = {
  eventKey: v.string(),
  kind: eventKind,
  groupId: v.id("groups"),
  userId: v.optional(v.id("users")),
  frolicId: v.optional(v.id("frolics")),
  payload: v.any(),
  revealAt: v.optional(v.number()),
  source: v.optional(eventSource),
};

export async function invalidateContext(ctx: MutationCtx, groupId: Id<"groups">) {
  const rows = await ctx.db.query("memoryContextCache").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId)).take(50);
  for (const row of rows) await ctx.db.delete("memoryContextCache", row._id);
}

export async function bumpTagStat(ctx: MutationCtx, groupId: Id<"groups">, tag: string, field: "liked" | "skipped", day?: string) {
  const key = tag.toLowerCase();
  const row = await ctx.db.query("memoryTagStats").withIndex("by_groupId_and_tag", (q) => q.eq("groupId", groupId).eq("tag", key)).unique();
  if (!row) {
    await ctx.db.insert("memoryTagStats", { groupId, tag: key, liked: field === "liked" ? 1 : 0, skipped: field === "skipped" ? 1 : 0, lastSkipDay: field === "skipped" ? day : undefined, updatedAt: Date.now() });
    return 1;
  }
  const next = row[field] + 1;
  await ctx.db.patch("memoryTagStats", row._id, { [field]: next, ...(field === "skipped" ? { lastSkipDay: day } : {}), updatedAt: Date.now() });
  return next;
}

export async function enqueue(ctx: MutationCtx, args: EventInput & { eventKey: string; groupId: Id<"groups">; userId?: Id<"users">; frolicId?: Id<"frolics">; source?: Doc<"memoryEvents">["source"] }) {
  const existing = await ctx.db.query("memoryEvents").withIndex("by_eventKey", (q) => q.eq("eventKey", args.eventKey)).unique();
  if (existing) return { queued: false as const, eventId: existing._id };
  const placeId = typeof args.payload?.placeId === "string" ? ctx.db.normalizeId("places", args.payload.placeId) : null;
  const slug = placeId ? (await ctx.db.get("places", placeId))?.slug : undefined;
  const payload = slug ? { ...args.payload, placeId: slug } : args.payload;
  const { notBefore } = planWrites(args.eventKey, { ...args, payload });
  const now = Date.now();
  const nextAttemptAt = Math.max(now, notBefore);
  const eventId = await ctx.db.insert("memoryEvents", {
    eventKey: args.eventKey,
    kind: args.kind,
    groupId: args.groupId,
    userId: args.userId,
    frolicId: args.frolicId,
    payload,
    revealAt: args.revealAt,
    source: args.source,
    status: "queued",
    attempts: 0,
    nextAttemptAt,
  });
  await ctx.scheduler.runAfter(nextAttemptAt - now, internal.memory.ingest.flushEvent, { eventId });
  return { queued: true as const, eventId };
}

export const recordEvent = internalMutation({
  args: eventArgs,
  handler: async (ctx, args) => enqueue(ctx, args),
});

export const claimEvent = internalMutation({
  args: { eventId: v.id("memoryEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("memoryEvents", eventId);
    if (!event) return null;
    const now = Date.now();
    const claimable = event.status === "queued" || event.status === "sending";
    if (!claimable || event.nextAttemptAt > now) return null;
    await ctx.db.patch("memoryEvents", eventId, { status: "sending", attempts: event.attempts + 1, nextAttemptAt: now + LEASE_MS });
    return { ...event, attempts: event.attempts + 1 };
  },
});

export const markSent = internalMutation({
  args: { eventId: v.id("memoryEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("memoryEvents", eventId);
    if (!event || event.status === "sent") return null;
    await ctx.db.patch("memoryEvents", eventId, { status: "sent", lastError: undefined });
    if (event.kind === "reveal") {
      const tags = Array.isArray(event.payload?.tags) ? (event.payload.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
      for (const tag of tags) await bumpTagStat(ctx, event.groupId, tag, "liked");
      await invalidateContext(ctx, event.groupId);
    }
    return null;
  },
});

export const markFailed = internalMutation({
  args: { eventId: v.id("memoryEvents"), error: v.string() },
  handler: async (ctx, { eventId, error }) => {
    const event = await ctx.db.get("memoryEvents", eventId);
    if (!event) return null;
    if (event.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch("memoryEvents", eventId, { status: "failed", lastError: error });
      return { retryInMs: null };
    }
    const retryInMs = Math.min(15_000 * 2 ** (event.attempts - 1), 15 * 60_000);
    await ctx.db.patch("memoryEvents", eventId, { status: "queued", lastError: error, nextAttemptAt: Date.now() + retryInMs });
    await ctx.scheduler.runAfter(retryInMs, internal.memory.ingest.flushEvent, { eventId });
    return { retryInMs };
  },
});

export const dueEvents = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const queued = await ctx.db.query("memoryEvents").withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "queued").lte("nextAttemptAt", now)).take(50);
    const stuck = await ctx.db.query("memoryEvents").withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "sending").lte("nextAttemptAt", now)).take(50);
    return [...queued, ...stuck].map((e) => e._id);
  },
});

export const getEvent = internalQuery({
  args: { eventId: v.id("memoryEvents") },
  handler: async (ctx, { eventId }) => ctx.db.get("memoryEvents", eventId),
});

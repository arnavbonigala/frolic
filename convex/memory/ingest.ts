declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { createClient, type MemoryClient } from "./client";
import { ensureNamespace } from "./context";
import { planWrites } from "./mapping";

export function getClient(): MemoryClient {
  const key = process.env.SUPERMEMORY_API_KEY;
  if (!key) throw new Error("SUPERMEMORY_API_KEY is not set");
  return createClient(key);
}

export const isReady = internalQuery({
  args: { containerTag: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { containerTag }) => {
    const row = await ctx.db.query("memoryContainers").withIndex("by_containerTag", (q) => q.eq("containerTag", containerTag)).unique();
    return row?.lastSyncedAt !== undefined;
  },
});

export const markReady = internalMutation({
  args: {
    containerTag: v.string(),
    scope: v.union(v.literal("user"), v.literal("group")),
    userId: v.optional(v.id("users")),
    groupId: v.optional(v.id("groups")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("memoryContainers").withIndex("by_containerTag", (q) => q.eq("containerTag", args.containerTag)).unique();
    if (row) await ctx.db.patch("memoryContainers", row._id, { lastSyncedAt: Date.now() });
    else await ctx.db.insert("memoryContainers", { ...args, lastSyncedAt: Date.now() });
    return null;
  },
});

export const flushEvent = internalAction({
  args: { eventId: v.id("memoryEvents") },
  returns: v.object({ status: v.union(v.literal("sent"), v.literal("skipped"), v.literal("retry"), v.literal("failed")) }),
  handler: async (ctx, { eventId }): Promise<{ status: "sent" | "skipped" | "retry" | "failed" }> => {
    const event = await ctx.runMutation(internal.memory.events.claimEvent, { eventId });
    if (!event) return { status: "skipped" };
    try {
      const client = getClient();
      const { writes } = planWrites(event.eventKey, {
        kind: event.kind,
        groupId: event.groupId,
        userId: event.userId,
        frolicId: event.frolicId,
        payload: event.payload,
        revealAt: event.revealAt,
      });
      for (const w of writes) {
        if (!(await ctx.runQuery(internal.memory.ingest.isReady, { containerTag: w.namespace }))) {
          await ensureNamespace(client, w.namespace, w.scope);
          await ctx.runMutation(internal.memory.ingest.markReady, {
            containerTag: w.namespace,
            scope: w.scope === "personal" ? "user" : "group",
            userId: w.userId as never,
            groupId: w.scope === "group" ? event.groupId : undefined,
          });
        }
        await client.add(w.namespace, { content: w.content, id: w.id, metadata: w.metadata, date: w.date });
      }
      await ctx.runMutation(internal.memory.events.markSent, { eventId });
      return { status: "sent" };
    } catch (e) {
      const res = await ctx.runMutation(internal.memory.events.markFailed, { eventId, error: (e as Error).message.slice(0, 300) });
      return { status: res?.retryInMs == null ? "failed" : "retry" };
    }
  },
});

export const flushDue = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const ids = await ctx.runQuery(internal.memory.events.dueEvents, {});
    for (const eventId of ids) await ctx.scheduler.runAfter(0, internal.memory.ingest.flushEvent, { eventId });
    return ids.length;
  },
});

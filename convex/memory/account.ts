import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { SupermemoryError } from "./client";
import { getClient } from "./ingest";
import { personalNamespace } from "./mapping";

export const purgeUserRows = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const events = await ctx.db.query("memoryEvents").withIndex("by_userId", (q) => q.eq("userId", userId)).take(500);
    for (const e of events) await ctx.db.delete("memoryEvents", e._id);
    const containers = await ctx.db.query("memoryContainers").withIndex("by_userId", (q) => q.eq("userId", userId)).take(10);
    for (const c of containers) await ctx.db.delete("memoryContainers", c._id);
    return { events: events.length, more: events.length === 500 };
  },
});

export const deleteAccountMemory = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ deletedDocuments: number }> => {
    let deletedDocuments = 0;
    try {
      deletedDocuments = (await getClient().deleteNamespace(personalNamespace(userId))).deletedDocumentsCount;
    } catch (e) {
      if (!(e instanceof SupermemoryError && e.status === 404)) throw e;
    }
    let more = true;
    while (more) more = (await ctx.runMutation(internal.memory.account.purgeUserRows, { userId })).more;
    return { deletedDocuments };
  },
});

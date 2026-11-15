import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { userFromToken } from "./lib/identity";
import { energy } from "./schema";

const view = v.object({
  budgetCap: v.union(v.number(), v.null()),
  energy: v.union(energy, v.null()),
  maxMinutes: v.union(v.number(), v.null()),
  homeBy: v.union(v.number(), v.null()),
});

const toView = (l: Doc<"limits"> | null) => ({
  budgetCap: l?.budgetCap ?? null,
  energy: l?.energy ?? null,
  maxMinutes: l?.maxMinutes ?? null,
  homeBy: l?.homeBy ?? null,
});

export const mine = query({
  args: { deviceToken: v.string() },
  returns: view,
  handler: async (ctx, { deviceToken }) => {
    const user = await userFromToken(ctx, deviceToken);
    const limits = await ctx.db.query("limits").withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    return toView(limits);
  },
});

export const set = mutation({
  args: {
    deviceToken: v.string(),
    budgetCap: v.optional(v.union(v.number(), v.null())),
    energy: v.optional(v.union(energy, v.null())),
    maxMinutes: v.optional(v.union(v.number(), v.null())),
    homeBy: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    const bad = (x: number | null | undefined, max: number) => typeof x === "number" && (x < 0 || x > max);
    if (bad(args.budgetCap, 10000) || bad(args.maxMinutes, 600) || bad(args.homeBy, 36 * 60)) {
      throw new ConvexError({ code: "BAD_LIMIT", message: "That limit is out of range" });
    }
    const existing = await ctx.db.query("limits").withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    const pick = <K extends "budgetCap" | "energy" | "maxMinutes" | "homeBy">(k: K) =>
      args[k] === undefined ? existing?.[k] : (args[k] ?? undefined);
    const doc = {
      userId: user._id,
      budgetCap: pick("budgetCap") as number | undefined,
      energy: pick("energy") as Doc<"limits">["energy"],
      maxMinutes: pick("maxMinutes") as number | undefined,
      homeBy: pick("homeBy") as number | undefined,
      updatedAt: Date.now(),
    };
    const limitsId = existing ? existing._id : await ctx.db.insert("limits", doc);
    if (existing) await ctx.db.replace("limits", existing._id, doc);
    const parts = [
      doc.budgetCap !== undefined ? `budget up to ${doc.budgetCap}` : null,
      doc.energy ? `energy: ${doc.energy}` : null,
      doc.maxMinutes !== undefined ? `at most ${doc.maxMinutes} minutes away` : null,
      doc.homeBy !== undefined ? `home by ${Math.floor(doc.homeBy / 60)}:${String(doc.homeBy % 60).padStart(2, "0")}` : null,
    ].filter((p): p is string => p !== null);
    const memberships = await ctx.db.query("memberships").withIndex("by_userId", (q) => q.eq("userId", user._id)).take(1);
    if (memberships[0] && parts.length) {
      await ctx.runMutation(internal.memory.events.recordEvent, {
        eventKey: `limit:${limitsId}:${doc.updatedAt}`,
        kind: "limit",
        groupId: memberships[0].groupId,
        userId: user._id,
        payload: { text: `Private limits: ${parts.join(", ")}` },
      });
    }
    return null;
  },
});

export const forUsers = internalQuery({
  args: { userIds: v.array(v.id("users")) },
  returns: v.array(view.extend({ userId: v.id("users") })),
  handler: async (ctx, { userIds }) => {
    const out = [];
    for (const userId of userIds) {
      const l = await ctx.db.query("limits").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
      out.push({ userId, ...toView(l) });
    }
    return out;
  },
});

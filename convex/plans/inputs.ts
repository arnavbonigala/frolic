import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { energy } from "../schema";
import { addDays, localTimeToMs } from "./time";

export const vLimits = v.object({
  budgetCents: v.union(v.number(), v.null()),
  energy,
  maxMinutes: v.union(v.number(), v.null()),
  homeBy: v.union(v.number(), v.null()),
});

export const vAttendee = v.object({
  userId: v.string(),
  limits: vLimits,
  origin: v.null(),
  window: v.object({ start: v.number(), end: v.number() }),
  taste: v.array(v.string()),
});

export const vHistoryEntry = v.object({
  day: v.string(),
  placeSlug: v.string(),
  favoredUserId: v.union(v.string(), v.null()),
});

export const vDropInputs = v.object({
  nowMs: v.number(),
  attendees: v.array(vAttendee),
  history: v.array(vHistoryEntry),
  lastFrolicDay: v.union(v.string(), v.null()),
});

export type DropInputs = {
  nowMs: number;
  attendees: {
    userId: string;
    limits: { budgetCents: number | null; energy: "chill" | "anything"; maxMinutes: number | null; homeBy: number | null };
    origin: null;
    window: { start: number; end: number };
    taste: string[];
  }[];
  history: { day: string; placeSlug: string; favoredUserId: string | null }[];
  lastFrolicDay: string | null;
};

const MEMBER_LIMIT = 200;
const HISTORY_LIMIT = 120;
const FROLIC_LIMIT = 40;

export const dropInputs = internalQuery({
  args: { groupId: v.id("groups"), day: v.string(), nowMs: v.number() },
  returns: vDropInputs,
  handler: async (ctx, args): Promise<DropInputs> => {
    const dayEnd = localTimeToMs(addDays(args.day, 1), 0);
    const taste =
      (await ctx.db.query("tasteProfiles").withIndex("by_groupId", (q) => q.eq("groupId", args.groupId)).take(1))[0]?.tags ?? [];
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .take(MEMBER_LIMIT);
    const attendees: DropInputs["attendees"] = [];
    for (const member of members) {
      const row = (
        await ctx.db
          .query("availability")
          .withIndex("by_groupId_and_userId_and_day", (q) =>
            q.eq("groupId", args.groupId).eq("userId", member.userId).eq("day", args.day),
          )
          .take(1)
      )[0];
      if (!row || row.state === "busy") continue;
      const limits = (
        await ctx.db.query("limits").withIndex("by_userId", (q) => q.eq("userId", member.userId)).take(1)
      )[0];
      const window =
        row.state === "window" && row.window
          ? { start: row.window.start, end: row.window.end }
          : { start: args.nowMs, end: dayEnd };
      attendees.push({
        userId: member.userId,
        limits: {
          budgetCents: limits?.budgetCap ?? null,
          energy: limits?.energy ?? "anything",
          maxMinutes: limits?.maxMinutes ?? null,
          homeBy: limits?.homeBy ?? null,
        },
        origin: null,
        window,
        taste,
      });
    }
    const past = await ctx.db
      .query("plans")
      .withIndex("by_groupId_and_day", (q) =>
        q.eq("groupId", args.groupId).gte("day", addDays(args.day, -21)).lt("day", args.day),
      )
      .take(HISTORY_LIMIT);
    const history: DropInputs["history"] = [];
    for (const plan of past) {
      const place = await ctx.db.get("places", plan.placeId);
      if (!place) continue;
      history.push({ day: plan.day, placeSlug: place.slug, favoredUserId: null });
    }
    const recent = await ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .take(FROLIC_LIMIT);
    const done = recent.find((frolic) => frolic.status === "done");
    return { nowMs: args.nowMs, attendees, history, lastFrolicDay: done?.day ?? null };
  },
});

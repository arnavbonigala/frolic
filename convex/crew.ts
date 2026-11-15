import { Presence } from "@convex-dev/presence";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { togetherWith } from "./garden";
import { holdCents } from "./lib/hold";
import { requireMember, userFromToken } from "./lib/identity";
import { photoUrlOf } from "./lib/photo";
import { timeWindow } from "./schema";

export const presence = new Presence<Id<"groups">, Id<"users">>(components.presence);

const freeState = v.union(v.literal("now"), v.literal("window"), v.literal("busy"));

export const crew = query({
  args: { deviceToken: v.string(), groupId: v.id("groups"), day: v.string() },
  returns: v.object({
    groupName: v.string(),
    holdEnabled: v.optional(v.boolean()),
    holdCents: v.number(),
    memberCount: v.number(),
    createdAt: v.number(),
    members: v.array(
      v.object({
        userId: v.id("users"),
        name: v.string(),
        color: v.string(),
        photoUrl: v.union(v.string(), v.null()),
        isMe: v.boolean(),
        together: v.object({
          count: v.number(),
          lastPlace: v.union(v.string(), v.null()),
          lastDateLine: v.union(v.string(), v.null()),
        }),
        free: v.union(
          v.null(),
          v.object({
            state: freeState,
            window: v.union(timeWindow, v.null()),
            minutesAway: v.union(v.number(), v.null()),
            updatedAt: v.number(),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "This crew is gone" });
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .take(100);
    const availability = await ctx.db
      .query("availability")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", args.groupId).eq("day", args.day))
      .take(200);
    const together = await togetherWith(ctx, group, user._id);
    const members = [];
    for (const m of memberships) {
      const u = await ctx.db.get("users", m.userId);
      if (!u) continue;
      const a = availability.find((x) => x.userId === m.userId);
      members.push({
        userId: u._id,
        name: u.name,
        color: m.color,
        photoUrl: await photoUrlOf(ctx, u),
        isMe: u._id === user._id,
        together: together.get(u._id) ?? { count: 0, lastPlace: null, lastDateLine: null },
        free: a
          ? { state: a.state, window: a.window ?? null, minutesAway: a.minutesAway ?? null, updatedAt: a.updatedAt }
          : null,
      });
    }
    return {
      groupName: group.name,
      holdEnabled: group.holdEnabled,
      holdCents: holdCents(),
      memberCount: members.length,
      createdAt: group._creationTime,
      members,
    };
  },
});

export const setFree = mutation({
  args: {
    deviceToken: v.string(),
    groupId: v.id("groups"),
    day: v.string(),
    state: freeState,
    window: v.optional(timeWindow),
    minutesAway: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.day)) {
      throw new ConvexError({ code: "BAD_DAY", message: "Day must be YYYY-MM-DD" });
    }
    if (args.state === "window" && (!args.window || args.window.end <= args.window.start)) {
      throw new ConvexError({ code: "BAD_WINDOW", message: "That window does not work" });
    }
    if (args.minutesAway !== undefined && (args.minutesAway < 0 || args.minutesAway > 600)) {
      throw new ConvexError({ code: "BAD_MINUTES", message: "Minutes away is out of range" });
    }
    const fields = {
      state: args.state,
      window: args.state === "window" ? args.window : undefined,
      minutesAway: args.minutesAway === undefined ? undefined : Math.round(args.minutesAway),
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("availability")
      .withIndex("by_groupId_and_userId_and_day", (q) =>
        q.eq("groupId", args.groupId).eq("userId", user._id).eq("day", args.day),
      )
      .unique();
    if (existing) {
      await ctx.db.replace("availability", existing._id, {
        groupId: args.groupId,
        userId: user._id,
        day: args.day,
        ...fields,
      });
    } else {
      await ctx.db.insert("availability", { groupId: args.groupId, userId: user._id, day: args.day, ...fields });
    }
    return null;
  },
});

export const heartbeat = mutation({
  args: {
    deviceToken: v.string(),
    groupId: v.id("groups"),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    const interval = Math.min(Math.max(args.interval, 5000), 60000);
    return await presence.heartbeat(ctx, args.groupId, user._id, args.sessionId, interval);
  },
});

export const looking = query({
  args: { roomToken: v.string() },
  returns: v.array(v.object({ userId: v.string(), online: v.boolean(), lastDisconnected: v.number() })),
  handler: async (ctx, { roomToken }) => {
    const list = await presence.list(ctx, roomToken);
    return list.map((p) => ({ userId: p.userId, online: p.online, lastDisconnected: p.lastDisconnected }));
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => {
    await presence.disconnect(ctx, sessionToken);
    return null;
  },
});

export const setHold = mutation({
  args: { deviceToken: v.string(), groupId: v.id("groups"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    await ctx.db.patch("groups", args.groupId, { holdEnabled: args.enabled });
    return null;
  },
});

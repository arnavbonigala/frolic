import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { findAttendee, getFrolic, goingAttendees, putAttendee, removeTap, sitOutAndRefill } from "./lib/core";
import { requireMember, userFromToken } from "./lib/identity";
import { photoUrlOf } from "./lib/photo";
import { rateLimiter } from "./lib/rateLimits";
import { heroKeyOf } from "./lib/heroArt";
import { HERO_KEYS } from "./places/data";
import { timeWindow } from "./schema";

export const open = internalMutation({
  args: {
    groupId: v.id("groups"),
    day: v.string(),
    kind: v.union(v.literal("daily"), v.literal("weekend"), v.literal("solo")),
    planId: v.optional(v.id("plans")),
    window: timeWindow,
    durationMinutes: v.number(),
    deadline: v.number(),
    capacity: v.optional(v.number()),
  },
  returns: v.id("frolics"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", args.groupId).eq("day", args.day))
      .take(10);
    const same = existing.find((f) => f.kind === args.kind);
    if (same) {
      if (same.status === "open" && args.planId && same.planId !== args.planId) {
        await ctx.db.patch("frolics", same._id, { planId: args.planId });
      }
      return same._id;
    }
    const frolicId = await ctx.db.insert("frolics", { ...args, status: "open" });
    await ctx.scheduler.runAt(args.deadline, internal.reveal.fade, { frolicId });
    await ctx.runMutation(internal.keiki.outbound.onDrop, { frolicId });
    return frolicId;
  },
});

const person = v.object({
  userId: v.id("users"),
  name: v.string(),
  color: v.string(),
  photoUrl: v.union(v.string(), v.null()),
});

const phase = v.union(
  v.literal("none"),
  v.literal("solo"),
  v.literal("open"),
  v.literal("waiting"),
  v.literal("on"),
  v.literal("faded"),
  v.literal("done"),
);

async function people(
  ctx: QueryCtx,
  memberships: Doc<"memberships">[],
  userIds: Id<"users">[],
) {
  const out = [];
  for (const userId of userIds) {
    const m = memberships.find((x) => x.userId === userId);
    const u = await ctx.db.get("users", userId);
    if (!m || !u) continue;
    out.push({
      userId,
      name: u.name,
      color: m.color,
      photoUrl: await photoUrlOf(ctx, u),
    });
  }
  return out;
}

export const today = query({
  args: {
    deviceToken: v.string(),
    groupId: v.id("groups"),
    day: v.optional(v.string()),
    frolicId: v.optional(v.id("frolics")),
  },
  returns: v.object({
    phase,
    groupName: v.string(),
    memberCount: v.number(),
    frolic: v.union(
      v.null(),
      v.object({
        frolicId: v.id("frolics"),
        day: v.string(),
        kind: v.string(),
        deadline: v.number(),
        window: timeWindow,
        durationMinutes: v.number(),
        plan: v.union(
          v.null(),
          v.object({
            title: v.string(),
            line: v.string(),
            why: v.union(v.string(), v.null()),
            heroKey: v.union(...HERO_KEYS.map((k) => v.literal(k))),
            cost: v.number(),
            costLabel: v.string(),
            payUpFront: v.boolean(),
            startsAt: v.number(),
            sunsetAt: v.union(v.number(), v.null()),
            place: v.union(
              v.null(),
              v.object({
                placeId: v.id("places"),
                name: v.string(),
                lat: v.number(),
                lng: v.number(),
                photoUrl: v.union(v.string(), v.null()),
                neighborhood: v.union(v.string(), v.null()),
              }),
            ),
          }),
        ),
      }),
    ),
    myTap: v.union(
      v.null(),
      v.object({
        kind: v.union(v.literal("down"), v.literal("notToday")),
        onlyIf: v.array(person),
        window: v.union(timeWindow, v.null()),
      }),
    ),
    reveal: v.union(
      v.null(),
      v.object({
        revealAt: v.number(),
        bloomAt: v.number(),
        startsAt: v.number(),
        endsAt: v.number(),
        snapAt: v.union(v.number(), v.null()),
        going: v.array(person.extend({ role: v.string() })),
        me: v.object({
          going: v.boolean(),
          role: v.union(v.string(), v.null()),
          bloomAt: v.union(v.number(), v.null()),
          hopInWaiting: v.boolean(),
          canHopIn: v.boolean(),
        }),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    return await todayFor(ctx, user, args);
  },
});

export async function todayFor(
  ctx: QueryCtx,
  user: Doc<"users">,
  args: { groupId: Id<"groups">; day?: string; frolicId?: Id<"frolics"> },
) {
  const group = await ctx.db.get("groups", args.groupId);
  if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "This crew is gone" });
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
    .take(100);
  const picked = args.frolicId ? await ctx.db.get("frolics", args.frolicId) : null;
  if (picked && picked.groupId !== args.groupId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "This frolic is gone" });
  }
  const frolic = picked
    ? picked
    : args.day
    ? (
        await ctx.db
          .query("frolics")
          .withIndex("by_groupId_and_day", (q) => q.eq("groupId", args.groupId).eq("day", args.day!))
          .order("desc")
          .take(1)
      )[0]
    : await ctx.db
        .query("frolics")
        .withIndex("by_groupId_and_day", (q) => q.eq("groupId", args.groupId))
        .order("desc")
        .first();
  const base = { groupName: group.name, memberCount: memberships.length };
  if (!frolic) {
    return { ...base, phase: memberships.length <= 1 ? ("solo" as const) : ("none" as const), frolic: null, myTap: null, reveal: null };
  }

  const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
  const place = plan ? await ctx.db.get("places", plan.placeId) : null;
  const frolicView = {
    frolicId: frolic._id,
    day: frolic.day,
    kind: frolic.kind,
    deadline: frolic.deadline,
    window: frolic.window,
    durationMinutes: frolic.durationMinutes,
    plan: plan
      ? {
          title: plan.title,
          line: plan.line,
          why: plan.why ?? null,
          heroKey: place ? heroKeyOf(place.slug) : "plan-free-stuff",
          cost: plan.cost,
          costLabel: plan.costLabel,
          payUpFront: plan.payUpFront,
          startsAt: frolic.startsAt ?? plan.startsAt,
          sunsetAt: plan.sunsetAt ?? null,
          place: place
            ? {
                placeId: place._id,
                name: place.name,
                lat: place.lat,
                lng: place.lng,
                photoUrl: place.photoUrl ?? null,
                neighborhood: place.neighborhood ?? null,
              }
            : null,
        }
      : null,
  };

  const tap =
    frolic.status === "open" || frolic.status === "on"
      ? await ctx.db
          .query("taps")
          .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolic._id).eq("userId", user._id))
          .unique()
      : null;
  const myTap = tap
    ? { kind: tap.kind, onlyIf: await people(ctx, memberships, tap.onlyIf), window: tap.window ?? null }
    : null;

  if (frolic.status === "faded") {
    return { ...base, phase: "faded" as const, frolic: frolicView, myTap: null, reveal: null };
  }
  if (frolic.status === "open") {
    const p = myTap?.kind === "down" ? "waiting" : memberships.length <= 1 ? "solo" : "open";
    return { ...base, phase: p as "waiting" | "solo" | "open", frolic: frolicView, myTap, reveal: null };
  }

  const attendees = await ctx.db
    .query("attendees")
    .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
    .take(200);
  const going = attendees.filter((a) => a.status === "going");
  const mine = attendees.find((a) => a.userId === user._id) ?? null;
  const goingPeople = await people(ctx, memberships, going.map((a) => a.userId));
  const hop = await ctx.db
    .query("hopIns")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolic._id).eq("userId", user._id))
    .unique();
  const amGoing = mine?.status === "going";
  const room = frolic.capacity === undefined || going.length < frolic.capacity;
  return {
    ...base,
    phase: frolic.status === "on" ? ("on" as const) : ("done" as const),
    frolic: frolicView,
    myTap,
    reveal: {
      revealAt: frolic.revealAt!,
      bloomAt: frolic.bloomAt!,
      startsAt: frolic.startsAt!,
      endsAt: frolic.endsAt!,
      snapAt: frolic.snapAt ?? null,
      going: goingPeople.map((p) => ({ ...p, role: going.find((a) => a.userId === p.userId)!.role })),
      me: {
        going: amGoing,
        role: amGoing ? mine!.role : null,
        bloomAt: amGoing ? mine!.bloomAt : null,
        hopInWaiting: hop?.status === "waiting",
        canHopIn: frolic.status === "on" && !amGoing && hop?.status !== "waiting" && room,
      },
    },
  };
}

export const hopIn = mutation({
  args: { deviceToken: v.string(), frolicId: v.id("frolics") },
  returns: v.union(v.literal("going"), v.literal("waiting")),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    const frolic = await getFrolic(ctx, args.frolicId);
    await requireMember(ctx, frolic.groupId, user._id);
    await rateLimiter.limit(ctx, "hopIn", { key: user._id, throws: true });
    const now = Date.now();
    if (frolic.status !== "on" || (frolic.endsAt !== undefined && now >= frolic.endsAt)) {
      throw new ConvexError({ code: "CLOSED", message: "This one is not happening right now" });
    }
    const attendee = await findAttendee(ctx, frolic._id, user._id);
    if (attendee?.status === "going") return "going";
    const going = await goingAttendees(ctx, frolic._id);
    const hop = await ctx.db
      .query("hopIns")
      .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolic._id).eq("userId", user._id))
      .unique();
    if (frolic.capacity !== undefined && going.length >= frolic.capacity) {
      if (hop) await ctx.db.patch("hopIns", hop._id, { status: "waiting", requestedAt: now });
      else await ctx.db.insert("hopIns", { frolicId: frolic._id, userId: user._id, status: "waiting", requestedAt: now });
      return "waiting";
    }
    if (hop) await ctx.db.patch("hopIns", hop._id, { status: "joined" });
    await putAttendee(ctx, frolic, user._id, "hopIn", now, attendee);
    return "going";
  },
});

export const sitOut = mutation({
  args: { deviceToken: v.string(), frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    const frolic = await getFrolic(ctx, args.frolicId);
    await requireMember(ctx, frolic.groupId, user._id);
    if (frolic.status === "open") return await removeTap(ctx, user._id, frolic._id, false);
    if (frolic.status !== "on") return null;
    const hop = await ctx.db
      .query("hopIns")
      .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolic._id).eq("userId", user._id))
      .unique();
    if (hop?.status === "waiting") await ctx.db.patch("hopIns", hop._id, { status: "left" });
    const attendee = await findAttendee(ctx, frolic._id, user._id);
    if (attendee?.status === "going") await sitOutAndRefill(ctx, frolic, attendee, Date.now());
    return null;
  },
});

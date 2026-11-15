import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { applyTap, findAttendee, getFrolic, goingAttendees, putAttendee, removeTap, sitOutAndRefill } from "./lib/core";
import { FREE_ANSWER_MS, openStartedFrolic, startFreeDrop } from "./plans/drop";
import { localParts } from "./plans/time";
import { clockTime, localDay } from "./keiki/lib";
import { freeLine } from "./keiki/outbound";
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
    const same = await ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", args.groupId).eq("day", args.day))
      .filter((q) => q.and(q.eq(q.field("kind"), args.kind), q.neq(q.field("origin"), "free")))
      .first();
    if (same) {
      if (same.status === "open" && args.planId && same.planId !== args.planId) {
        await ctx.db.patch("frolics", same._id, { planId: args.planId });
      }
      return same._id;
    }
    const frolicId = await ctx.db.insert("frolics", { ...args, status: "open", origin: "daily" });
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
        origin: v.union(v.literal("daily"), v.literal("free")),
        notice: v.union(v.string(), v.null()),
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

async function newestDay(ctx: QueryCtx, groupId: Id<"groups">, timeZone: string): Promise<string | null> {
  const today = localDay(Date.now(), timeZone);
  const newest = await ctx.db
    .query("frolics")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).lte("day", today))
    .order("desc")
    .first();
  return newest?.day ?? null;
}

async function presentMembers(
  ctx: QueryCtx,
  memberships: Doc<"memberships">[],
): Promise<Doc<"memberships">[]> {
  const present = [];
  for (const membership of memberships) {
    if (await ctx.db.get("users", membership.userId)) present.push(membership);
  }
  return present;
}

async function dayFrolic(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  day: string | null,
): Promise<Doc<"frolics"> | null> {
  if (!day) return null;
  const range = () =>
    ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day))
      .order("desc");
  const planned = await range()
    .filter((q) => q.not(q.and(q.eq(q.field("origin"), "free"), q.eq(q.field("status"), "faded"))))
    .first();
  return planned ?? (await range().first());
}

export async function todayFor(
  ctx: QueryCtx,
  user: Doc<"users">,
  args: { groupId: Id<"groups">; day?: string; frolicId?: Id<"frolics"> },
) {
  const group = await ctx.db.get("groups", args.groupId);
  if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "This crew is gone" });
  const joined = await ctx.db
    .query("memberships")
    .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
    .take(100);
  const memberships = await presentMembers(ctx, joined);
  const picked = args.frolicId ? await ctx.db.get("frolics", args.frolicId) : null;
  if (picked && picked.groupId !== args.groupId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "This frolic is gone" });
  }
  const frolic = picked
    ? picked
    : await dayFrolic(ctx, args.groupId, args.day ?? (await newestDay(ctx, args.groupId, group.timezone)));
  const base = { groupName: group.name, memberCount: memberships.length };
  const solo = memberships.length <= 1;
  if (!frolic) {
    return { ...base, phase: solo ? ("solo" as const) : ("none" as const), frolic: null, myTap: null, reveal: null };
  }

  const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
  const place = plan ? await ctx.db.get("places", plan.placeId) : null;
  const frolicView = {
    frolicId: frolic._id,
    day: frolic.day,
    kind: frolic.kind,
    origin: frolic.origin ?? ("daily" as const),
    notice:
      frolic.origin === "free" && frolic.status === "open" && plan
        ? freeLine({ title: plan.title, startsAt: clockTime(plan.startsAt, group.timezone) })
        : null,
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
    const p = myTap?.kind === "down" ? "waiting" : solo ? "solo" : "open";
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

async function liveFrolic(ctx: MutationCtx, groupId: Id<"groups">, now: number, freeUntil: number) {
  const recent = await ctx.db
    .query("frolics")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId))
    .order("desc")
    .take(10);
  return (
    recent.find((f) => f.status === "on" && f.endsAt !== undefined && now < f.endsAt) ??
    recent.find(
      (f) => f.status === "open" && f.origin !== "free" && now < f.deadline && f.window.start <= freeUntil,
    ) ??
    null
  );
}

async function startFree(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { groupId: Id<"groups">; forMinutes: number; source: "app" | "imessage" },
): Promise<{ frolicId: Id<"frolics">; started: boolean }> {
  await requireMember(ctx, args.groupId, userId);
  if (!Number.isInteger(args.forMinutes) || args.forMinutes < 60 || args.forMinutes > 240) {
    throw new ConvexError({ code: "BAD_MINUTES", message: "Free for is 60 to 240 minutes" });
  }
  const now = Date.now();
  const open = await openStartedFrolic(ctx, args.groupId);
  if (open && now < open.deadline) return { frolicId: open._id, started: false };
  const live = await liveFrolic(ctx, args.groupId, now, now + args.forMinutes * 60_000);
  if (live) return { frolicId: live._id, started: false };
  await rateLimiter.limit(ctx, "imFree", { key: userId, throws: true });
  const day = localParts(now).day;
  const window = { start: now, end: now + args.forMinutes * 60 * 1000 };
  const deadline = Math.min(now + FREE_ANSWER_MS, window.end);
  const frolicId = await ctx.db.insert("frolics", {
    groupId: args.groupId,
    day,
    kind: "daily",
    status: "open",
    window,
    durationMinutes: 60,
    deadline,
    origin: "free",
    startedBy: userId,
  });
  await ctx.scheduler.runAt(deadline, internal.reveal.fade, { frolicId });
  await applyTap(ctx, userId, { frolicId, kind: "down", source: args.source });
  await startFreeDrop(ctx, { groupId: args.groupId, day, nowMs: now, free: { frolicId, userId, window } });
  return { frolicId, started: true };
}

export const imFree = mutation({
  args: { deviceToken: v.string(), groupId: v.id("groups"), forMinutes: v.number() },
  returns: v.object({ frolicId: v.id("frolics"), started: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    return await startFree(ctx, user._id, { groupId: args.groupId, forMinutes: args.forMinutes, source: "app" });
  },
});

export const imFreeAs = internalMutation({
  args: { userId: v.id("users"), groupId: v.id("groups"), forMinutes: v.number() },
  returns: v.object({ error: v.string() }),
  handler: async (ctx, args) => {
    const result = await startFree(ctx, args.userId, { groupId: args.groupId, forMinutes: args.forMinutes, source: "imessage" });
    return { error: result.started ? "planning" : "already_open" };
  },
});

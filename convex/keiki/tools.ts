import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  CHECKIN_RADIUS_METERS,
  clockTime,
  DEFAULT_WALK_MINUTES,
  crewMembers,
  crewOf,
  currentFrolic,
  firstName,
  goingAttendees,
  isRevealed,
  joinNames,
  linkForPhone,
  localHour,
  localTimeOnSameDay,
  meetingCoords,
  metersBetween,
  parseClock,
  planDetails,
} from "./lib";
import { SNAP_WINDOW_MS } from "../snaps";
import { keikiEnv } from "./env";
import { imFreeAs } from "./imFreeCall";
import {
  addSnapAs,
  checkInAs,
  createUserAs,
  joinAs,
  recordMemoryEvent,
  setEtaAs,
  tapAs,
} from "./refs";

const SECRET_LINE = "Nobody sees you're down unless they are too. That goes for you as well.";

type Who = { user: Doc<"users">; link: Doc<"keikiLinks">; group: Doc<"groups"> };

async function who(ctx: QueryCtx, phone: string): Promise<Who | null> {
  const link = await linkForPhone(ctx, phone);
  if (!link) return null;
  const user = await ctx.db.get("users", link.userId);
  if (!user) return null;
  const crew = await crewOf(ctx, user._id);
  if (!crew) return null;
  return { user, link, group: crew.group };
}

const notMember = { ok: false, error: "not_in_a_crew", say: "Ask for their first name and the invite code from their first message, then call join_crew." };

async function walkMinutes(ctx: QueryCtx, frolicId: Id<"frolics">, userId: Id<"users">) {
  const eta = await ctx.db
    .query("etas")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .unique();
  return eta?.minutes ?? DEFAULT_WALK_MINUTES;
}

async function ownAnswer(ctx: QueryCtx, frolicId: Id<"frolics">, userId: Id<"users">) {
  const tap = await ctx.db
    .query("taps")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .unique();
  if (!tap) return { answer: null, onlyWith: [] as string[] };
  if (tap.kind === "notToday") return { answer: "pass", onlyWith: [] as string[] };
  const names = await Promise.all(tap.onlyIf.map(async (id) => (await ctx.db.get("users", id))?.name));
  const onlyWith = names.filter((n): n is string => !!n).map(firstName);
  if (onlyWith.length > 0) return { answer: "only_if", onlyWith };
  if (tap.window) return { answer: "only_if", onlyWith };
  return { answer: "down", onlyWith };
}

async function namesOf(ctx: QueryCtx, ids: Id<"users">[]) {
  const users = await Promise.all(ids.map((id) => ctx.db.get("users", id)));
  return users.filter((u): u is Doc<"users"> => u !== null).map((u) => firstName(u.name));
}

export const getMember = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const me = await who(ctx, phone);
    if (!me) return { ok: true, member: false, say: "They are new. Ask their first name, then call join_crew with the invite code from their first message." };
    const members = await crewMembers(ctx, me.group._id);
    return {
      ok: true,
      member: true,
      name: firstName(me.user.name),
      crew: me.group.name,
      friends: uniqueFirstNames(members.filter((m) => m._id !== me.user._id)),
      paused: me.link.paused,
      groupId: me.group._id,
      timezone: me.group.timezone,
    };
  },
});

export const getToday = internalQuery({
  args: { phone: v.optional(v.string()), chatId: v.optional(v.string()), now: v.number() },
  handler: async (ctx, { phone, chatId, now }) => {
    let group: Doc<"groups"> | null = null;
    let me: Who | null = null;
    if (phone) {
      me = await who(ctx, phone);
      if (!me) return notMember;
      group = me.group;
    } else if (chatId) {
      const chat = await ctx.db
        .query("keikiGroupChats")
        .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
        .unique();
      if (!chat) return { ok: false, error: "chat_not_linked", say: "Ask someone to call link_group_chat with their crew's invite code." };
      group = await ctx.db.get("groups", chat.groupId);
    }
    if (!group) return notMember;
    const frolic = await currentFrolic(ctx, group._id, now, group.timezone);
    if (!frolic) return { ok: true, plan: null, say: "No plan has dropped yet today." };
    const walk = me ? await walkMinutes(ctx, frolic._id, me.user._id) : DEFAULT_WALK_MINUTES;
    const details = await planDetails(ctx, frolic, group.timezone, walk);
    const revealed = isRevealed(frolic, now);
    const closed = frolic.status === "faded" || (!revealed && now >= frolic.deadline);
    const phase = frolic.status === "done" ? "done" : revealed ? "on" : closed ? "faded" : "open";
    if (!me) {
      return { ok: true, plan: details.view, phase, groupChat: true, say: "This is the group chat. Answers here are not secret. Tell people to DM you their answer." };
    }
    const mine = await ownAnswer(ctx, frolic._id, me.user._id);
    return { ok: true, plan: details.view, phase, yourAnswer: mine.answer, onlyWith: mine.onlyWith };
  },
});

async function openFrolicFor(ctx: QueryCtx, me: Who, now: number) {
  const frolic = await currentFrolic(ctx, me.group._id, now, me.group.timezone);
  if (!frolic) return { error: { ok: false, error: "no_plan", say: "There is no plan open right now." } } as const;
  if (frolic.status === "done" || frolic.status === "faded" || (!isRevealed(frolic, now) && now >= frolic.deadline)) {
    return { error: { ok: false, error: "closed", say: "Today's plan has closed. Tomorrow's drop is the next chance." } } as const;
  }
  return { frolic, revealed: isRevealed(frolic, now) } as const;
}

async function afterReveal(ctx: QueryCtx, me: Who, frolicId: Id<"frolics">, kind: "down" | "pass", wasGoing: boolean) {
  const going = await goingAttendees(ctx, frolicId);
  const mine = going.some((a) => a.userId === me.user._id);
  const names = await namesOf(ctx, going.filter((a) => a.userId !== me.user._id).map((a) => a.userId));
  if (kind === "pass") {
    return { ok: true, answer: "pass", satOut: wasGoing, say: wasGoing ? "Confirm they're out in one line. The group gets a refill if someone is free." : "Confirm in one line. Never ask why." };
  }
  if (mine) return { ok: true, answer: "down", youreGoing: true, going: names, say: "It's already on and they're in. Call get_reveal for the details." };
  return { ok: false, error: "already_on", youreGoing: false, going: names, say: "It's on without room for that answer. Name only who's going." };
}

function uniqueFirstNames(members: Doc<"users">[]): string[] {
  return [...new Set(members.map((m) => firstName(m.name)))];
}

function resolveNames(members: Doc<"users">[], selfId: Id<"users">, names: string[]) {
  const others = members.filter((m) => m._id !== selfId);
  const ids: Id<"users">[] = [];
  const unknown: string[] = [];
  const ambiguous: { name: string; options: string[] }[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    const exact = others.filter((m) => m.name.toLowerCase() === name);
    const byFirst = others.filter((m) => firstName(m.name).toLowerCase() === name);
    const byPrefix = others.filter((m) => m.name.toLowerCase().startsWith(name));
    const hits = exact.length ? exact : byFirst.length ? byFirst : byPrefix;
    if (hits.length === 1) {
      if (!ids.includes(hits[0]._id)) ids.push(hits[0]._id);
    } else if (hits.length > 1) {
      ambiguous.push({ name: raw, options: hits.map((h) => h.name) });
    } else {
      unknown.push(raw);
    }
  }
  return { ids, unknown, ambiguous, crew: others.map((m) => firstName(m.name)) };
}

const closedAnswer = { ok: false, error: "closed", say: "Today's plan has closed. Tomorrow's drop is the next chance." };
const slowDownAnswer = { ok: false, error: "slow_down", say: "That was a lot of answers in a row. Try again in a minute." };

type TapWrite = {
  userId: Id<"users">;
  frolicId: Id<"frolics">;
  kind: "down" | "notToday";
  onlyIf: Id<"users">[];
  window?: { start: number; end: number };
};

export function tapErrorAnswer(data: { code?: string; kind?: string } | undefined) {
  if (data?.code === "CLOSED") return closedAnswer;
  if (data?.code === "BAD_ONLY_IF") return unclearAnswer;
  if (data?.code === "BAD_WINDOW") return timeUnclearAnswer;
  if (data?.kind === "RateLimited") return slowDownAnswer;
  return null;
}

async function writeTap(ctx: MutationCtx, input: TapWrite) {
  try {
    await ctx.runMutation(tapAs, { ...input, source: "imessage" });
    return null;
  } catch (error) {
    if (error instanceof ConvexError) {
      const answer = tapErrorAnswer(error.data as { code?: string; kind?: string } | undefined);
      if (answer) return answer;
    }
    throw error;
  }
}

export const tap = internalMutation({
  args: {
    phone: v.string(),
    kind: v.union(v.literal("down"), v.literal("pass")),
    onlyWith: v.array(v.string()),
    after: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const me = await who(ctx, args.phone);
    if (!me) return notMember;
    const open = await openFrolicFor(ctx, me, args.now);
    if ("error" in open) return open.error;
    const frolic = open.frolic;
    const wasGoing = open.revealed && (await goingAttendees(ctx, frolic._id)).some((a) => a.userId === me.user._id);
    if (args.kind === "pass") {
      const failed = await writeTap(ctx, { userId: me.user._id, frolicId: frolic._id, kind: "notToday", onlyIf: [] });
      if (failed) return failed;
      if (open.revealed) return await afterReveal(ctx, me, frolic._id, "pass", wasGoing);
      return { ok: true, answer: "pass", say: "Confirm in one line. Never ask why." };
    }
    if (args.onlyWith.length > 3) return { ok: false, error: "too_many_names", say: "Only if works with up to 3 friends." };
    const members = await crewMembers(ctx, me.group._id);
    const resolved = resolveNames(members, me.user._id, args.onlyWith);
    if (resolved.unknown.length || resolved.ambiguous.length) {
      return { ok: false, error: "names_unclear", unknown: resolved.unknown, ambiguous: resolved.ambiguous, crew: resolved.crew, say: "Ask which friend they mean. Nothing was saved." };
    }
    let window: { start: number; end: number } | undefined;
    if (args.after) {
      const clock = parseClock(args.after, localHour(frolic.window.start, me.group.timezone));
      if (!clock) return { ok: false, error: "time_unclear", say: "Ask for a time like 7 or 7:30. Nothing was saved." };
      const start = localTimeOnSameDay(frolic.window.start, clock.hour, clock.minute, me.group.timezone);
      if (start >= frolic.window.end) return { ok: false, error: "too_late", say: "That's after the plan wraps up. Nothing was saved." };
      window = { start: Math.max(start, frolic.window.start), end: frolic.window.end };
    }
    const failed = await writeTap(ctx, { userId: me.user._id, frolicId: frolic._id, kind: "down", onlyIf: resolved.ids, ...(window ? { window } : {}) });
    if (failed) return failed;
    if (open.revealed) return await afterReveal(ctx, me, frolic._id, "down", wasGoing);
    const onlyWithNames = await namesOf(ctx, resolved.ids);
    return {
      ok: true,
      answer: onlyWithNames.length || window ? "only_if" : "down",
      onlyWith: onlyWithNames,
      after: args.after ?? null,
      say: "Confirm in one line: Got it. Secret's safe. Then stay quiet until something changes.",
    };
  },
});

export const getReveal = internalQuery({
  args: { phone: v.string(), now: v.number() },
  handler: async (ctx, { phone, now }) => {
    const me = await who(ctx, phone);
    if (!me) return notMember;
    const frolic = await currentFrolic(ctx, me.group._id, now, me.group.timezone);
    if (!frolic) return { ok: true, state: "no_plan" };
    if (frolic.status === "done") return { ok: true, state: "done", say: "That plan has wrapped. Ask how it was, or mention tomorrow's drop." };
    if (!isRevealed(frolic, now)) {
      if (frolic.status === "faded" || (frolic.status === "open" && now >= frolic.deadline)) {
        return { ok: true, state: "faded", say: "Say it faded, gently, and mention tomorrow. No guilt." };
      }
      return { ok: true, state: "not_yet", say: SECRET_LINE };
    }
    const going = await goingAttendees(ctx, frolic._id);
    const mine = going.some((a) => a.userId === me.user._id);
    const walk = await walkMinutes(ctx, frolic._id, me.user._id);
    const details = await planDetails(ctx, frolic, me.group.timezone, walk);
    const names = await namesOf(ctx, going.filter((a) => a.userId !== me.user._id).map((a) => a.userId));
    if (!mine) {
      return { ok: true, state: "on_without_you", going: names, plan: details.view, say: "Name only who's going. Offer a hop in without pressure." };
    }
    const deposit = await ctx.db
      .query("whopPlans")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
      .first();
    return {
      ok: true,
      state: "on",
      going: names,
      headline: "It's on. You, " + joinNames(names) + ".",
      plan: details.view,
      deposit: deposit ? { amount: "$" + (deposit.amountCents / 100).toFixed(deposit.amountCents % 100 ? 2 : 0) } : null,
    };
  },
});

async function revealedAttendee(ctx: QueryCtx, me: Who, now: number) {
  const frolic = await currentFrolic(ctx, me.group._id, now, me.group.timezone);
  if (!frolic || frolic.status === "done" || !isRevealed(frolic, now)) return null;
  const going = await goingAttendees(ctx, frolic._id);
  if (!going.some((a) => a.userId === me.user._id)) return null;
  return frolic;
}

const unclearAnswer = { ok: false, error: "names_unclear", say: "Ask which friend they mean. Nothing was saved." };
const timeUnclearAnswer = { ok: false, error: "time_unclear", say: "Ask for a time like 7 or 7:30. Nothing was saved." };

const notGoing = { ok: false, error: "not_on", say: "This only works once a plan is on and they're in it." };

export const onMyWay = internalMutation({
  args: { phone: v.string(), minutes: v.number(), now: v.number() },
  handler: async (ctx, { phone, minutes, now }) => {
    const me = await who(ctx, phone);
    if (!me) return notMember;
    const frolic = await revealedAttendee(ctx, me, now);
    if (!frolic) return notGoing;
    const rounded = Math.max(0, Math.min(240, Math.round(minutes)));
    await ctx.runMutation(setEtaAs, { userId: me.user._id, frolicId: frolic._id, minutes: rounded, onTheWay: true });
    return { ok: true, minutes: rounded, say: "Tell them the group can see they're " + rounded + " min away." };
  },
});

export const checkIn = internalMutation({
  args: {
    phone: v.string(),
    coords: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    now: v.number(),
  },
  handler: async (ctx, { phone, coords, now }) => {
    const me = await who(ctx, phone);
    if (!me) return notMember;
    const frolic = await revealedAttendee(ctx, me, now);
    if (!frolic) return notGoing;
    if (coords) {
      const details = await planDetails(ctx, frolic, me.group.timezone, DEFAULT_WALK_MINUTES);
      const target = meetingCoords(details.plan, details.place);
      if (target) {
        const meters = metersBetween(coords, target);
        if (meters > CHECKIN_RADIUS_METERS) {
          return { ok: false, error: "too_far", meters, place: details.view.meetingPoint, say: "They look about " + Math.round(meters / 100) / 10 + " km away. Not checked in yet." };
        }
      }
    }
    await ctx.runMutation(checkInAs, { userId: me.user._id, frolicId: frolic._id, method: "imessage" });
    return { ok: true, checkedIn: true, viaLocation: !!coords };
  },
});

export const snapTarget = internalQuery({
  args: { phone: v.string(), now: v.number() },
  handler: async (ctx, { phone, now }) => {
    const me = await who(ctx, phone);
    if (!me) return { ok: false as const, body: notMember };
    const frolic = await revealedAttendee(ctx, me, now);
    if (!frolic) return { ok: false as const, body: notGoing };
    if (frolic.snapAt === undefined || now < frolic.snapAt - 1000 || now > frolic.snapAt + SNAP_WINDOW_MS) {
      return { ok: false as const, body: { ok: false, error: "snap_not_open", say: "The group snap hasn't started. You'll get a text when it does." } };
    }
    const checkin = await ctx.db
      .query("checkins")
      .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolic._id).eq("userId", me.user._id))
      .unique();
    if (!checkin) return { ok: false as const, body: { ok: false, error: "not_checked_in", say: "Check them in first, then they can add a photo." } };
    return { ok: true as const, userId: me.user._id, frolicId: frolic._id };
  },
});

export const submitSnap = internalMutation({
  args: { userId: v.id("users"), frolicId: v.id("frolics"), storageId: v.id("_storage"), now: v.number() },
  handler: async (ctx, { userId, frolicId, storageId, now }) => {
    await ctx.runMutation(addSnapAs, { userId, frolicId, storageId, takenAt: now });
    const collage = await ctx.db
      .query("collages")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
      .first();
    const collageUrl = collage ? await ctx.storage.getUrl(collage.storageId) : null;
    return { ok: true, added: true, collageUrl, say: collageUrl ? "Send them the collage link." : "Tell them the collage comes as soon as the others add theirs." };
  },
});

export const depositTarget = internalQuery({
  args: { phone: v.string(), now: v.number() },
  handler: async (ctx, { phone, now }) => {
    const me = await who(ctx, phone);
    if (!me) return { ok: false as const, body: notMember };
    const frolic = await revealedAttendee(ctx, me, now);
    if (!frolic) return { ok: false as const, body: notGoing };
    const plan = await ctx.db
      .query("whopPlans")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
      .first();
    const share = await ctx.db
      .query("shares")
      .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolic._id).eq("userId", me.user._id))
      .first();
    if (share && (share.status === "held" || share.status === "released" || share.status === "paid")) {
      return { ok: false as const, body: { ok: false, error: "already_paid", say: "Their deposit is already in." } };
    }
    return { ok: true as const, userId: me.user._id, frolicId: frolic._id, amountCents: plan?.amountCents ?? null };
  },
});

export const imFree = internalMutation({
  args: { phone: v.string(), forMinutes: v.number() },
  handler: async (ctx, { phone, forMinutes }) => {
    const me = await who(ctx, phone);
    if (!me) return notMember;
    if (!keikiEnv().imFree) return { ok: false, error: "not_ready", say: "Starting a plan from a text is not on yet. Offer today's plan instead." };
    const minutes = Math.max(30, Math.min(480, Math.round(forMinutes)));
    let result: { planTitle?: string; startsAt?: number; error?: string } | null;
    try {
      result = await ctx.runMutation(imFreeAs, { userId: me.user._id, groupId: me.group._id, forMinutes: minutes });
    } catch {
      return { ok: false, error: "not_ready", say: "Starting a plan from a text did not go through. Offer today's plan instead." };
    }
    if (!result || result.error || result.planTitle === undefined || result.startsAt === undefined) {
      return { ok: false, error: result?.error ?? "not_ready", say: "That did not start. Offer today's plan instead." };
    }
    return {
      ok: true,
      plan: result.planTitle,
      startsAt: clockTime(result.startsAt, me.group.timezone),
      say: "Say the plan is going to the crew without naming who started it. Tell them they are counted as down.",
    };
  },
});

export const remember = internalMutation({
  args: { phone: v.string(), text: v.string(), now: v.number() },
  handler: async (ctx, { phone, text, now }) => {
    const me = await who(ctx, phone);
    if (!me) return notMember;
    const clean = text.trim().slice(0, 500);
    if (!clean) return { ok: false, error: "empty", say: "Ask what they'd like Frolic to remember." };
    await ctx.runMutation(recordMemoryEvent, {
      eventKey: "keiki:remember:" + me.user._id + ":" + now,
      kind: "limit",
      groupId: me.group._id,
      userId: me.user._id,
      payload: { text: clean },
      source: "imessage",
    });
    return { ok: true, remembered: clean };
  },
});

export const pause = internalMutation({
  args: { phone: v.string(), paused: v.boolean() },
  handler: async (ctx, { phone, paused }) => {
    const link = await linkForPhone(ctx, phone);
    if (!link) return notMember;
    await ctx.db.patch("keikiLinks", link._id, { paused });
    return { ok: true, paused };
  },
});

async function upsertLink(ctx: MutationCtx, phone: string, userId: Id<"users">, now: number) {
  const link = await linkForPhone(ctx, phone);
  if (link) {
    if (link.userId !== userId) await ctx.db.patch("keikiLinks", link._id, { userId });
    return;
  }
  await ctx.db.insert("keikiLinks", { phone, userId, paused: false, linkedAt: now });
}

async function validInvite(ctx: QueryCtx, code: string, now: number) {
  const invite = await ctx.db
    .query("invites")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .unique();
  if (!invite || invite.revoked || (invite.expiresAt !== undefined && invite.expiresAt < now)) return null;
  return invite;
}

export const joinCrew = internalMutation({
  args: { phone: v.string(), code: v.string(), name: v.string(), now: v.number() },
  handler: async (ctx, { phone, code, name, now }) => {
    const invite = await validInvite(ctx, code, now);
    if (!invite) return { ok: false, error: "bad_invite", say: "That invite code didn't work. Ask them to check the link they got." };
    const cleanName = name.trim().slice(0, 40);
    if (!cleanName) return { ok: false, error: "no_name", say: "Ask their first name first." };
    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    const userId = existing?._id ?? (await ctx.runMutation(createUserAs, { name: cleanName, phone }));
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", invite.groupId).eq("userId", userId))
      .unique();
    if (!member) await ctx.runMutation(joinAs, { userId, inviteCode: invite.code, via: "imessage" });
    await upsertLink(ctx, phone, userId, now);
    const group = await ctx.db.get("groups", invite.groupId);
    const members = await crewMembers(ctx, invite.groupId);
    return {
      ok: true,
      crew: group?.name ?? null,
      name: firstName(cleanName),
      friends: uniqueFirstNames(members.filter((m) => m._id !== userId)),
      say: "Welcome them in one line, then call get_today.",
    };
  },
});

export const linkGroupChat = internalMutation({
  args: { chatId: v.string(), code: v.string(), now: v.number() },
  handler: async (ctx, { chatId, code, now }) => {
    const invite = await validInvite(ctx, code, now);
    if (!invite) return { ok: false, error: "bad_invite", say: "That invite code didn't work." };
    const existing = await ctx.db
      .query("keikiGroupChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (existing && existing.groupId !== invite.groupId) {
      return { ok: false, error: "already_linked", say: "This chat is already connected to another crew." };
    }
    if (existing) await ctx.db.patch("keikiGroupChats", existing._id, { groupId: invite.groupId });
    else await ctx.db.insert("keikiGroupChats", { chatId, groupId: invite.groupId, linkedAt: now });
    const group = await ctx.db.get("groups", invite.groupId);
    return { ok: true, crew: group?.name ?? null, say: "Say the daily plan will drop here, and that everyone answers in a DM so it stays secret." };
  },
});

export const findRequest = internalQuery({
  args: { requestKey: v.string() },
  handler: async (ctx, { requestKey }) => {
    const row = await ctx.db
      .query("keikiRequests")
      .withIndex("by_requestKey", (q) => q.eq("requestKey", requestKey))
      .unique();
    return row ? { status: row.status, response: row.response } : null;
  },
});

export const saveRequest = internalMutation({
  args: { requestKey: v.string(), tool: v.string(), status: v.number(), response: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("keikiRequests")
      .withIndex("by_requestKey", (q) => q.eq("requestKey", args.requestKey))
      .unique();
    if (row) return null;
    await ctx.db.insert("keikiRequests", { requestKey: args.requestKey, tool: args.tool, status: args.status, response: args.response, at: args.now });
    return null;
  },
});

import { ConvexError, v } from "convex/values";
import { env, internalQuery, mutation, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { findMembership, findUserByToken } from "../lib/identity";
import { photoUrlOf } from "../lib/photo";
import { heroUrl } from "./hero";

export const card = v.object({
  label: v.string(),
  no: v.string(),
  title: v.string(),
  chips: v.array(v.string()),
  why: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
});

const mate = v.object({
  name: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
});

export const view = v.object({
  phase: v.union(
    v.literal("invalid"),
    v.literal("expired"),
    v.literal("drifted"),
    v.literal("open"),
    v.literal("planted"),
    v.literal("on"),
  ),
  host: v.union(v.string(), v.null()),
  group: v.union(v.string(), v.null()),
  card: v.union(card, v.null()),
  me: v.union(v.string(), v.null()),
  avatar: v.union(v.string(), v.null()),
  revealAt: v.union(v.number(), v.null()),
  mates: v.array(mate),
  meet: v.union(v.string(), v.null()),
  time: v.union(v.string(), v.null()),
});

type View = {
  phase: "invalid" | "expired" | "drifted" | "open" | "planted" | "on";
  host: string | null;
  group: string | null;
  card: { label: string; no: string; title: string; chips: string[]; why: string | null; imageUrl: string | null } | null;
  me: string | null;
  avatar: string | null;
  revealAt: number | null;
  mates: { name: string; avatarUrl: string | null }[];
  meet: string | null;
  time: string | null;
};

type Today = {
  phase: string;
  myTap: { kind: string } | null;
  reveal: { revealAt: number; going: { userId: string; name: string; photoUrl: string | null }[] } | null;
};

const dead: View = {
  phase: "invalid",
  host: null,
  group: null,
  card: null,
  me: null,
  avatar: null,
  revealAt: null,
  mates: [],
  meet: null,
  time: null,
};

async function inviteFor(ctx: QueryCtx | MutationCtx, code: string) {
  return await ctx.db
    .query("invites")
    .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
    .unique();
}

function timeIn(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(ms))
    .replace(/\s?(AM|PM)/, (_all, half: string) => ` ${half.toLowerCase()}`);
}

function weekdayIn(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" })
    .format(new Date(ms))
    .toUpperCase();
}

function duration(minutes: number): string {
  if (minutes % 60 !== 0) return `${minutes} min`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

async function cardFor(ctx: QueryCtx, frolic: Doc<"frolics">) {
  const group = await ctx.db.get(frolic.groupId);
  const plan = frolic.planId ? await ctx.db.get(frolic.planId) : null;
  if (!group || !plan) return null;
  const place = await ctx.db.get(plan.placeId);
  const chips =
    plan.chips.length > 0
      ? plan.chips
      : [plan.cost > 0 ? `$${plan.cost}` : "Free", duration(plan.durationMinutes)];
  return {
    label: `TODAY · ${weekdayIn(frolic.startsAt ?? plan.startsAt, group.timezone)}`,
    no: "Frolic",
    title: plan.title,
    chips,
    why: plan.why ?? plan.line,
    imageUrl: heroUrl(place?.tags ?? []) ?? place?.photoUrl ?? null,
  };
}

function prequel(frolic: Doc<"frolics">): "open" | "drifted" | "expired" {
  if (frolic.status === "done") return "expired";
  if (frolic.status === "faded" || (frolic.status === "open" && Date.now() > frolic.deadline)) {
    return "drifted";
  }
  return "open";
}

export const watch = query({
  args: { code: v.string(), deviceToken: v.string() },
  returns: view,
  handler: async (ctx, args): Promise<View> => {
    const invite = await inviteFor(ctx, args.code);
    if (!invite || invite.revoked) return dead;
    if (invite.expiresAt !== undefined && invite.expiresAt < Date.now()) {
      return { ...dead, phase: "expired" };
    }
    const frolic = invite.frolicId ? await ctx.db.get(invite.frolicId) : null;
    if (!frolic) {
      const group = await ctx.db.get(invite.groupId);
      return { ...dead, group: group?.name ?? null };
    }
    const group = await ctx.db.get(frolic.groupId);
    const host = await ctx.db.get(invite.createdBy);
    const plan = frolic.planId ? await ctx.db.get(frolic.planId) : null;
    const base = {
      host: host?.name ?? null,
      group: group?.name ?? null,
      card: await cardFor(ctx, frolic),
      meet: plan?.meetingPoint?.label ?? null,
      time: plan && group ? timeIn(plan.startsAt, group.timezone) : null,
    };
    const user = await findUserByToken(ctx, args.deviceToken);
    if (!user || !(await findMembership(ctx, frolic.groupId, user._id))) {
      return { ...base, ...blank(prequel(frolic)), me: null, avatar: null, revealAt: null, mates: [] };
    }

    const today = (await ctx.runQuery(api.frolics.today, {
      deviceToken: args.deviceToken,
      groupId: frolic.groupId,
      frolicId: frolic._id,
    })) as Today;

    const mine = today.myTap?.kind === "down";
    const me = mine ? user.name : null;
    const avatar = await photoUrlOf(ctx, user);

    if (today.reveal) {
      if (Date.now() < today.reveal.revealAt) {
        return { ...base, ...blank("planted"), me, avatar, revealAt: today.reveal.revealAt, mates: [] };
      }
      const mates: { name: string; avatarUrl: string | null }[] = [];
      for (const person of today.reveal.going) {
        if (person.userId === user._id) continue;
        if (mates.some((m) => m.name === person.name)) continue;
        mates.push({ name: person.name, avatarUrl: person.photoUrl });
      }
      return { ...base, ...blank("on"), me, avatar, revealAt: today.reveal.revealAt, mates };
    }
    if (today.phase === "waiting" || today.myTap) {
      return { ...base, ...blank("planted"), me, avatar, revealAt: null, mates: [] };
    }
    if (today.phase === "faded") return { ...base, ...blank("drifted"), me: null, avatar: null, revealAt: null, mates: [] };
    if (today.phase === "done") return { ...base, ...blank("expired"), me: null, avatar: null, revealAt: null, mates: [] };
    return { ...base, ...blank("open"), me: null, avatar: null, revealAt: null, mates: [] };
  },
});

export const peek = internalQuery({
  args: { code: v.string() },
  returns: v.union(
    v.object({
      phase: v.string(),
      host: v.union(v.string(), v.null()),
      group: v.union(v.string(), v.null()),
      card: v.union(card, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const invite = await inviteFor(ctx, args.code);
    if (!invite || invite.revoked) return null;
    const frolic = invite.frolicId ? await ctx.db.get(invite.frolicId) : null;
    const group = await ctx.db.get(invite.groupId);
    const host = await ctx.db.get(invite.createdBy);
    return {
      phase: frolic ? prequel(frolic) : "open",
      host: host?.name ?? null,
      group: group?.name ?? null,
      card: frolic ? await cardFor(ctx, frolic) : null,
    };
  },
});

export const create = mutation({
  args: { frolicId: v.id("frolics"), deviceToken: v.string() },
  returns: v.object({ code: v.string(), url: v.string() }),
  handler: async (ctx, args): Promise<{ code: string; url: string }> => {
    const frolic = await ctx.db.get(args.frolicId);
    if (!frolic) throw new ConvexError({ code: "NOT_FOUND", message: "This frolic is gone" });
    const code: string = await ctx.runMutation(api.users.createInvite, {
      deviceToken: args.deviceToken,
      groupId: frolic.groupId,
      frolicId: args.frolicId,
    });
    return { code, url: `${env.CONVEX_SITE_URL}/p/${code}` };
  },
});

export const join = mutation({
  args: { code: v.string(), deviceToken: v.string(), name: v.string() },
  returns: v.object({ ok: v.boolean(), phase: v.string() }),
  handler: async (ctx, args) => {
    const name = args.name.trim().slice(0, 24);
    if (name.length < 1) throw new ConvexError({ code: "BAD_NAME", message: "A first name is required" });
    const invite = await inviteFor(ctx, args.code);
    if (!invite || invite.revoked || !invite.frolicId) return { ok: false, phase: "invalid" };
    const frolic = await ctx.db.get(invite.frolicId);
    if (!frolic) return { ok: false, phase: "invalid" };
    if (frolic.status === "done") return { ok: false, phase: "expired" };
    if (frolic.status === "faded" || (frolic.status === "open" && Date.now() > frolic.deadline)) {
      return { ok: false, phase: "drifted" };
    }
    let joined: { userId: Id<"users"> };
    try {
      joined = await ctx.runMutation(api.users.joinGroup, {
        deviceToken: args.deviceToken,
        firstName: name,
        inviteCode: invite.code,
        via: "web",
      });
    } catch (error) {
      const code = error instanceof ConvexError ? (error.data as { code?: string }).code : undefined;
      if (code === "BAD_INVITE") return { ok: false, phase: "invalid" };
      throw error;
    }
    try {
      await ctx.runMutation(internal.taps.tapAs, {
        userId: joined.userId,
        frolicId: invite.frolicId,
        kind: "down",
        source: "web",
      });
    } catch (error) {
      const code = error instanceof ConvexError ? (error.data as { code?: string }).code : undefined;
      if (code === "CLOSED") return { ok: false, phase: "drifted" };
      if (code === "RATE_LIMITED") throw new ConvexError({ code: "SLOW_DOWN", message: "One tap at a time" });
      throw error;
    }
    return { ok: true, phase: "planted" };
  },
});

function blank(phase: View["phase"]): Pick<View, "phase"> {
  return { phase };
}

import { ConvexError, v } from "convex/values";
import { env, internalQuery, mutation, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { findMembership, findUserByToken } from "../lib/identity";

export const card = v.object({
  label: v.string(),
  no: v.string(),
  title: v.string(),
  chips: v.array(v.string()),
  why: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
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
  revealAt: v.union(v.number(), v.null()),
  mates: v.array(v.string()),
  meet: v.union(v.string(), v.null()),
  time: v.union(v.string(), v.null()),
});

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
    imageUrl: place?.photoUrl ?? null,
  };
}

const dead = {
  phase: "invalid" as const,
  host: null,
  group: null,
  card: null,
  me: null,
  revealAt: null,
  mates: [],
  meet: null,
  time: null,
};

export const watch = query({
  args: { code: v.string(), deviceToken: v.string() },
  returns: view,
  handler: async (ctx, args) => {
    const invite = await inviteFor(ctx, args.code);
    if (!invite || invite.revoked) return dead;
    if (invite.expiresAt !== undefined && invite.expiresAt < Date.now()) {
      return { ...dead, phase: "expired" as const };
    }
    const frolic = invite.frolicId ? await ctx.db.get(invite.frolicId) : null;
    if (!frolic) {
      const group = await ctx.db.get(invite.groupId);
      return { ...dead, group: group?.name ?? null };
    }
    const group = await ctx.db.get(frolic.groupId);
    const host = await ctx.db.get(invite.createdBy);
    const built = await cardFor(ctx, frolic);
    const plan = frolic.planId ? await ctx.db.get(frolic.planId) : null;
    const base = {
      host: host?.name ?? null,
      group: group?.name ?? null,
      card: built,
      meet: plan?.meetingPoint?.label ?? null,
      time: plan ? timeIn(plan.startsAt, group!.timezone) : null,
    };
    const user = await findUserByToken(ctx, args.deviceToken);
    if (!user || !(await findMembership(ctx, frolic.groupId, user._id))) {
      return { ...base, ...prequel(frolic), me: null, revealAt: null, mates: [] };
    }

    const today = (await ctx.runQuery(api.frolics.today, {
      deviceToken: args.deviceToken,
      groupId: frolic.groupId,
      frolicId: frolic._id,
    })) as {
      phase: string;
      groupName: string;
      frolic: { frolicId: string } | null;
      myTap: { kind: string } | null;
      reveal: {
        revealAt: number;
        going: { userId: string; name: string }[];
      } | null;
    };

    const me = today.myTap?.kind === "down" ? user.name : null;
    if (today.reveal) {
      const now = Date.now();
      if (now < today.reveal.revealAt) {
        return {
          ...base,
          phase: "planted" as const,
          me,
          revealAt: today.reveal.revealAt,
          mates: [],
        };
      }
      return {
        ...base,
        phase: "on" as const,
        me,
        revealAt: today.reveal.revealAt,
        mates: today.reveal.going
          .filter((p) => p.userId !== user._id)
          .map((p) => p.name)
          .filter((name, i, all) => all.indexOf(name) === i),
      };
    }
    if (today.phase === "waiting" || today.myTap) {
      return { ...base, phase: "planted" as const, me, revealAt: null, mates: [] };
    }
    if (today.phase === "faded") return { ...base, phase: "drifted" as const, me: null, revealAt: null, mates: [] };
    if (today.phase === "done") return { ...base, phase: "expired" as const, me: null, revealAt: null, mates: [] };
    return { ...base, phase: "open" as const, me: null, revealAt: null, mates: [] };
  },
});

function prequel(frolic: Doc<"frolics">): { phase: "open" | "drifted" | "expired" } {
  if (frolic.status === "done") return { phase: "expired" };
  if (frolic.status === "faded" || (frolic.status === "open" && Date.now() > frolic.deadline)) {
    return { phase: "drifted" };
  }
  return { phase: "open" };
}

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
      phase: frolic ? prequel(frolic).phase : "open",
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
      throw error;
    }
    return { ok: true, phase: "planted" };
  },
});

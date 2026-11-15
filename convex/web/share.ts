import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

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
    v.literal("open"),
    v.literal("planted"),
    v.literal("on"),
    v.literal("drifted"),
    v.literal("expired"),
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

async function digest(guest: string): Promise<string> {
  const bytes = new TextEncoder().encode(`frolic:${guest}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join("");
}

async function inviteFor(ctx: QueryCtx | MutationCtx, code: string) {
  return await ctx.db
    .query("invites")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

function timeIn(ms: number, timezone: string, withMinutes: boolean): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: withMinutes ? "2-digit" : undefined,
    hour12: true,
  })
    .format(new Date(ms))
    .replace(/\s?AM|\s?PM/, (m) => m.trim().toLowerCase());
}

function weekdayIn(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" })
    .format(new Date(ms))
    .toUpperCase();
}

function duration(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${minutes} min`;
}

async function buildCard(
  ctx: QueryCtx | MutationCtx,
  group: Doc<"groups">,
  frolic: Doc<"frolics">,
) {
  const plan = frolic.planId ? await ctx.db.get(frolic.planId) : null;
  if (!plan) {
    return {
      label: "TODAY",
      no: "Frolic",
      title: group.name,
      chips: [],
      why: null,
      imageUrl: null,
    };
  }
  const place = await ctx.db.get(plan.placeId);
  const chips: string[] = [];
  if (place && place.cost > 0) chips.push(`$${place.cost}`);
  else chips.push("Free");
  chips.push(duration(plan.durationMinutes));
  if (place?.blurb) chips.push(place.blurb);
  return {
    label: `TODAY · ${weekdayIn(plan.startsAt, group.timezone)}`,
    no: "Frolic",
    title: plan.title,
    chips,
    why: plan.why ?? plan.line,
    imageUrl: place?.photoUrl ?? null,
  };
}

async function userFor(ctx: QueryCtx | MutationCtx, guest: string) {
  const tokenHash = await digest(guest);
  return await ctx.db
    .query("users")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
}

export const watch = query({
  args: { code: v.string(), guest: v.string() },
  returns: view,
  handler: async (ctx, args) => {
    const empty = {
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
    const invite = await inviteFor(ctx, args.code);
    if (!invite || invite.revoked || !invite.frolicId) return empty;
    if (invite.expiresAt !== undefined && invite.expiresAt < Date.now()) {
      return { ...empty, phase: "expired" as const };
    }
    const frolic = await ctx.db.get(invite.frolicId);
    if (!frolic) return empty;
    const group = await ctx.db.get(frolic.groupId);
    if (!group) return empty;

    const now = Date.now();
    const plan = frolic.planId ? await ctx.db.get(frolic.planId) : null;
    const host = await ctx.db.get(invite.createdBy);
    const card = await buildCard(ctx, group, frolic);
    const base = {
      host: host?.name ?? null,
      group: group.name,
      card,
      meet: plan?.meetingPoint?.label ?? null,
      time: plan ? timeIn(plan.startsAt, group.timezone, true) : null,
      revealAt: frolic.revealAt ?? null,
    };

    const me = await userFor(ctx, args.guest);
    const myTap = me
      ? await ctx.db
          .query("taps")
          .withIndex("by_frolicId_and_userId", (q) =>
            q.eq("frolicId", frolic._id).eq("userId", me._id),
          )
          .first()
      : null;
    const mine = myTap?.kind === "down" ? me?.name ?? null : null;

    if (frolic.status === "on") {
      const revealed =
        frolic.revealAt !== undefined && now >= frolic.revealAt;
      if (!revealed) {
        return {
          ...base,
          phase: "planted" as const,
          me: mine,
          mates: [],
        };
      }
      const going = await ctx.db
        .query("attendees")
        .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
        .collect();
      const names: string[] = [];
      for (const row of going) {
        if (row.status !== "going" || row.userId === me?._id) continue;
        const person = await ctx.db.get(row.userId);
        if (person) names.push(person.name);
      }
      return {
        ...base,
        phase: "on" as const,
        me: mine,
        mates: names,
      };
    }
    if (frolic.status === "done") {
      return { ...base, phase: "expired" as const, me: mine, mates: [] };
    }
    if (frolic.status === "faded" || now > frolic.deadline) {
      return { ...base, phase: "drifted" as const, me: mine, mates: [] };
    }
    return {
      ...base,
      phase: mine ? ("planted" as const) : ("open" as const),
      me: mine,
      mates: [],
    };
  },
});

export const create = mutation({
  args: { frolicId: v.id("frolics") },
  returns: v.object({ code: v.string(), url: v.string() }),
  handler: async (ctx, args) => {
    const frolic = await ctx.db.get(args.frolicId);
    if (!frolic) throw new Error("That frolic is gone");
    const dayEnd = frolic.deadline + 6 * 60 * 60 * 1000;
    const existing = await ctx.db
      .query("invites")
      .withIndex("by_groupId_and_kind", (q) =>
        q.eq("groupId", frolic.groupId).eq("kind", "frolic"),
      )
      .collect();
    const live = existing.find(
      (row) =>
        row.frolicId === args.frolicId &&
        !row.revoked &&
        (row.expiresAt === undefined || row.expiresAt > Date.now()),
    );
    const code = live ? live.code : newCode();
    if (!live) {
      const creator = await ctx.db
        .query("memberships")
        .withIndex("by_groupId", (q) => q.eq("groupId", frolic.groupId))
        .first();
      if (!creator) throw new Error("That frolic has no crew yet");
      await ctx.db.insert("invites", {
        code,
        groupId: frolic.groupId,
        createdBy: creator.userId,
        kind: "frolic",
        frolicId: args.frolicId,
        expiresAt: dayEnd,
        revoked: false,
      });
    }
    return { code, url: `/p/${code}` };
  },
});

export const join = mutation({
  args: {
    code: v.string(),
    guest: v.string(),
    name: v.string(),
  },
  returns: v.object({ ok: v.boolean(), phase: v.string() }),
  handler: async (ctx, args) => {
    const name = args.name.trim().slice(0, 24);
    if (name.length < 1) throw new Error("A first name is required");
    if (args.guest.length < 16) throw new Error("This link lost your place, reload it");
    const invite = await inviteFor(ctx, args.code);
    if (!invite || invite.revoked || !invite.frolicId) {
      return { ok: false, phase: "invalid" };
    }
    const frolic = await ctx.db.get(invite.frolicId);
    if (!frolic) return { ok: false, phase: "invalid" };
    if (frolic.status === "done") return { ok: false, phase: "expired" };
    const tokenHash = await digest(args.guest);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (frolic.status === "faded" || (frolic.status === "open" && Date.now() > frolic.deadline)) {
      return { ok: false, phase: "drifted" };
    }
    const userId: Id<"users"> = existing
      ? existing._id
      : await ctx.db.insert("users", { name, source: "web", tokenHash });
    if (existing && existing.name !== name) {
      await ctx.db.patch(existing._id, { name });
    }
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_groupId_and_userId", (q) =>
        q.eq("groupId", frolic.groupId).eq("userId", userId),
      )
      .first();
    if (!membership) {
      const colors = ["pink", "cobalt", "moss", "marigold", "tomato", "lilac"] as const;
      let pick = 0;
      for (const c of tokenHash) pick = (pick * 31 + c.charCodeAt(0)) >>> 0;
      await ctx.db.insert("memberships", {
        groupId: frolic.groupId,
        userId,
        color: colors[pick % colors.length],
        joinedVia: "web",
      });
    }
    const result: { status: string; revealAt: number | null } = await ctx.runMutation(
      internal.taps.tap,
      {
        frolicId: frolic._id,
        userId,
        kind: "down",
        source: "web",
      },
    );
    return { ok: true, phase: result.status === "on" ? "on" : "planted" };
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
      meet: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const invite = await inviteFor(ctx, args.code);
    if (!invite || invite.revoked || !invite.frolicId) return null;
    const frolic = await ctx.db.get(invite.frolicId);
    if (!frolic) return null;
    const group = await ctx.db.get(frolic.groupId);
    if (!group) return null;
    const plan = frolic.planId ? await ctx.db.get(frolic.planId) : null;
    const host = await ctx.db.get(invite.createdBy);
    const now = Date.now();
    const phase =
      frolic.status === "on"
        ? "on"
        : frolic.status === "done"
          ? "expired"
          : frolic.status === "faded" || now > frolic.deadline
            ? "drifted"
            : "open";
    return {
      phase,
      host: host?.name ?? null,
      group: group.name,
      card: await buildCard(ctx, group, frolic),
      meet: plan?.meetingPoint?.label ?? null,
    };
  },
});

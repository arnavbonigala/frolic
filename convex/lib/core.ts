import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findMatch, type TimeWindow } from "./matcher";
import { rateLimiter } from "./rateLimits";
import { findMembership, requireMember } from "./identity";
import { recordTap } from "./hooks";

export const REVEAL_DELAY_MS = 1500;
export const BLOOM_LEAD_MS = 800;
export const LEAVE_NUDGE_MS = 8 * 60 * 1000;
const MAX_TAPS = 200;

export type TapInput = {
  frolicId: Id<"frolics">;
  kind: "down" | "notToday";
  onlyIf?: Id<"users">[];
  window?: TimeWindow;
  source: "app" | "web" | "notification" | "imessage";
};

export function closed(message: string): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: "CLOSED", message });
}

export async function getFrolic(
  ctx: MutationCtx,
  frolicId: Id<"frolics">,
): Promise<Doc<"frolics">> {
  const frolic = await ctx.db.get("frolics", frolicId);
  if (!frolic) throw new ConvexError({ code: "NOT_FOUND", message: "This frolic is gone" });
  return frolic;
}

export async function applyTap(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: TapInput,
): Promise<null> {
  const frolic = await getFrolic(ctx, input.frolicId);
  await requireMember(ctx, frolic.groupId, userId);
  await rateLimiter.limit(ctx, "tap", { key: userId, throws: true });
  const now = Date.now();

  if (frolic.status === "faded" || frolic.status === "done") {
    throw closed("This one is over");
  }
  if (frolic.status === "open" && now >= frolic.deadline) {
    throw closed("This one is over");
  }
  if (frolic.status === "on" && frolic.startsAt !== undefined && now >= frolic.startsAt) {
    throw closed("This one already started");
  }

  const onlyIf: Id<"users">[] = [];
  for (const id of input.onlyIf ?? []) {
    if (id === userId || onlyIf.includes(id)) continue;
    if (!(await findMembership(ctx, frolic.groupId, id))) {
      throw new ConvexError({ code: "BAD_ONLY_IF", message: "Only if must name people in this crew" });
    }
    onlyIf.push(id);
  }
  if (onlyIf.length > 12) {
    throw new ConvexError({ code: "BAD_ONLY_IF", message: "Too many people in only if" });
  }
  if (input.window) {
    const { start, end } = input.window;
    if (!(end > start) || end - start > 24 * 60 * 60 * 1000) {
      throw new ConvexError({ code: "BAD_WINDOW", message: "That window does not work" });
    }
  }

  const existing = await ctx.db
    .query("taps")
    .withIndex("by_frolicId_and_userId", (q) =>
      q.eq("frolicId", frolic._id).eq("userId", userId),
    )
    .unique();
  const fields = {
    kind: input.kind,
    onlyIf: input.kind === "down" ? onlyIf : [],
    window: input.kind === "down" ? input.window : undefined,
    source: input.source,
    updatedAt: existing?.kind === "down" && input.kind === "down" ? existing.updatedAt : now,
  };
  const doc = { frolicId: frolic._id, groupId: frolic.groupId, userId, ...fields };
  let tapId;
  if (existing) {
    await ctx.db.replace("taps", existing._id, doc);
    tapId = existing._id;
  } else {
    tapId = await ctx.db.insert("taps", doc);
  }
  await recordTap(ctx, frolic, { ...doc, _id: tapId, _creationTime: existing?._creationTime ?? now });

  if (frolic.status === "open") {
    await rematch(ctx, frolic, now);
  } else {
    await lateTap(ctx, frolic, userId, fields, now);
  }
  return null;
}

async function rematch(
  ctx: MutationCtx,
  frolic: Doc<"frolics">,
  now: number,
): Promise<void> {
  const taps = await ctx.db
    .query("taps")
    .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
    .take(MAX_TAPS);
  const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
  const downs = taps
    .filter((t) => t.kind === "down")
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .map((t) => ({ userId: t.userId, onlyIf: t.onlyIf, window: t.window ?? null }));
  const match = findMatch({
    taps: downs,
    defaultWindow: frolic.window,
    durationMs: frolic.durationMinutes * 60 * 1000,
    preferredStart: plan?.startsAt ?? null,
    now,
    capacity: frolic.capacity,
  });
  const pending = await pendingReveal(ctx, frolic._id);

  const userIds = match ? (match.userIds as Id<"users">[]) : [];
  if (match && pending) {
    await ctx.db.patch("reveals", pending._id, { userIds, startsAt: match.startsAt });
    return;
  }
  if (pending) {
    await ctx.scheduler.cancel(pending.scheduledId);
    await ctx.db.delete("reveals", pending._id);
  }
  if (now >= frolic.deadline) {
    await fadeFrolic(ctx, frolic._id);
    return;
  }
  if (!match) return;
  const revealAt = now + REVEAL_DELAY_MS;
  const scheduledId = await ctx.scheduler.runAt(
    revealAt,
    internal.reveal.flip,
    { frolicId: frolic._id, revealAt },
  );
  await ctx.db.insert("reveals", {
    frolicId: frolic._id,
    scheduledId,
    userIds,
    revealAt,
    bloomAt: revealAt + BLOOM_LEAD_MS,
    startsAt: match.startsAt,
    matchedAt: now,
  });
}

async function lateTap(
  ctx: MutationCtx,
  frolic: Doc<"frolics">,
  userId: Id<"users">,
  tap: { kind: "down" | "notToday"; onlyIf: Id<"users">[]; window?: TimeWindow },
  now: number,
): Promise<void> {
  const attendee = await findAttendee(ctx, frolic._id, userId);
  if (tap.kind === "notToday") {
    if (attendee?.status === "going") await sitOutAndRefill(ctx, frolic, attendee, now);
    return;
  }
  if (attendee?.status === "going") return;
  const going = await goingAttendees(ctx, frolic._id);
  const goingIds = new Set<string>(going.map((a) => a.userId));
  const startsAt = frolic.startsAt ?? now;
  const w = tap.window ?? frolic.window;
  const fits =
    tap.onlyIf.every((id) => goingIds.has(id)) &&
    w.start <= startsAt &&
    startsAt + frolic.durationMinutes * 60 * 1000 <= w.end;
  const room = frolic.capacity === undefined || going.length < frolic.capacity;
  if (!fits || !room) return;
  await putAttendee(ctx, frolic, userId, "hopIn", now, attendee);
}

export async function findAttendee(
  ctx: QueryCtx,
  frolicId: Id<"frolics">,
  userId: Id<"users">,
): Promise<Doc<"attendees"> | null> {
  return await ctx.db
    .query("attendees")
    .withIndex("by_frolicId_and_userId", (q) =>
      q.eq("frolicId", frolicId).eq("userId", userId),
    )
    .unique();
}

export async function goingAttendees(
  ctx: MutationCtx,
  frolicId: Id<"frolics">,
): Promise<Doc<"attendees">[]> {
  return await ctx.db
    .query("attendees")
    .withIndex("by_frolicId_and_status", (q) => q.eq("frolicId", frolicId).eq("status", "going"))
    .take(MAX_TAPS);
}

export async function putAttendee(
  ctx: MutationCtx,
  frolic: Doc<"frolics">,
  userId: Id<"users">,
  role: "matched" | "hopIn" | "refill",
  now: number,
  existing: Doc<"attendees"> | null,
): Promise<void> {
  const fields = { role, status: "going" as const, revealAt: now, bloomAt: now + BLOOM_LEAD_MS };
  if (existing) {
    await ctx.db.patch("attendees", existing._id, fields);
  } else {
    await ctx.db.insert("attendees", {
      frolicId: frolic._id,
      groupId: frolic.groupId,
      userId,
      ...fields,
    });
  }
  if (frolic.status === "on") {
    await ctx.scheduler.runAfter(0, internal.whop.money.onJoin, { frolicId: frolic._id, userId });
  }
}

export async function sitOutAndRefill(
  ctx: MutationCtx,
  frolic: Doc<"frolics">,
  attendee: Doc<"attendees">,
  now: number,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.whop.money.onBail, { frolicId: frolic._id, userId: attendee.userId });
  await ctx.db.patch("attendees", attendee._id, { status: "sittingOut" });
  const going = await goingAttendees(ctx, frolic._id);
  if (frolic.capacity !== undefined && going.length >= frolic.capacity) return;
  const next = await ctx.db
    .query("hopIns")
    .withIndex("by_frolicId_and_status", (q) =>
      q.eq("frolicId", frolic._id).eq("status", "waiting"),
    )
    .first();
  if (!next) return;
  await ctx.db.patch("hopIns", next._id, { status: "joined" });
  const existing = await findAttendee(ctx, frolic._id, next.userId);
  await putAttendee(ctx, frolic, next.userId, "refill", now, existing);
}

export async function deleteTaps(
  ctx: MutationCtx,
  frolicId: Id<"frolics">,
): Promise<void> {
  const taps = await ctx.db
    .query("taps")
    .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
    .take(MAX_TAPS);
  for (const tap of taps) await ctx.db.delete("taps", tap._id);
}

async function pendingReveal(
  ctx: MutationCtx,
  frolicId: Id<"frolics">,
): Promise<Doc<"reveals"> | null> {
  return await ctx.db
    .query("reveals")
    .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
    .unique();
}

export async function fadeFrolic(
  ctx: MutationCtx,
  frolicId: Id<"frolics">,
): Promise<void> {
  await deleteTaps(ctx, frolicId);
  await ctx.db.patch("frolics", frolicId, { status: "faded" });
  await ctx.scheduler.runAfter(0, internal.keiki.outbound.onFaded, { frolicId });
}

export async function removeTap(
  ctx: MutationCtx,
  userId: Id<"users">,
  frolicId: Id<"frolics">,
  limited = true,
): Promise<null> {
  const frolic = await getFrolic(ctx, frolicId);
  await requireMember(ctx, frolic.groupId, userId);
  if (limited) await rateLimiter.limit(ctx, "tap", { key: userId, throws: true });
  const existing = await ctx.db
    .query("taps")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .unique();
  if (!existing) return null;
  await ctx.db.delete("taps", existing._id);
  if (frolic.status === "open") await rematch(ctx, frolic, Date.now());
  return null;
}

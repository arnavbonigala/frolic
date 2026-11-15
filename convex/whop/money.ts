import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { findAttendee, goingAttendees, sitOutAndRefill } from "../lib/core";
import { policy, whopConfig } from "./config";
import { ACTIVE, nextStatus, splitCost, type ShareStatus, type WhopSignal } from "./split";

export const signalValidator = v.union(
  v.literal("authorized"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled"),
  v.literal("refunded"),
  v.literal("disputed"),
  v.literal("pending"),
);

function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function payUrl(token: string): string {
  return `${whopConfig().siteUrl}/pay/${token}`;
}

export async function shareFor(ctx: QueryCtx, frolicId: Id<"frolics">, userId: Id<"users">): Promise<Doc<"shares"> | null> {
  return await ctx.db
    .query("shares")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .unique();
}

export async function fundBalance(ctx: QueryCtx, groupId: Id<"groups">): Promise<number> {
  const entries = await ctx.db.query("fundLedger").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).take(2000);
  return entries.reduce((sum, e) => sum + e.amountCents, 0);
}

async function perPersonCents(ctx: QueryCtx, frolic: Doc<"frolics">): Promise<number> {
  if (!frolic.planId) return 0;
  const plan = await ctx.db.get("plans", frolic.planId);
  return plan ? Math.max(0, Math.round(plan.cost * 100)) : 0;
}

async function insertShare(
  ctx: MutationCtx,
  frolic: Doc<"frolics">,
  userId: Id<"users">,
  kind: "deposit" | "chipIn",
  amountCents: number,
): Promise<Id<"shares">> {
  const now = Date.now();
  const covered = amountCents === 0;
  const shareId = await ctx.db.insert("shares", {
    frolicId: frolic._id,
    groupId: frolic.groupId,
    userId,
    kind,
    amountCents,
    status: covered ? "waived" : "due",
    token: covered ? undefined : newToken(),
    updatedAt: now,
  });
  if (!covered) {
    await ctx.scheduler.runAt(Math.max(now, frolic.revealAt ?? now) + policy.confirmWindowMs, internal.whop.money.confirmExpired, { shareId });
  }
  return shareId;
}

export async function openMoney(ctx: MutationCtx, frolic: Doc<"frolics">): Promise<void> {
  const existing = await ctx.db.query("shares").withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id)).first();
  if (existing) return;
  const going = await goingAttendees(ctx, frolic._id);
  if (going.length === 0) return;
  const per = await perPersonCents(ctx, frolic);
  if (per > 0) {
    const split = splitCost(per, going.length, await fundBalance(ctx, frolic.groupId), policy.minChargeCents);
    if (split.appliedCents > 0) {
      await ctx.db.insert("fundLedger", {
        groupId: frolic.groupId,
        frolicId: frolic._id,
        entry: "payout",
        amountCents: -split.appliedCents,
        at: Date.now(),
      });
    }
    for (const [i, a] of going.entries()) await insertShare(ctx, frolic, a.userId, "chipIn", split.shares[i]);
  } else {
    for (const a of going) await insertShare(ctx, frolic, a.userId, "deposit", policy.holdCents);
  }
  if (frolic.startsAt !== undefined) {
    await ctx.scheduler.runAt(frolic.startsAt + policy.noShowGraceMs, internal.whop.money.noShowSweep, { frolicId: frolic._id });
  }
}

function revealed(frolic: Doc<"frolics"> | null, now: number): frolic is Doc<"frolics"> {
  return !!frolic && frolic.status === "on" && frolic.revealAt !== undefined && frolic.revealAt <= now;
}

async function joinMoney(ctx: MutationCtx, frolic: Doc<"frolics">, userId: Id<"users">): Promise<void> {
  const any = await ctx.db.query("shares").withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id)).first();
  if (!any) return await openMoney(ctx, frolic);
  const per = await perPersonCents(ctx, frolic);
  const kind = per > 0 ? "chipIn" : "deposit";
  const amountCents = per > 0 ? Math.max(per, policy.minChargeCents) : policy.holdCents;
  const share = await shareFor(ctx, frolic._id, userId);
  if (!share) {
    await insertShare(ctx, frolic, userId, kind, amountCents);
    return;
  }
  const reusable = share.status === "released" || share.status === "failed" || (share.status === "waived" && share.amountCents > 0);
  if (!reusable) return;
  await ctx.db.patch("shares", share._id, { status: "due", token: newToken(), whopPaymentId: undefined, lastError: undefined, updatedAt: Date.now() });
  await ctx.scheduler.runAt(Date.now() + policy.confirmWindowMs, internal.whop.money.confirmExpired, { shareId: share._id });
}

async function setStatus(ctx: MutationCtx, share: Doc<"shares">, status: ShareStatus, extra: Partial<Doc<"shares">> = {}) {
  await ctx.db.patch("shares", share._id, { ...extra, status, updatedAt: Date.now() });
}

async function beginRelease(ctx: MutationCtx, share: Doc<"shares">): Promise<void> {
  await setStatus(ctx, share, "releasing");
  await ctx.scheduler.runAfter(0, internal.whop.actions.release, { shareId: share._id });
}

async function beginRefund(ctx: MutationCtx, share: Doc<"shares">): Promise<void> {
  await setStatus(ctx, share, "refunding");
  await ctx.scheduler.runAfter(0, internal.whop.actions.refund, { shareId: share._id, tries: 0 });
}

async function checkedIn(ctx: QueryCtx, frolicId: Id<"frolics">, userId: Id<"users">): Promise<boolean> {
  const c = await ctx.db
    .query("checkins")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .unique();
  return c !== null;
}

async function ledgerFor(ctx: QueryCtx, share: Doc<"shares">) {
  const rows = await ctx.db.query("fundLedger").withIndex("by_frolicId", (q) => q.eq("frolicId", share.frolicId)).take(500);
  return rows.filter((r) => r.shareId === share._id);
}

async function reverseCredit(ctx: MutationCtx, share: Doc<"shares">): Promise<void> {
  const rows = await ledgerFor(ctx, share);
  const net = rows.reduce((s, r) => s + r.amountCents, 0);
  if (net <= 0) return;
  await ctx.db.insert("fundLedger", {
    groupId: share.groupId,
    frolicId: share.frolicId,
    userId: share.userId,
    shareId: share._id,
    entry: "adjustment",
    amountCents: -net,
    whopPaymentId: share.whopPaymentId,
    at: Date.now(),
  });
}

export async function applySignal(
  ctx: MutationCtx,
  share: Doc<"shares">,
  signal: WhopSignal,
  amountAfterFeesCents?: number,
): Promise<ShareStatus | null> {
  const next = nextStatus(share.kind, share.status, signal);
  if (!next) return null;
  await setStatus(ctx, share, next);
  const fresh = (await ctx.db.get("shares", share._id))!;
  if (next === "held") {
    const attendee = await findAttendee(ctx, share.frolicId, share.userId);
    if ((await checkedIn(ctx, share.frolicId, share.userId)) || attendee?.status !== "going") await beginRelease(ctx, fresh);
  }
  if (next === "forfeited") {
    const rows = await ledgerFor(ctx, share);
    if (!rows.some((r) => r.entry === "forfeit")) {
      await ctx.db.insert("fundLedger", {
        groupId: share.groupId,
        frolicId: share.frolicId,
        userId: share.userId,
        shareId: share._id,
        entry: "forfeit",
        amountCents: Math.min(share.amountCents, amountAfterFeesCents ?? share.amountCents),
        whopPaymentId: share.whopPaymentId,
        at: Date.now(),
      });
    }
    if (await checkedIn(ctx, share.frolicId, share.userId)) await beginRefund(ctx, fresh);
  }
  if (next === "refunded" || next === "needsAttention") await reverseCredit(ctx, fresh);
  return next;
}

export const onReveal = internalMutation({
  args: { frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, { frolicId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    if (frolic?.status === "on" && frolic.revealAt !== undefined && frolic.revealAt > Date.now()) {
      await ctx.scheduler.runAt(frolic.revealAt, internal.whop.money.onReveal, { frolicId });
      return null;
    }
    if (revealed(frolic, Date.now())) await openMoney(ctx, frolic);
    return null;
  },
});

export const onJoin = internalMutation({
  args: { frolicId: v.id("frolics"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { frolicId, userId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    if (!revealed(frolic, Date.now())) return null;
    const attendee = await findAttendee(ctx, frolicId, userId);
    if (attendee?.status !== "going") return null;
    await joinMoney(ctx, frolic, userId);
    return null;
  },
});

export const onBail = internalMutation({
  args: { frolicId: v.id("frolics"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { frolicId, userId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    const share = await shareFor(ctx, frolicId, userId);
    if (!frolic || !share) return null;
    if (share.status === "due" || share.status === "failed") {
      await setStatus(ctx, share, "waived");
      return null;
    }
    const early = frolic.startsAt === undefined || frolic.startsAt - Date.now() >= policy.bailWindowMs;
    if (share.kind === "deposit" && share.status === "held" && early) await beginRelease(ctx, share);
    return null;
  },
});

export const onArrive = internalMutation({
  args: { frolicId: v.id("frolics"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { frolicId, userId }) => {
    const share = await shareFor(ctx, frolicId, userId);
    if (!share || share.kind !== "deposit") return null;
    if (share.status === "held") await beginRelease(ctx, share);
    else if (share.status === "forfeited") await beginRefund(ctx, share);
    else if (share.status === "due" || share.status === "failed") await setStatus(ctx, share, "waived");
    return null;
  },
});

export const onDone = internalMutation({
  args: { frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, { frolicId }) => {
    const shares = await ctx.db.query("shares").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(200);
    for (const s of shares) if (s.status === "due" || s.status === "failed") await setStatus(ctx, s, "waived");
    return null;
  },
});

export const confirmExpired = internalMutation({
  args: { shareId: v.id("shares") },
  returns: v.null(),
  handler: async (ctx, { shareId }) => {
    const share = await ctx.db.get("shares", shareId);
    if (!share || (share.status !== "due" && share.status !== "failed")) return null;
    if (Date.now() - share.updatedAt < policy.confirmWindowMs - 1000 && share.status === "failed") {
      await ctx.scheduler.runAt(share.updatedAt + policy.confirmWindowMs, internal.whop.money.confirmExpired, { shareId });
      return null;
    }
    await setStatus(ctx, share, "waived");
    const frolic = await ctx.db.get("frolics", share.frolicId);
    const attendee = await findAttendee(ctx, share.frolicId, share.userId);
    if (frolic?.status === "on" && attendee?.status === "going") await sitOutAndRefill(ctx, frolic, attendee, Date.now());
    return null;
  },
});

export const noShowSweep = internalMutation({
  args: { frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, { frolicId }) => {
    const shares = await ctx.db.query("shares").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(200);
    for (const s of shares) {
      if (s.kind !== "deposit" || s.status !== "held") continue;
      if (await checkedIn(ctx, frolicId, s.userId)) {
        await beginRelease(ctx, s);
        continue;
      }
      await ctx.scheduler.runAfter(0, internal.whop.actions.capture, { shareId: s._id });
    }
    return null;
  },
});

export const payView = internalQuery({
  args: { token: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), title: v.string(), kind: v.union(v.literal("deposit"), v.literal("chipIn")), amountCents: v.number() }),
    v.object({ ok: v.literal(false), message: v.string() }),
  ),
  handler: async (ctx, { token }) => {
    const share = await ctx.db.query("shares").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (!share) return { ok: false as const, message: "This link has expired." };
    const frolic = await ctx.db.get("frolics", share.frolicId);
    if (!frolic || frolic.status !== "on" || frolic.revealAt === undefined) return { ok: false as const, message: "This one is not happening right now." };
    if (share.status !== "due" && share.status !== "failed") return { ok: false as const, message: "You're already set for this one." };
    const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
    return { ok: true as const, title: plan?.title ?? "Today's frolic", kind: share.kind, amountCents: share.amountCents };
  },
});

export const getShare = internalQuery({
  args: { shareId: v.id("shares") },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      kind: v.union(v.literal("deposit"), v.literal("chipIn")),
      whopPaymentId: v.union(v.string(), v.null()),
      updatedAt: v.number(),
      capturable: v.boolean(),
    }),
  ),
  handler: async (ctx, { shareId }) => {
    const s = await ctx.db.get("shares", shareId);
    if (!s) return null;
    const capturable = s.kind === "deposit" && s.status === "held" && !(await checkedIn(ctx, s.frolicId, s.userId));
    return { status: s.status, kind: s.kind, whopPaymentId: s.whopPaymentId ?? null, updatedAt: s.updatedAt, capturable };
  },
});

export const signal = internalMutation({
  args: { shareId: v.id("shares"), signal: signalValidator, amountAfterFeesCents: v.optional(v.number()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const share = await ctx.db.get("shares", args.shareId);
    if (!share) return null;
    return await applySignal(ctx, share, args.signal, args.amountAfterFeesCents);
  },
});

export const beginCharge = internalMutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      shareId: v.id("shares"),
      frolicId: v.id("frolics"),
      userId: v.id("users"),
      kind: v.union(v.literal("deposit"), v.literal("chipIn")),
      amountCents: v.number(),
      title: v.string(),
    }),
    v.object({ ok: v.literal(false), message: v.string() }),
  ),
  handler: async (ctx, { token }) => {
    const share = await ctx.db.query("shares").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (!share) return { ok: false as const, message: "This link has expired." };
    const frolic = await ctx.db.get("frolics", share.frolicId);
    if (!revealed(frolic, Date.now()) || (frolic.endsAt !== undefined && Date.now() >= frolic.endsAt)) {
      return { ok: false as const, message: "This one is not happening right now." };
    }
    if (share.status !== "due" && share.status !== "failed") return { ok: false as const, message: "You're already set for this one." };
    await setStatus(ctx, share, "pending", { lastError: undefined });
    const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
    return {
      ok: true as const,
      shareId: share._id,
      frolicId: share.frolicId,
      userId: share.userId,
      kind: share.kind,
      amountCents: share.amountCents,
      title: plan?.title ?? "Today's frolic",
    };
  },
});

export const recordCharge = internalMutation({
  args: { shareId: v.id("shares"), whopPaymentId: v.string(), signal: signalValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const share = await ctx.db.get("shares", args.shareId);
    if (!share) return null;
    await ctx.db.patch("shares", share._id, { whopPaymentId: args.whopPaymentId, updatedAt: Date.now() });
    await applySignal(ctx, (await ctx.db.get("shares", share._id))!, args.signal);
    return null;
  },
});

export const chargeFailed = internalMutation({
  args: { shareId: v.id("shares"), message: v.string() },
  returns: v.null(),
  handler: async (ctx, { shareId, message }) => {
    const share = await ctx.db.get("shares", shareId);
    if (!share || share.status !== "pending" || share.whopPaymentId) return null;
    await setStatus(ctx, share, "failed", { lastError: message });
    return null;
  },
});

export const settle = internalMutation({
  args: { shareId: v.id("shares"), status: v.union(v.literal("needsAttention"), v.literal("released")), message: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { shareId, status, message }) => {
    const share = await ctx.db.get("shares", shareId);
    if (!share || !ACTIVE.includes(share.status)) return null;
    await setStatus(ctx, share, status, { lastError: message });
    if (status === "needsAttention") await reverseCredit(ctx, share);
    return null;
  },
});

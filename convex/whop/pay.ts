import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { findMembership, findUserByToken, userFromToken } from "../lib/identity";
import { fundBalance, noHold, shareFor } from "./money";
import { policy } from "./config";
import { linkFor, linkResult } from "./links";

export const link = mutation({
  args: { deviceToken: v.string(), frolicId: v.id("frolics") },
  returns: linkResult,
  handler: async (ctx, { deviceToken, frolicId }) => {
    const user = await userFromToken(ctx, deviceToken);
    return await linkFor(ctx, user._id, frolicId);
  },
});

const moneyState = v.union(
  v.literal("none"),
  v.literal("due"),
  v.literal("paying"),
  v.literal("held"),
  v.literal("returning"),
  v.literal("returned"),
  v.literal("paid"),
  v.literal("kept"),
  v.literal("covered"),
  v.literal("failed"),
  v.literal("sorting"),
);

function view(status: string, kind: "deposit" | "chipIn", amountCents: number) {
  switch (status) {
    case "due":
      return "due" as const;
    case "pending":
      return "paying" as const;
    case "held":
      return "held" as const;
    case "releasing":
    case "refunding":
      return "returning" as const;
    case "released":
    case "refunded":
      return "returned" as const;
    case "paid":
      return "paid" as const;
    case "forfeited":
      return "kept" as const;
    case "failed":
      return "failed" as const;
    case "needsAttention":
      return "sorting" as const;
    case "waived":
      return amountCents === 0 && kind === "chipIn" ? ("covered" as const) : ("none" as const);
  }
  return "none" as const;
}

export const myPayment = query({
  args: { deviceToken: v.string(), frolicId: v.id("frolics") },
  returns: v.object({
    state: moneyState,
    kind: v.union(v.literal("hold"), v.literal("share"), v.literal("none")),
    amountCents: v.number(),
    error: v.union(v.string(), v.null()),
    paidNames: v.array(v.string()),
    noHold: v.boolean(),
  }),
  handler: async (ctx, { deviceToken, frolicId }) => {
    const empty = { state: "none" as const, kind: "none" as const, amountCents: 0, error: null, paidNames: [], noHold: false };
    const user = await findUserByToken(ctx, deviceToken);
    const frolic = await ctx.db.get("frolics", frolicId);
    if (!user || !frolic || frolic.revealAt === undefined || frolic.status === "open") return empty;
    const share = await shareFor(ctx, frolicId, user._id);
    if (!share) return { ...empty, noHold: await noHold(ctx, frolicId) };
    const all = await ctx.db.query("shares").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(200);
    const paidNames: string[] = [];
    for (const s of all) {
      if (s.userId === user._id || !["held", "paid", "releasing", "released"].includes(s.status)) continue;
      const u = await ctx.db.get("users", s.userId);
      if (u) paidNames.push(u.name);
    }
    return {
      state: view(share.status, share.kind, share.amountCents),
      kind: share.kind === "deposit" ? ("hold" as const) : ("share" as const),
      amountCents: share.amountCents,
      error: share.status === "failed" ? "That didn't go through. Try again." : null,
      paidNames,
      noHold: false,
    };
  },
});

async function recentEntries(ctx: QueryCtx, groupId: Id<"groups">) {
  return await ctx.db.query("fundLedger").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).order("desc").take(20);
}

export const fund = query({
  args: { deviceToken: v.string(), groupId: v.id("groups") },
  returns: v.object({
    balanceCents: v.number(),
    holdLine: v.union(v.string(), v.null()),
    entries: v.array(v.object({ amountCents: v.number(), line: v.string(), at: v.number(), frolicId: v.union(v.id("frolics"), v.null()) })),
  }),
  handler: async (ctx, { deviceToken, groupId }) => {
    const user = await findUserByToken(ctx, deviceToken);
    if (!user || !(await findMembership(ctx, groupId, user._id))) return { balanceCents: 0, holdLine: null, entries: [] };
    const group = await ctx.db.get("groups", groupId);
    const hold = `$${(policy.holdCents / 100).toFixed(policy.holdCents % 100 === 0 ? 0 : 2)}`;
    const holdLine = group?.holdEnabled === true ? `${group.name} plays for ${hold}. Show up, it's released.` : null;
    const balanceCents = await fundBalance(ctx, groupId);
    const entries = [];
    for (const e of await recentEntries(ctx, groupId)) {
      if (e.amountCents === 0) continue;
      const dollars = `$${(Math.abs(e.amountCents) / 100).toFixed(e.amountCents % 100 === 0 ? 0 : 2)}`;
      const line =
        e.entry === "forfeit"
          ? `A no-show added ${dollars}.`
          : e.entry === "payout"
            ? `The Frolic Fund covered ${dollars}.`
            : `${dollars} went back.`;
      entries.push({ amountCents: e.amountCents, line, at: e.at, frolicId: e.frolicId ?? null });
    }
    return { balanceCents, holdLine, entries };
  },
});

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { findAttendee } from "../lib/core";
import { openMoney, payUrl, shareFor } from "./money";

export const linkResult = v.union(
  v.object({
    kind: v.union(v.literal("hold"), v.literal("share")),
    url: v.string(),
    amountCents: v.number(),
    expiresAt: v.number(),
  }),
  v.object({
    kind: v.literal("none"),
    reason: v.union(
      v.literal("not_revealed"),
      v.literal("not_member"),
      v.literal("already_paid"),
      v.literal("covered"),
      v.literal("closed"),
    ),
  }),
);

type LinkResult =
  | { kind: "hold" | "share"; url: string; amountCents: number; expiresAt: number }
  | { kind: "none"; reason: "not_revealed" | "not_member" | "already_paid" | "covered" | "closed" };

export async function linkFor(ctx: MutationCtx, userId: Id<"users">, frolicId: Id<"frolics">): Promise<LinkResult> {
  const now = Date.now();
  const frolic: Doc<"frolics"> | null = await ctx.db.get("frolics", frolicId);
  if (!frolic || frolic.status === "open" || frolic.revealAt === undefined || frolic.revealAt > now) {
    return { kind: "none", reason: "not_revealed" };
  }
  if (frolic.status !== "on" || (frolic.endsAt !== undefined && now >= frolic.endsAt)) return { kind: "none", reason: "closed" };
  const attendee = await findAttendee(ctx, frolicId, userId);
  if (attendee?.status !== "going") return { kind: "none", reason: "not_member" };
  let share = await shareFor(ctx, frolicId, userId);
  if (!share) {
    await openMoney(ctx, frolic);
    share = await shareFor(ctx, frolicId, userId);
  }
  if (!share) return { kind: "none", reason: "closed" };
  if (share.status === "waived" && share.amountCents === 0) return { kind: "none", reason: "covered" };
  if (share.status !== "due" && share.status !== "failed") return { kind: "none", reason: "already_paid" };
  if (!share.token) return { kind: "none", reason: "closed" };
  return {
    kind: share.kind === "deposit" ? "hold" : "share",
    url: payUrl(share.token),
    amountCents: share.amountCents,
    expiresAt: frolic.startsAt ?? frolic.endsAt ?? now,
  };
}

export const checkoutLink = internalMutation({
  args: { userId: v.id("users"), frolicId: v.id("frolics") },
  returns: linkResult,
  handler: async (ctx, { userId, frolicId }) => await linkFor(ctx, userId, frolicId),
});

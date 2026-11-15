import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { moneyToCents, type WhopMoney } from "./client";
import { applySignal } from "./money";
import { signalFrom } from "./split";

type PaymentData = {
  id?: string;
  status?: string;
  substatus?: string;
  payment_id?: string;
  metadata?: Record<string, unknown> | null;
  amount_after_fees?: WhopMoney;
  payment?: { id?: string };
};

const REFUND_DONE = new Set(["succeeded", "paid", "completed"]);

export const ingest = internalMutation({
  args: { eventId: v.string(), type: v.string(), payload: v.string() },
  returns: v.union(v.literal("duplicate"), v.literal("applied"), v.literal("ignored")),
  handler: async (ctx, { eventId, type, payload }) => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_and_eventId", (q) => q.eq("provider", "whop").eq("eventId", eventId))
      .unique();
    if (seen) return "duplicate" as const;
    const now = Date.now();
    const rowId = await ctx.db.insert("webhookEvents", { provider: "whop", eventId, type, payload: payload.slice(0, 20000), receivedAt: now });
    let data: PaymentData = {};
    try {
      data = ((JSON.parse(payload) as { data?: PaymentData }).data ?? {}) as PaymentData;
    } catch {
      await ctx.db.patch("webhookEvents", rowId, { processedAt: now, error: "bad json" });
      return "ignored" as const;
    }
    const isRefund = type.startsWith("refund.");
    const isDispute = type.startsWith("dispute.");
    const paymentId = isRefund || isDispute ? (data.payment?.id ?? data.payment_id) : data.id;
    const metaShare = typeof data.metadata?.shareId === "string" ? (data.metadata.shareId as string) : undefined;
    let share = paymentId
      ? await ctx.db.query("shares").withIndex("by_whopPaymentId", (q) => q.eq("whopPaymentId", paymentId)).unique()
      : null;
    if (!share && metaShare) {
      const id = ctx.db.normalizeId("shares", metaShare);
      share = id ? await ctx.db.get("shares", id as Id<"shares">) : null;
    }
    if (!share) {
      await ctx.db.patch("webhookEvents", rowId, { processedAt: now, error: "no share" });
      return "ignored" as const;
    }
    const s = signalFrom(data.status, data.substatus);
    const live = type === "payment.authorized" || type === "payment.succeeded" || s === "authorized" || s === "succeeded";
    const reopen = share.status === "pending" || share.status === "failed" || share.status === "due";
    const stray = share.whopPaymentId ? share.whopPaymentId !== paymentId : !reopen;
    if (paymentId && stray && !isRefund && !isDispute) {
      if (live) await ctx.scheduler.runAfter(0, internal.whop.actions.voidOrphan, { shareId: share._id, paymentId });
      await ctx.db.patch("webhookEvents", rowId, { processedAt: now, error: "orphan payment" });
      return "ignored" as const;
    }
    if (!share.whopPaymentId && paymentId && !isRefund && !isDispute) {
      await ctx.db.patch("shares", share._id, { whopPaymentId: paymentId, ...(live ? { status: "pending" as const, lastError: undefined } : {}) });
      share = (await ctx.db.get("shares", share._id))!;
    }
    let signal = signalFrom(data.status, data.substatus);
    if (type === "payment.authorized") signal = "authorized";
    if (type === "payment.succeeded") signal = "succeeded";
    if (type === "payment.failed") signal = "failed";
    if (type === "payment.canceled") signal = "canceled";
    if (isRefund) signal = REFUND_DONE.has(data.status ?? "") ? "refunded" : "pending";
    if (isDispute) signal = "disputed";
    const next = await applySignal(ctx, share, signal, moneyToCents(data.amount_after_fees));
    await ctx.db.patch("webhookEvents", rowId, { processedAt: now });
    await ctx.scheduler.runAfter(0, internal.whop.actions.reconcile, { shareId: share._id });
    return next ? ("applied" as const) : ("ignored" as const);
  },
});

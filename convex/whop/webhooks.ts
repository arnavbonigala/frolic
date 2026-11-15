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

type Kept = {
  paymentId?: string;
  status?: string;
  substatus?: string;
  shareId?: string;
  amountAfterFeesCents?: number;
};

const REFUND_DONE = new Set(["succeeded", "paid", "completed"]);
const BATCH = 100;

function keptFrom(data: PaymentData, linked: boolean): Kept {
  const paymentId = linked ? (data.payment?.id ?? data.payment_id) : data.id;
  return {
    paymentId,
    status: data.status,
    substatus: data.substatus,
    shareId: typeof data.metadata?.shareId === "string" ? data.metadata.shareId : undefined,
    amountAfterFeesCents: moneyToCents(data.amount_after_fees),
  };
}

function narrower(type: string, stored: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return "{}";
  }
  const event = parsed as { data?: PaymentData } | null;
  if (typeof event !== "object" || event === null || typeof event.data !== "object" || event.data === null) return stored;
  return JSON.stringify(keptFrom(event.data, type.startsWith("refund.") || type.startsWith("dispute.")));
}

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
    const isRefund = type.startsWith("refund.");
    const isDispute = type.startsWith("dispute.");
    let data: PaymentData | null = null;
    try {
      data = ((JSON.parse(payload) as { data?: PaymentData }).data ?? {}) as PaymentData;
    } catch {
      data = null;
    }
    const kept = data ? keptFrom(data, isRefund || isDispute) : {};
    const rowId = await ctx.db.insert("webhookEvents", {
      provider: "whop",
      eventId,
      type,
      payload: JSON.stringify(kept),
      receivedAt: now,
    });
    if (!data) {
      await ctx.db.patch("webhookEvents", rowId, { processedAt: now, error: "bad json" });
      return "ignored" as const;
    }
    const { paymentId, status, substatus, shareId: metaShare, amountAfterFeesCents } = kept;
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
    const s = signalFrom(status, substatus);
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
    let signal = signalFrom(status, substatus);
    if (type === "payment.authorized") signal = "authorized";
    if (type === "payment.succeeded") signal = "succeeded";
    if (type === "payment.failed") signal = "failed";
    if (type === "payment.canceled") signal = "canceled";
    if (isRefund) signal = REFUND_DONE.has(status ?? "") ? "refunded" : "pending";
    if (isDispute) signal = "disputed";
    const next = await applySignal(ctx, share, signal, amountAfterFeesCents);
    await ctx.db.patch("webhookEvents", rowId, { processedAt: now });
    await ctx.scheduler.runAfter(0, internal.whop.actions.reconcile, { shareId: share._id });
    return next ? ("applied" as const) : ("ignored" as const);
  },
});

export const redactStored = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.union(
    v.object({ done: v.literal(true), rows: v.number() }),
    v.object({ done: v.literal(false), cursor: v.string(), rows: v.number() }),
  ),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("webhookEvents").paginate({ numItems: BATCH, cursor });
    let rows = 0;
    for (const row of page.page) {
      if (row.provider !== "whop") continue;
      const payload = narrower(row.type, row.payload);
      if (payload === row.payload) continue;
      await ctx.db.patch("webhookEvents", row._id, { payload });
      rows += 1;
    }
    if (page.isDone) return { done: true as const, rows };
    await ctx.scheduler.runAfter(0, internal.whop.webhooks.redactStored, { cursor: page.continueCursor });
    return { done: false as const, cursor: page.continueCursor, rows };
  },
});

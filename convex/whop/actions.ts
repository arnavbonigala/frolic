import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { moneyToCents, whop, WhopError, type WhopPayment } from "./client";
import { policy, whopConfig } from "./config";
import { payUrl } from "./money";
import { signalFrom } from "./split";

type ChargeResult = { ok: true; status: string; clientSecret: string | null } | { ok: false; message: string };
type BeginResult =
  | { ok: true; shareId: Id<"shares">; frolicId: Id<"frolics">; userId: Id<"users">; kind: "deposit" | "chipIn"; amountCents: number; title: string }
  | { ok: false; message: string };
type ShareView = { status: string; kind: "deposit" | "chipIn"; whopPaymentId: string | null; updatedAt: number; capturable: boolean } | null;

function errorText(e: unknown): string {
  if (e instanceof WhopError) return e.status ? `Whop ${e.status}` : e.message;
  return e instanceof Error ? e.message : "Unknown error";
}

async function readSignal(p: WhopPayment) {
  return { signal: signalFrom(p.status, p.substatus), amountAfterFeesCents: moneyToCents(p.amount_after_fees) };
}

export const charge = internalAction({
  args: { token: v.string(), confirmationToken: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), status: v.string(), clientSecret: v.union(v.string(), v.null()) }),
    v.object({ ok: v.literal(false), message: v.string() }),
  ),
  handler: async (ctx, { token, confirmationToken }): Promise<ChargeResult> => {
    const begun: BeginResult = await ctx.runMutation(internal.whop.money.beginCharge, { token });
    if (!begun.ok) return begun;
    const cfg = whopConfig();
    const isHold = begun.kind === "deposit";
    try {
      const payment = await whop.createPayment(
        {
          account_id: cfg.accountId,
          confirmation_token: confirmationToken,
          capture: !isHold,
          return_url: payUrl(token),
          metadata: { shareId: begun.shareId, frolicId: begun.frolicId, userId: begun.userId, kind: begun.kind },
          variant: {
            currency: "usd",
            initial_price: begun.amountCents / 100,
            billing_type: "one_time",
            visibility: "hidden",
            product_id: isHold ? cfg.holdProductId : cfg.plansProductId,
            title: isHold ? "Frolic hold" : `${begun.title}, your share`,
          },
        },
        `${begun.shareId}:charge:${confirmationToken}`,
      );
      const { signal } = await readSignal(payment);
      await ctx.runMutation(internal.whop.money.recordCharge, { shareId: begun.shareId, whopPaymentId: payment.id, signal });
      await ctx.scheduler.runAfter(policy.reconcileMs, internal.whop.actions.reconcile, { shareId: begun.shareId });
      return { ok: true as const, status: payment.substatus ?? payment.status ?? "pending", clientSecret: payment.client_secret ?? null };
    } catch (e) {
      await ctx.runMutation(internal.whop.money.chargeFailed, { shareId: begun.shareId, message: errorText(e) });
      return { ok: false as const, message: "That didn't go through. Try again." };
    }
  },
});

export const reconcile = internalAction({
  args: { shareId: v.id("shares") },
  returns: v.null(),
  handler: async (ctx, { shareId }): Promise<null> => {
    const share: ShareView = await ctx.runQuery(internal.whop.money.getShare, { shareId });
    if (!share || !["pending", "held", "releasing", "refunding"].includes(share.status)) return null;
    if (!share.whopPaymentId) {
      if (share.status === "pending" && Date.now() - share.updatedAt > policy.stuckPendingMs) {
        await ctx.runMutation(internal.whop.money.chargeFailed, { shareId, message: "Abandoned" });
        return null;
      }
      await ctx.scheduler.runAfter(policy.reconcileMs, internal.whop.actions.reconcile, { shareId });
      return null;
    }
    try {
      const payment = await whop.getPayment(share.whopPaymentId);
      const { signal, amountAfterFeesCents } = await readSignal(payment);
      const expired = payment.capture_expires_at ? Date.parse(payment.capture_expires_at) < Date.now() : false;
      await ctx.runMutation(internal.whop.money.signal, { shareId, signal: expired && signal === "authorized" ? "canceled" : signal, amountAfterFeesCents });
    } catch {
      await ctx.scheduler.runAfter(policy.reconcileMs, internal.whop.actions.reconcile, { shareId });
      return null;
    }
    const after: ShareView = await ctx.runQuery(internal.whop.money.getShare, { shareId });
    if (after && ["pending", "held", "releasing", "refunding"].includes(after.status)) {
      await ctx.scheduler.runAfter(policy.reconcileMs, internal.whop.actions.reconcile, { shareId });
    }
    return null;
  },
});

export const release = internalAction({
  args: { shareId: v.id("shares") },
  returns: v.null(),
  handler: async (ctx, { shareId }): Promise<null> => {
    const share: ShareView = await ctx.runQuery(internal.whop.money.getShare, { shareId });
    if (!share || share.status !== "releasing" || !share.whopPaymentId) return null;
    try {
      const payment = await whop.voidPayment(share.whopPaymentId, `${shareId}:void`);
      const { signal } = await readSignal(payment);
      if (signal === "canceled") await ctx.runMutation(internal.whop.money.signal, { shareId, signal });
    } catch {
      try {
        const payment = await whop.refundPayment(share.whopPaymentId, `${shareId}:refund:fallback`);
        const read = await readSignal(payment);
        if (read.signal === "refunded" || read.signal === "canceled") await ctx.runMutation(internal.whop.money.signal, { shareId, signal: read.signal });
      } catch (e) {
        await ctx.runMutation(internal.whop.money.settle, { shareId, status: "needsAttention", message: errorText(e) });
        return null;
      }
    }
    await ctx.scheduler.runAfter(policy.reconcileMs, internal.whop.actions.reconcile, { shareId });
    return null;
  },
});

export const capture = internalAction({
  args: { shareId: v.id("shares") },
  returns: v.null(),
  handler: async (ctx, { shareId }): Promise<null> => {
    const share: ShareView = await ctx.runQuery(internal.whop.money.getShare, { shareId });
    if (!share || !share.capturable || !share.whopPaymentId) return null;
    try {
      const current = await whop.getPayment(share.whopPaymentId);
      if (signalFrom(current.status, current.substatus) !== "authorized") {
        const read = await readSignal(current);
        await ctx.runMutation(internal.whop.money.signal, { shareId, ...read });
        return null;
      }
      const payment = await whop.capturePayment(share.whopPaymentId, `${shareId}:capture`);
      const read = await readSignal(payment);
      if (read.signal === "succeeded") await ctx.runMutation(internal.whop.money.signal, { shareId, ...read });
    } catch {
      await ctx.scheduler.runAfter(0, internal.whop.actions.reconcile, { shareId });
      return null;
    }
    await ctx.scheduler.runAfter(policy.reconcileMs, internal.whop.actions.reconcile, { shareId });
    return null;
  },
});

export const refund = internalAction({
  args: { shareId: v.id("shares"), tries: v.number() },
  returns: v.null(),
  handler: async (ctx, { shareId, tries }): Promise<null> => {
    const share: ShareView = await ctx.runQuery(internal.whop.money.getShare, { shareId });
    if (!share || share.status !== "refunding" || !share.whopPaymentId) return null;
    try {
      const payment = await whop.refundPayment(share.whopPaymentId, `${shareId}:refund`);
      const read = await readSignal(payment);
      if (read.signal === "refunded") await ctx.runMutation(internal.whop.money.signal, { shareId, signal: "refunded" });
      else await ctx.scheduler.runAfter(policy.reconcileMs, internal.whop.actions.reconcile, { shareId });
    } catch (e) {
      if (tries + 1 >= policy.maxRefundTries) {
        await ctx.runMutation(internal.whop.money.settle, { shareId, status: "needsAttention", message: errorText(e) });
        return null;
      }
      await ctx.scheduler.runAfter(policy.reconcileMs, internal.whop.actions.refund, { shareId, tries: tries + 1 });
    }
    return null;
  },
});

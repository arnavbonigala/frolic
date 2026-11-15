import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  NOON,
  WEBHOOK_SECRET,
  charge,
  crew,
  deliver,
  drain,
  fundBalance,
  installWhop,
  ledger,
  newWorld,
  paymentEvent,
  rawWebhook,
  revealed,
  setEnv,
  shareOf,
  shares,
  type WhopWorld,
} from "./harness";
import { signWebhook } from "../../../convex/whop/signature";
import { internal } from "../../../convex/_generated/api";
import { makeT } from "./harness";

let world: WhopWorld;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  setEnv();
  world = newWorld();
  installWhop(world);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("a correctly signed delivery is accepted once", async () => {
  const t = makeT();
  const c = await crew(t, ["Maya", "Dev"]);
  await revealed(t, c, ["Maya", "Dev"]);
  const share = (await shares(t, c.frolicId))[0];
  const paymentId = await charge(t, share._id, world);
  const res = await deliver(t, {
    id: "evt_ok_1",
    type: "payment.authorized",
    data: paymentEvent(share._id, paymentId, "authorized", "requires_capture"),
  });
  expect(res.status).toBe(200);
  await drain(t);
  const after = await shareOf(t, c.frolicId, share.userId);
  expect(after.status).toBe("held");
});

describe("signatures", () => {
  test("a wrong secret is refused with 401 and writes nothing", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    const before = await t.run(async (ctx: any) => await ctx.db.query("webhookEvents").collect());
    const res = await deliver(t, {
      id: "evt_bad",
      type: "payment.canceled",
      secret: "ws_wrong_secret",
      data: paymentEvent(share._id, paymentId, "void", "canceled"),
    });
    expect(res.status, "a delivery signed with the wrong key is refused").toBe(401);
    const after = await t.run(async (ctx: any) => await ctx.db.query("webhookEvents").collect());
    expect(after.length, "a refused delivery must not be recorded").toBe(before.length);
    const state = await shareOf(t, c.frolicId, share.userId);
    expect(state.status, "a refused delivery must not move money").toBe("held");
  });

  test("a tampered body is refused", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    const body = JSON.stringify({
      type: "payment.canceled",
      data: paymentEvent(share._id, paymentId, "void", "canceled"),
    });
    const timestamp = String(Math.floor(NOON / 1000));
    const signature = await signWebhook(WEBHOOK_SECRET, "evt_tamper", timestamp, body);
    const res = await rawWebhook(t, {
      id: "evt_tamper",
      timestamp,
      signature,
      body: body.replace("canceled", "authorized"),
    });
    expect(res.status).toBe(401);
    expect((await shareOf(t, c.frolicId, share.userId)).status).toBe("held");
  });

  test("a stale timestamp is refused even with a valid signature", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    const body = JSON.stringify({
      type: "payment.canceled",
      data: paymentEvent(share._id, paymentId, "void", "canceled"),
    });
    const stale = String(Math.floor((NOON - 10 * 60_000) / 1000));
    const signature = await signWebhook(WEBHOOK_SECRET, "evt_stale", stale, body);
    const res = await rawWebhook(t, { id: "evt_stale", timestamp: stale, signature, body });
    expect(res.status, "a delivery older than the tolerance window is refused").toBe(401);
    expect((await shareOf(t, c.frolicId, share.userId)).status).toBe("held");
  });

  test("a delivery with no signature header is refused", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const res = await t.fetch("/whop/webhook", {
      method: "POST",
      headers: { "webhook-id": "evt_none", "webhook-timestamp": String(Math.floor(NOON / 1000)) },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });
});

describe("duplicates and replays", () => {
  test("the same webhook id delivered twice moves money once", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    const data = paymentEvent(share._id, paymentId, "paid", "succeeded");
    const first = await deliver(t, { id: "evt_dup", type: "payment.succeeded", data });
    const second = await deliver(t, { id: "evt_dup", type: "payment.succeeded", data });
    expect(first.status).toBe(200);
    expect(second.status, "a duplicate delivery is accepted so Whop stops retrying").toBe(200);
    await drain(t);
    const events = await t.run(async (ctx: any) => await ctx.db.query("webhookEvents").collect());
    expect(events, "one event row per webhook id").toHaveLength(1);
    const rows = await ledger(t, c.groupId);
    expect(rows.filter((r: any) => r.entry === "forfeit"), "the fund is credited once").toHaveLength(1);
    expect(await fundBalance(t, c.groupId)).toBeLessThanOrEqual(300);
  });

  test("the same event redelivered under a new id still credits the fund once", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    const data = paymentEvent(share._id, paymentId, "paid", "succeeded");
    await deliver(t, { id: "evt_a", type: "payment.succeeded", data });
    await deliver(t, { id: "evt_b", type: "payment.succeeded", data });
    await drain(t);
    const rows = await ledger(t, c.groupId);
    expect(
      rows.filter((r: any) => r.entry === "forfeit"),
      "a second delivery under a new id must not credit the fund twice",
    ).toHaveLength(1);
  });

  test("authorized arriving after canceled does not resurrect the hold", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    await deliver(t, {
      id: "evt_cancel",
      type: "payment.canceled",
      data: paymentEvent(share._id, paymentId, "void", "canceled"),
    });
    await drain(t);
    const released = await shareOf(t, c.frolicId, share.userId);
    expect(released.status).toBe("released");
    await deliver(t, {
      id: "evt_late_authorized",
      type: "payment.authorized",
      data: paymentEvent(share._id, paymentId, "authorized", "requires_capture"),
    });
    await drain(t);
    const after = await shareOf(t, c.frolicId, share.userId);
    expect(after.status, "a late authorized event must not un-release a hold").toBe("released");
  });

  test("a capture report after a void does not credit the fund", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    await deliver(t, {
      id: "evt_void",
      type: "payment.canceled",
      data: paymentEvent(share._id, paymentId, "void", "canceled"),
    });
    await drain(t);
    await deliver(t, {
      id: "evt_late_capture",
      type: "payment.succeeded",
      data: paymentEvent(share._id, paymentId, "paid", "succeeded"),
    });
    await drain(t);
    const rows = await ledger(t, c.groupId);
    expect(
      rows.filter((r: any) => r.entry === "forfeit"),
      "a voided hold that reports success must not fund the crew",
    ).toHaveLength(0);
    expect(await fundBalance(t, c.groupId)).toBe(0);
  });

  test("an out of order refund leaves the crew with no money and cannot be re-held", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    await deliver(t, {
      id: "evt_early_refund",
      type: "refund.created",
      data: { payment: { id: paymentId }, status: "succeeded" },
    });
    await drain(t);
    const after = await shareOf(t, c.frolicId, share.userId);
    expect(after.status, "Whop is the source of truth, so a refund wins").toBe("refunded");
    expect(await fundBalance(t, c.groupId), "a refunded payment funds nothing").toBe(0);
    await deliver(t, {
      id: "evt_authorized_after_refund",
      type: "payment.authorized",
      data: paymentEvent(share._id, paymentId, "authorized", "requires_capture"),
    });
    await drain(t);
    expect(
      (await shareOf(t, c.frolicId, share.userId)).status,
      "a late authorized event cannot re-hold a refunded payment",
    ).toBe("refunded");
    expect(await fundBalance(t, c.groupId)).toBe(0);
  });

  test("an event for a payment we never created is acknowledged and ignored", async () => {
    const t = makeT();
    await crew(t, ["Maya", "Dev"]);
    const res = await deliver(t, {
      id: "evt_unknown",
      type: "payment.succeeded",
      data: { id: "pay_does_not_exist", status: "paid", substatus: "succeeded" },
    });
    expect(res.status, "an unknown payment is acknowledged so Whop stops retrying").toBe(200);
  });

  test("a successful charge reported with an unusual substatus does not get counted twice", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    await deliver(t, {
      id: "evt_s1",
      type: "payment.succeeded",
      data: paymentEvent(share._id, paymentId, "paid", "succeeded"),
    });
    await deliver(t, {
      id: "evt_s2",
      type: "payment.succeeded",
      data: paymentEvent(share._id, paymentId, "paid", "auto_refunded"),
    });
    await drain(t);
    expect(await fundBalance(t, c.groupId), "the fund is never credited above the hold").toBeLessThanOrEqual(
      300,
    );
  });
});

describe("payer data at rest", () => {
  const payer = {
    card_holder_name: "Ada Lovelace",
    email: "ada.lovelace@example.com",
    phone: "+15105550142",
    billing_address: { line1: "12 Analytical Way", city: "Oakland", postal_code: "94612", country: "US" },
    client_secret: "cs_9f8e7d6c5b4a3f2e1d0c",
  };
  const secrets = [
    "Ada Lovelace",
    "ada.lovelace@example.com",
    "+15105550142",
    "Analytical Way",
    "94612",
    "cs_9f8e7d6c5b4a3f2e1d0c",
    "card_holder_name",
    "billing_address",
    "client_secret",
    "email",
  ];

  test("a delivery with payer details keeps only what the decision reads", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    const data = { ...paymentEvent(share._id, paymentId, "paid", "succeeded"), ...payer, customer: payer };
    const res = await deliver(t, { id: "evt_payer", type: "payment.succeeded", data });
    expect(res.status).toBe(200);
    await drain(t);
    const events = await t.run(async (ctx: any) => await ctx.db.query("webhookEvents").collect());
    expect(events, "one row per delivery").toHaveLength(1);
    const stored = JSON.stringify(events[0]);
    for (const secret of secrets) {
      expect(stored, `the stored event must not carry ${secret}`).not.toContain(secret);
    }
    expect(events[0].payload, "the payment id survives").toContain(paymentId);
    expect(events[0].payload, "the status survives").toContain("succeeded");
    expect(events[0].payload, "the share id survives").toContain(share._id);
    const rows = await ledger(t, c.groupId);
    expect(rows.filter((r: any) => r.entry === "forfeit"), "a shrinking payload still moves money").toHaveLength(1);
  });

  test("a repeated delivery of the same id keeps one row and credits the fund once", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    const data = { ...paymentEvent(share._id, paymentId, "paid", "succeeded"), ...payer };
    const first = await deliver(t, { id: "evt_payer_dup", type: "payment.succeeded", data });
    const second = await deliver(t, { id: "evt_payer_dup", type: "payment.succeeded", data });
    expect(first.status).toBe(200);
    expect(second.status, "a duplicate is acknowledged so Whop stops retrying").toBe(200);
    await drain(t);
    const events = await t.run(async (ctx: any) => await ctx.db.query("webhookEvents").collect());
    expect(events, "one row per webhook id after the payload shrank").toHaveLength(1);
    expect(events[0].payload).toContain(paymentId);
    const rows = await ledger(t, c.groupId);
    expect(rows.filter((r: any) => r.entry === "forfeit"), "the fund is credited once").toHaveLength(1);
    expect(await fundBalance(t, c.groupId)).toBeLessThanOrEqual(300);
  });

  test("an event stored before the shrink loses its payer details", async () => {
    const t = makeT();
    const raw = JSON.stringify({
      type: "payment.succeeded",
      data: { id: "pay_old", status: "paid", substatus: "succeeded", ...payer, customer: payer },
    });
    await t.run(async (ctx: any) => {
      await ctx.db.insert("webhookEvents", {
        provider: "whop",
        eventId: "evt_old",
        type: "payment.succeeded",
        payload: raw,
        receivedAt: NOON,
      });
    });
    const out = await t.mutation(internal.whop.webhooks.redactStored, { cursor: null });
    expect(out.done).toBe(true);
    const events = await t.run(async (ctx: any) => await ctx.db.query("webhookEvents").collect());
    const stored = JSON.stringify(events[0]);
    for (const secret of secrets) {
      expect(stored, `a stored event must not keep ${secret}`).not.toContain(secret);
    }
    expect(events[0].payload).toContain("pay_old");
    expect(events[0].payload).toContain("succeeded");
    const again = await t.mutation(internal.whop.webhooks.redactStored, { cursor: null });
    expect(again.rows, "a second pass finds nothing left to redact").toBe(0);
  });
});

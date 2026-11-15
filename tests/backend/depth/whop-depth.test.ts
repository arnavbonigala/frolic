import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { HOUR, NOON, flipDue, makeT, setupCrew as baseCrew, tap, token, type Crew, type T } from "../setup.helpers";

async function setupCrew(t: T, names: string[], opts: Parameters<typeof baseCrew>[2] = {}): Promise<Crew> {
  const crew = await baseCrew(t, names, opts);
  await t.run(async (ctx) => await ctx.db.patch("groups", crew.groupId, { holdEnabled: true }));
  return crew;
}

declare const process: { env: Record<string, string | undefined> };

const BASE = "https://sandbox-api.whop.com/api/v1";
const MINUTE = 60 * 1000;

type PaymentState = { status: string; substatus: string };
let payments: Map<string, PaymentState>;
let paymentCalls: string[];
let created: PaymentState;
let failNext: string | null = null;
let seq = 0;

const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

async function fakeFetch(input: string, init?: { method?: string; body?: string }): Promise<Response> {
  const path = input.slice(BASE.length);
  const method = (init?.method ?? "GET").toUpperCase();
  if (failNext && path.includes(failNext)) {
    failNext = null;
    return reply({ error: "boom" }, 500);
  }
  if (method === "POST" && path === "/payments") {
    const id = `pay_${++seq}`;
    payments.set(id, { ...created });
    return reply({ id, status: created.status, substatus: created.substatus, client_secret: "cs", amount_after_fees: { amount: "2.62" } });
  }
  const match = /^\/payments\/([^/]+)(?:\/(void|capture|refund))?$/.exec(path);
  if (!match) return reply({ error: "unknown" }, 404);
  const [, id, action] = match;
  paymentCalls.push(`${action ?? "get"} ${id}`);
  const state: PaymentState =
    action === undefined
      ? (payments.get(id) ?? { status: "authorized", substatus: "requires_capture" })
      : action === "void"
        ? { status: "void", substatus: "canceled" }
        : action === "capture"
          ? { status: "paid", substatus: "succeeded" }
          : { status: "refunded", substatus: "refunded" };
  if (action !== undefined) payments.set(id, state);
  return reply({ id, status: state.status, substatus: state.substatus, amount_after_fees: { amount: "2.62" } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  process.env.WHOP_SANDBOX_API_KEY = "test";
  process.env.WHOP_API_BASE = BASE;
  payments = new Map();
  paymentCalls = [];
  created = { status: "authorized", substatus: "requires_capture" };
  failNext = null;
  seq = 0;
  vi.stubGlobal("fetch", fakeFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.WHOP_SANDBOX_API_KEY;
  delete process.env.WHOP_API_BASE;
});

type Live = { frolicId: Id<"frolics">; ids: Record<string, Id<"users">>; groupId: Id<"groups"> };

async function live(t: T, names: string[] = ["Maya", "Dev", "Jordan"]): Promise<Live> {
  const crew = await setupCrew(t, names);
  for (const name of names.slice(0, 2)) await tap(t, crew, name);
  await flipDue(t);
  return { frolicId: crew.frolicId, ids: crew.ids, groupId: crew.groupId };
}

async function goneShare(t: T, state: Live): Promise<Id<"shares">> {
  const shareId = await share(t, state, state.ids.Jordan, { status: "due" });
  await t.run(async (ctx) => await ctx.db.delete("shares", shareId));
  return shareId;
}

async function share(
  t: T,
  live: Live,
  userId: Id<"users">,
  overrides: Partial<{ kind: "deposit" | "chipIn"; status: Doc<"shares">["status"]; amountCents: number; updatedAt: number; whopPaymentId: string; token: string }> = {},
): Promise<Id<"shares">> {
  return await t.run(async (ctx) =>
    await ctx.db.insert("shares", {
      frolicId: live.frolicId,
      groupId: live.groupId,
      userId,
      kind: overrides.kind ?? "deposit",
      amountCents: overrides.amountCents ?? 300,
      status: overrides.status ?? "due",
      token: overrides.token ?? `tok-${userId.slice(-6)}`,
      whopPaymentId: overrides.whopPaymentId,
      updatedAt: overrides.updatedAt ?? NOON,
    }),
  );
}

describe("share reads", () => {
  test("getShare reports a held deposit as capturable only until the person checks in", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "held", whopPaymentId: "pay_1" });
    expect(await t.query(internal.whop.money.getShare, { shareId })).toMatchObject({
      status: "held",
      kind: "deposit",
      whopPaymentId: "pay_1",
      capturable: true,
    });

    await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: state.frolicId, method: "manual" });
    expect((await t.query(internal.whop.money.getShare, { shareId }))!.capturable).toBe(false);
    expect(await t.query(internal.whop.money.getShare, { shareId: await share(t, state, state.ids.Dev, { kind: "chipIn", status: "held" }) })).toMatchObject({
      capturable: false,
      kind: "chipIn",
      whopPaymentId: null,
    });
    expect(await t.query(internal.whop.money.getShare, { shareId: await goneShare(t, state) })).toBeNull();
  });

  test("the pay page explains every reason it cannot take a payment", async () => {
    const t = makeT();
    const state = await live(t);
    expect(await t.query(internal.whop.money.payView, { token: "nope" })).toEqual({
      ok: false,
      message: "This link has expired.",
    });

    const due = await share(t, state, state.ids.Maya, { token: "due-token" });
    expect(await t.query(internal.whop.money.payView, { token: "due-token" })).toEqual({
      ok: true,
      title: "Today's frolic",
      when: expect.any(String),
      kind: "deposit",
      amountCents: 300,
      fundCents: 0,
    });

    await t.run(async (ctx) => await ctx.db.patch("shares", due, { status: "held" }));
    expect(await t.query(internal.whop.money.payView, { token: "due-token" })).toEqual({
      ok: false,
      message: "You're already set for this one.",
      art: "released",
    });

    const other = await share(t, state, state.ids.Dev, { token: "late-token" });
    await t.run(async (ctx) => await ctx.db.patch("frolics", state.frolicId, { endsAt: NOON - 1 }));
    expect(await t.query(internal.whop.money.payView, { token: "late-token" })).toEqual({
      ok: false,
      message: "This one is not happening right now.",
    });
    await t.run(async (ctx) => await ctx.db.patch("shares", other, { status: "waived" }));
    expect(await t.query(internal.whop.money.payView, { token: "late-token" })).toMatchObject({ ok: false });
  });

  test("the checkout link hands out a hold for a going member and nothing for anyone else", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    expect(await t.mutation(api.whop.pay.link, { deviceToken: token("Maya"), frolicId: crew.frolicId })).toEqual({
      kind: "none",
      reason: "not_revealed",
    });

    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    const link = await t.mutation(api.whop.pay.link, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    expect(link).toMatchObject({ kind: "hold", amountCents: 300 });
    expect(link.kind === "hold" && link.url).toContain("/pay/");

    expect(await t.mutation(api.whop.pay.link, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toEqual({
      kind: "none",
      reason: "not_member",
    });
    expect(await t.mutation(api.whop.pay.link, { deviceToken: token("Maya"), frolicId: crew.frolicId })).toMatchObject({
      kind: "hold",
    });
    await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId });
    vi.advanceTimersByTime(6000);
    await t.finishInProgressScheduledFunctions();
    await t.finishInProgressScheduledFunctions();
    expect(await t.mutation(api.whop.pay.link, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toMatchObject({
      kind: "hold",
    });

    const mayaShare = await t.run(
      async (ctx) =>
        await ctx.db
          .query("shares")
          .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", crew.frolicId).eq("userId", crew.ids.Maya))
          .unique(),
    );
    expect(mayaShare?.kind).toBe("deposit");
    expect(mayaShare?.status).toBe("due");
    await t.run(async (ctx) => await ctx.db.patch("shares", mayaShare!._id, { status: "pending" }));
    expect(await t.mutation(internal.whop.money.signal, { shareId: mayaShare!._id, signal: "authorized" })).toBe("held");
    expect(await t.mutation(api.whop.pay.link, { deviceToken: token("Maya"), frolicId: crew.frolicId })).toEqual({
      kind: "none",
      reason: "already_paid",
    });
  });
});

describe("share signals", () => {
  test("a hold moves due to held, then a cancel releases it", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "pending" });

    expect(await t.mutation(internal.whop.money.signal, { shareId, signal: "authorized" })).toBe("held");
    expect(await t.query(internal.whop.money.getShare, { shareId })).toMatchObject({ status: "held" });
    expect(await t.mutation(internal.whop.money.signal, { shareId, signal: "canceled" })).toBe("released");
    expect(await t.query(internal.whop.money.getShare, { shareId })).toMatchObject({ status: "released" });
  });

  test("a deposit that was charged while checked in is refreshed, and a dispute parks the share", async () => {
    const t = makeT();
    const state = await live(t);
    await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: state.frolicId, method: "manual" });
    const shareId = await share(t, state, state.ids.Maya, { status: "held", whopPaymentId: "pay_9" });

    expect(await t.mutation(internal.whop.money.signal, { shareId, signal: "succeeded" })).toBe("forfeited");
    expect(await t.query(internal.whop.money.getShare, { shareId })).toMatchObject({ status: "refunding" });
    expect(await t.run(async (ctx) => await ctx.db.query("fundLedger").collect())).toEqual([
      expect.objectContaining({ entry: "forfeit", amountCents: 300, shareId }),
    ]);

    const paid = await share(t, state, state.ids.Dev, { status: "paid", whopPaymentId: "pay_10" });
    expect(await t.mutation(internal.whop.money.signal, { shareId: paid, signal: "disputed" })).toBe("needsAttention");
  });

  test("an impossible transition changes nothing and a missing share returns null", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "due" });
    expect(await t.mutation(internal.whop.money.signal, { shareId, signal: "authorized" })).toBeNull();
    expect(await t.query(internal.whop.money.getShare, { shareId })).toMatchObject({ status: "due" });
    expect(await t.mutation(internal.whop.money.signal, { shareId: await goneShare(t, state), signal: "authorized" })).toBeNull();
  });

  test("a failed charge only lands on a pending share with no payment yet", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "pending" });
    await t.mutation(internal.whop.money.chargeFailed, { shareId, message: "Card declined" });
    expect(await t.run(async (ctx) => await ctx.db.get("shares", shareId))).toMatchObject({
      status: "failed",
      lastError: "Card declined",
    });

    const held = await share(t, state, state.ids.Dev, { status: "held", whopPaymentId: "pay_x" });
    await t.mutation(internal.whop.money.chargeFailed, { shareId: held, message: "late" });
    expect((await t.run(async (ctx) => await ctx.db.get("shares", held)))?.status).toBe("held");
    await t.mutation(internal.whop.money.chargeFailed, { shareId: await goneShare(t, state), message: "x" });
  });

  test("settling for attention gives back the money the fund already spent", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "releasing", whopPaymentId: "pay_3" });
    await t.run(
      async (ctx) =>
        await ctx.db.insert("fundLedger", {
          groupId: state.groupId,
          frolicId: state.frolicId,
          userId: state.ids.Maya,
          shareId,
          entry: "forfeit",
          amountCents: 300,
          at: NOON,
        }),
    );
    await t.mutation(internal.whop.money.settle, { shareId, status: "needsAttention", message: "refund failed" });
    expect(await t.run(async (ctx) => await ctx.db.get("shares", shareId))).toMatchObject({
      status: "needsAttention",
      lastError: "refund failed",
    });
    const ledger = await t.run(async (ctx) => await ctx.db.query("fundLedger").collect());
    expect(ledger.at(-1)).toMatchObject({ entry: "adjustment", amountCents: -300 });

    const released = await share(t, state, state.ids.Dev, { status: "releasing" });
    await t.mutation(internal.whop.money.settle, { shareId: released, status: "released" });
    expect((await t.run(async (ctx) => await ctx.db.get("shares", released)))?.status).toBe("released");
    expect((await t.run(async (ctx) => await ctx.db.get("shares", released)))?.lastError).toBeUndefined();
  });

  test("an unanswered hold is waived at the plan's leave time and its person comes out of the plan", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "due", updatedAt: NOON - 11 * MINUTE });
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", state.frolicId));
    vi.setSystemTime(Math.max(NOON, (frolic?.startsAt ?? NOON) - 8 * MINUTE));

    await t.mutation(internal.whop.money.confirmExpired, { shareId });
    expect(await t.run(async (ctx) => await ctx.db.get("shares", shareId))).toMatchObject({ status: "waived" });
    const attendee = await t.run(
      async (ctx) =>
        await ctx.db
          .query("attendees")
          .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", state.frolicId).eq("userId", state.ids.Maya))
          .unique(),
    );
    expect(attendee?.status).toBe("sittingOut");
  });

  test("an unanswered hold that was just created waits for its window instead of expiring", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "due", updatedAt: NOON });
    await t.mutation(internal.whop.money.confirmExpired, { shareId });
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("due");
    const rescheduled = await t.run(
      async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (s) => s.name.replace(".js", "") === "whop/money:confirmExpired",
        ),
    );
    expect(rescheduled.length).toBeGreaterThan(0);
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("due");
  });
});

describe("money actions", () => {
  test("release voids a hold and records the cancel", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "releasing", whopPaymentId: "pay_rel" });
    payments.set("pay_rel", { status: "authorized", substatus: "requires_capture" });

    await t.action(internal.whop.actions.release, { shareId });
    expect(paymentCalls).toContain("void pay_rel");
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("released");
  });

  test("release falls back to a refund when the void is refused", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "releasing", whopPaymentId: "pay_fb" });
    payments.set("pay_fb", { status: "paid", substatus: "succeeded" });
    failNext = "/void";

    await t.action(internal.whop.actions.release, { shareId });
    expect(paymentCalls).toContain("refund pay_fb");
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("refunded");
  });

  test("release parks the share for attention when neither the void nor the refund works", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "releasing", whopPaymentId: "pay_bad" });
    payments.set("pay_bad", { status: "paid", substatus: "succeeded" });
    failNext = "/payments/pay_bad/void";

    await t.action(internal.whop.actions.release, { shareId });
    failNext = "/refund";
    await t.action(internal.whop.actions.release, { shareId });
    const row = await t.run(async (ctx) => await ctx.db.get("shares", shareId));
    expect(["needsAttention", "refunded", "releasing"]).toContain(row?.status);
  });

  test("release ignores a share that is not releasing or has no payment", async () => {
    const t = makeT();
    const state = await live(t);
    const held = await share(t, state, state.ids.Maya, { status: "held", whopPaymentId: "pay_h" });
    await t.action(internal.whop.actions.release, { shareId: held });
    expect(paymentCalls).toEqual([]);
    const releasing = await share(t, state, state.ids.Dev, { status: "releasing" });
    await t.action(internal.whop.actions.release, { shareId: releasing });
    expect(paymentCalls).toEqual([]);
  });

  test("capture takes an authorized hold and records it as forfeited", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "held", whopPaymentId: "pay_cap" });
    payments.set("pay_cap", { status: "authorized", substatus: "requires_capture" });

    await t.action(internal.whop.actions.capture, { shareId });
    expect(paymentCalls).toContain("capture pay_cap");
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("forfeited");
  });

  test("capture does not take a hold that is no longer authorized", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "held", whopPaymentId: "pay_void" });
    payments.set("pay_void", { status: "void", substatus: "canceled" });

    await t.action(internal.whop.actions.capture, { shareId });
    expect(paymentCalls).not.toContain("capture pay_void");
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("released");
  });

  test("capture leaves a checked in person's hold alone", async () => {
    const t = makeT();
    const state = await live(t);
    await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: state.frolicId, method: "manual" });
    const shareId = await share(t, state, state.ids.Maya, { status: "held", whopPaymentId: "pay_keep" });
    await t.action(internal.whop.actions.capture, { shareId });
    expect(paymentCalls).toEqual([]);
  });

  test("a refund that succeeds marks the share refunded, and one that fails retries then gives up", async () => {
    const t = makeT();
    const state = await live(t);
    const good = await share(t, state, state.ids.Maya, { status: "refunding", whopPaymentId: "pay_r1" });
    payments.set("pay_r1", { status: "paid", substatus: "succeeded" });
    await t.action(internal.whop.actions.refund, { shareId: good, tries: 0 });
    expect((await t.run(async (ctx) => await ctx.db.get("shares", good)))?.status).toBe("refunded");

    const bad = await share(t, state, state.ids.Dev, { status: "refunding", whopPaymentId: "pay_r2" });
    payments.set("pay_r2", { status: "paid", substatus: "succeeded" });
    failNext = "/payments/pay_r2/refund";
    await t.action(internal.whop.actions.refund, { shareId: bad, tries: 0 });
    expect((await t.run(async (ctx) => await ctx.db.get("shares", bad)))?.status).toBe("refunding");

    failNext = "/payments/pay_r2/refund";
    await t.action(internal.whop.actions.refund, { shareId: bad, tries: 2 });
    expect((await t.run(async (ctx) => await ctx.db.get("shares", bad)))?.status).toBe("needsAttention");
  });

  test("an orphan payment is voided, and a payment that cannot be voided is left alone", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "pending", whopPaymentId: "pay_o1" });
    payments.set("pay_o1", { status: "authorized", substatus: "requires_capture" });
    await t.action(internal.whop.actions.voidOrphan, { shareId, paymentId: "pay_o1" });
    expect(paymentCalls).toContain("void pay_o1");

    failNext = "/payments/pay_o2/void";
    await t.action(internal.whop.actions.voidOrphan, { shareId, paymentId: "pay_o2" });
    failNext = "/payments/pay_o3/void";
    expect(await t.action(internal.whop.actions.voidOrphan, { shareId, paymentId: "pay_o3" })).toBeNull();
  });

  test("reconcile gives up on a charge that never got a payment", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "pending", updatedAt: NOON - 40 * MINUTE });
    await t.action(internal.whop.actions.reconcile, { shareId });
    expect(await t.run(async (ctx) => await ctx.db.get("shares", shareId))).toMatchObject({
      status: "failed",
      lastError: "Abandoned",
    });
  });

  test("reconcile re-reads a live payment and applies what Whop says", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "pending", whopPaymentId: "pay_live" });
    payments.set("pay_live", { status: "authorized", substatus: "requires_capture" });
    await t.action(internal.whop.actions.reconcile, { shareId });
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("held");
  });

  test("reconcile parks a share after fifteen failed reads but reschedules before that", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "held", whopPaymentId: "pay_err" });
    failNext = "/payments/pay_err";
    await t.action(internal.whop.actions.reconcile, { shareId, errors: 1 });
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("held");

    failNext = "/payments/pay_err";
    await t.action(internal.whop.actions.reconcile, { shareId, errors: 14 });
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("needsAttention");
  });

  test("reconcile ignores a share that is already settled", async () => {
    const t = makeT();
    const state = await live(t);
    const shareId = await share(t, state, state.ids.Maya, { status: "refunded", whopPaymentId: "pay_done" });
    await t.action(internal.whop.actions.reconcile, { shareId });
    expect(paymentCalls).toEqual([]);
    expect((await t.run(async (ctx) => await ctx.db.get("shares", shareId)))?.status).toBe("refunded");
    expect(await t.action(internal.whop.actions.reconcile, { shareId: await goneShare(t, state) })).toBeNull();
  });
});

void HOUR;

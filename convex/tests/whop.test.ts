import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { signWebhook, verifyWebhook } from "../whop/signature";
import { nextStatus, splitCost } from "../whop/split";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token, type Crew, type T } from "./setup.helpers";

declare const process: { env: Record<string, string | undefined> };

const BASE = "https://sandbox-api.whop.com/api/v1";
const HEX32 = /^[0-9a-f]{32}$/;

type WhopCall = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
};
type PaymentState = { status: string; substatus: string };

let calls: WhopCall[] = [];
let payments = new Map<string, PaymentState>();
let created: PaymentState = { status: "authorized", substatus: "requires_capture" };
let seq = 0;

function paymentJson(id: string, state: PaymentState) {
  return {
    id,
    status: state.status,
    substatus: state.substatus,
    client_secret: "cs",
    amount_after_fees: { amount: "2.62" },
  };
}

async function fakeFetch(
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<Response> {
  const path = input.slice(BASE.length);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
  calls.push({ method, path, headers: { ...(init?.headers ?? {}) }, body });
  const reply = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  if (method === "POST" && path === "/payments") {
    const id = `pay_${++seq}`;
    payments.set(id, { ...created });
    return reply(paymentJson(id, created));
  }
  const match = /^\/payments\/([^/]+)(?:\/(void|capture|refund))?$/.exec(path);
  if (!match) return reply({ error: "unknown" }, 404);
  const [, id, action] = match;
  const state: PaymentState =
    action === undefined
      ? (payments.get(id) ?? { status: "authorized", substatus: "requires_capture" })
      : action === "void"
        ? { status: "void", substatus: "canceled" }
        : action === "capture"
          ? { status: "paid", substatus: "succeeded" }
          : { status: "refunded", substatus: "refunded" };
  if (action !== undefined) payments.set(id, state);
  return reply(paymentJson(id, state));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  process.env.WHOP_SANDBOX_API_KEY = "test";
  process.env.WHOP_API_BASE = BASE;
  process.env.WHOP_WEBHOOK_SECRET = "ws_test";
  process.env.WHOP_ACCOUNT_ID = "biz_test";
  process.env.CONVEX_SITE_URL = "https://frolic.convex.site";
  calls = [];
  payments = new Map();
  created = { status: "authorized", substatus: "requires_capture" };
  seq = 0;
  vi.stubGlobal("fetch", fakeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function drain(t: T, rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function sharesOf(t: T, frolicId: Id<"frolics">): Promise<Doc<"shares">[]> {
  return await t.run(
    async (ctx) => await ctx.db.query("shares").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(50),
  );
}

async function shareOf(t: T, crew: Crew, name: string): Promise<Doc<"shares">> {
  return await t.run(
    async (ctx) =>
      (await ctx.db
        .query("shares")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", crew.frolicId).eq("userId", crew.ids[name]))
        .unique())!,
  );
}

async function ledgerRows(t: T, groupId: Id<"groups">) {
  return await t.run(
    async (ctx) => await ctx.db.query("fundLedger").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).take(50),
  );
}

async function heldCrew(t: T, names = ["Maya", "Dev", "Jordan"]) {
  const crew = await setupCrew(t, names);
  await tap(t, crew, "Maya");
  await tap(t, crew, "Dev");
  await flipDue(t);
  await drain(t);
  return crew;
}

async function hold(t: T, crew: Crew, name: string) {
  const share = await shareOf(t, crew, name);
  const out = await t.action(internal.whop.actions.charge, { token: share.token!, confirmationToken: `ctok_${name}` });
  expect(out.ok).toBe(true);
  return await shareOf(t, crew, name);
}

async function paidCrew(t: T, names = ["Maya", "Dev", "Jordan"]) {
  const crew = await setupCrew(t, names);
  const placeId = await t.run(
    async (ctx) =>
      await ctx.db.insert("places", {
        slug: "sunset-park",
        name: "Sunset Park",
        lat: 37.8,
        lng: -122.5,
        cost: 8,
        tags: [],
        hours: [],
        indoor: false,
        sober: true,
        title: "Sunset Park",
        address: "1 Sunset Way",
        costPerPersonCents: 800,
        costLabel: "$8",
        payUpFront: true,
        priceVerified: true,
        energy: "chill",
        needsDaylight: false,
        durationMinutes: 60,
        meetSpot: "The gate",
        source: "seed",
      }),
  );
  const planId = await t.run(
    async (ctx) =>
      await ctx.db.insert("plans", {
        groupId: crew.groupId,
        day: "2026-11-15",
        kind: "daily",
        placeId,
        title: "Sunset Park",
        line: "Golden hour at the water",
        cost: 8,
        startsAt: NOON + HOUR,
        durationMinutes: 60,
        source: "fallback",
        generatedAt: NOON,
        costLabel: "$8",
        payUpFront: true,
        chips: [],
        whySource: "template",
        whyInputs: { placeName: "Sunset Park", topTags: [], rainSwap: false },
        weatherSwap: false,
      }),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch("frolics", crew.frolicId, { planId });
    await ctx.db.insert("fundLedger", { groupId: crew.groupId, entry: "deposit", amountCents: 300, at: NOON });
  });
  return crew;
}

describe("splitCost", () => {
  test("splits the plan across people, leaning on the fund first", () => {
    expect(splitCost(800, 3, 0, 100)).toEqual({ appliedCents: 0, shares: [800, 800, 800] });
    expect(splitCost(800, 3, 300, 100)).toEqual({ appliedCents: 300, shares: [700, 700, 700] });
    expect(splitCost(800, 3, 5000, 100)).toEqual({ appliedCents: 2400, shares: [0, 0, 0] });
    expect(splitCost(0, 3, 500, 100)).toEqual({ appliedCents: 0, shares: [] });
    expect(splitCost(1000, 0, 500, 100)).toEqual({ appliedCents: 0, shares: [] });
  });

  test("puts the leftover cents on the first shares", () => {
    const split = splitCost(1000, 3, 1, 100);
    expect(split.appliedCents).toBe(1);
    expect(split.shares).toEqual([1000, 1000, 999]);
    expect(split.shares.reduce((a, b) => a + b, 0)).toBe(2999);
  });

  test("rounds a sub dollar share up to the minimum charge", () => {
    expect(splitCost(50, 3, 0, 100)).toEqual({ appliedCents: 0, shares: [100, 100, 100] });
    expect(splitCost(30, 3, 10, 100)).toEqual({ appliedCents: 0, shares: [100, 100, 100] });
  });

  test("leaves fund money unspent rather than collect more than the plan costs", () => {
    expect(splitCost(120, 3, 100, 100)).toEqual({ appliedCents: 60, shares: [100, 100, 100] });
    expect(splitCost(150, 2, 250, 100)).toEqual({ appliedCents: 100, shares: [100, 100] });
    for (const [per, people, fund] of [[120, 3, 100], [999, 4, 3500], [101, 5, 7], [400, 3, 1150]]) {
      const split = splitCost(per, people, fund, 100);
      const collected = split.appliedCents + split.shares.reduce((a, b) => a + b, 0);
      expect(collected).toBe(per * people);
      expect(split.shares.every((c) => c === 0 || c >= 100)).toBe(true);
    }
  });
});

describe("nextStatus", () => {
  test("a deposit walks pending, held, and then one final state", () => {
    expect(nextStatus("deposit", "due", "authorized")).toBeNull();
    expect(nextStatus("deposit", "pending", "authorized")).toBe("held");
    expect(nextStatus("deposit", "held", "authorized")).toBeNull();
    expect(nextStatus("deposit", "held", "succeeded")).toBe("forfeited");
    expect(nextStatus("deposit", "pending", "succeeded")).toBe("forfeited");
    expect(nextStatus("deposit", "due", "succeeded")).toBeNull();
    expect(nextStatus("deposit", "pending", "canceled")).toBe("released");
    expect(nextStatus("deposit", "held", "canceled")).toBe("released");
    expect(nextStatus("deposit", "released", "authorized")).toBeNull();
    expect(nextStatus("deposit", "released", "canceled")).toBeNull();
    expect(nextStatus("deposit", "released", "succeeded")).toBeNull();
    expect(nextStatus("deposit", "forfeited", "refunded")).toBe("refunded");
    expect(nextStatus("deposit", "refunding", "refunded")).toBe("refunded");
    expect(nextStatus("deposit", "due", "refunded")).toBeNull();
    expect(nextStatus("deposit", "pending", "failed")).toBe("failed");
    expect(nextStatus("deposit", "held", "failed")).toBeNull();
    expect(nextStatus("deposit", "paid", "disputed")).toBe("needsAttention");
    expect(nextStatus("deposit", "due", "disputed")).toBeNull();
    expect(nextStatus("deposit", "held", "pending")).toBeNull();
  });

  test("a chip in is paid up front and never held", () => {
    expect(nextStatus("chipIn", "pending", "authorized")).toBeNull();
    expect(nextStatus("chipIn", "pending", "succeeded")).toBe("paid");
    expect(nextStatus("chipIn", "paid", "succeeded")).toBeNull();
    expect(nextStatus("chipIn", "due", "succeeded")).toBeNull();
    expect(nextStatus("chipIn", "pending", "failed")).toBe("failed");
    expect(nextStatus("chipIn", "pending", "canceled")).toBe("failed");
    expect(nextStatus("chipIn", "paid", "canceled")).toBeNull();
    expect(nextStatus("chipIn", "paid", "refunded")).toBe("refunded");
    expect(nextStatus("chipIn", "refunding", "refunded")).toBe("refunded");
    expect(nextStatus("chipIn", "pending", "refunded")).toBeNull();
    expect(nextStatus("chipIn", "paid", "disputed")).toBe("needsAttention");
    expect(nextStatus("chipIn", "paid", "pending")).toBeNull();
  });
});

describe("webhook signatures", () => {
  test("accepts its own signature and rejects a wrong secret, a stale timestamp, or a tampered body", async () => {
    const body = JSON.stringify({ type: "payment.authorized", data: { id: "pay_1" } });
    const ts = String(Math.floor(NOON / 1000));
    const good = await signWebhook("ws_test", "evt_1", ts, body);
    const headers = { id: "evt_1", timestamp: ts, signature: good };

    expect(good.startsWith("v1,")).toBe(true);
    expect(await verifyWebhook("ws_test", headers, body, NOON)).toBe(true);
    expect(await verifyWebhook("ws_other", headers, body, NOON)).toBe(false);
    expect(await verifyWebhook("ws_test", { ...headers, signature: await signWebhook("ws_other", "evt_1", ts, body) }, body, NOON)).toBe(false);
    expect(await verifyWebhook("ws_test", headers, body, NOON + 301 * 1000)).toBe(false);
    expect(await verifyWebhook("ws_test", headers, body, NOON + 299 * 1000)).toBe(true);
    expect(await verifyWebhook("ws_test", headers, `${body} `, NOON)).toBe(false);
    expect(await verifyWebhook("ws_test", { ...headers, timestamp: "not-a-number" }, body, NOON)).toBe(false);
    expect(await verifyWebhook("ws_test", { id: null, timestamp: ts, signature: good }, body, NOON)).toBe(false);
  });
});

describe("reveal opens the money", () => {
  test("a free plan makes one three dollar hold per going attendee, only once the reveal flips", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");

    expect(await sharesOf(t, crew.frolicId)).toHaveLength(0);
    await flipDue(t);
    await drain(t);

    const shares = await sharesOf(t, crew.frolicId);
    expect(shares).toHaveLength(2);
    expect(shares.map((s) => s.userId).sort()).toEqual([crew.ids.Maya, crew.ids.Dev].sort());
    for (const share of shares) {
      expect(share.kind).toBe("deposit");
      expect(share.amountCents).toBe(300);
      expect(share.status).toBe("due");
      expect(share.token).toMatch(HEX32);
      expect(share.groupId).toBe(crew.groupId);
    }
    expect(new Set(shares.map((s) => s.token)).size).toBe(2);
  });

  test("checkout link waits for the reveal, then hands each attendee a stable hold url", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");

    expect(await t.mutation(internal.whop.links.checkoutLink, { userId: crew.ids.Maya, frolicId: crew.frolicId })).toEqual({
      kind: "none",
      reason: "not_revealed",
    });

    await flipDue(t);
    await drain(t);
    expect(await t.mutation(internal.whop.links.checkoutLink, { userId: crew.ids.Jordan, frolicId: crew.frolicId })).toEqual({
      kind: "none",
      reason: "not_member",
    });

    const link = await t.mutation(internal.whop.links.checkoutLink, { userId: crew.ids.Maya, frolicId: crew.frolicId });
    expect(link.kind).toBe("hold");
    if (link.kind !== "hold") throw new Error("expected a hold link");
    expect(link.amountCents).toBe(300);
    expect(link.url).toMatch(/\/pay\/[0-9a-f]{32}$/);
    expect(link.url).toBe(`https://frolic.convex.site/pay/${(await shareOf(t, crew, "Maya")).token}`);
    expect(link.expiresAt).toBe(NOON + HOUR);

    const again = await t.mutation(internal.whop.links.checkoutLink, { userId: crew.ids.Maya, frolicId: crew.frolicId });
    expect(again).toEqual(link);
  });
});

describe("holds, check ins, no shows", () => {
  test("a confirmed hold is voided when the person checks in", async () => {
    const t = makeT();
    const crew = await heldCrew(t);

    const held = await hold(t, crew, "Maya");
    expect(held.status).toBe("held");
    expect(held.whopPaymentId).toBe("pay_1");

    const post = calls.find((c) => c.method === "POST" && c.path === "/payments")!;
    expect(post.body).toMatchObject({ capture: false, account_id: "biz_test", confirmation_token: "ctok_Maya" });
    expect(post.headers["Idempotency-Key"]).toBe(`${held._id}:charge:ctok_Maya`);
    expect(post.headers.Authorization).toBe("Bearer test");
    expect((post.body!.metadata as Record<string, unknown>).shareId).toBe(held._id);

    await t.mutation(internal.checkins.checkInAs, { userId: crew.ids.Maya, frolicId: crew.frolicId, method: "geofence" });
    await drain(t);

    const after = await shareOf(t, crew, "Maya");
    expect(after.status).toBe("released");
    expect(calls.some((c) => c.method === "POST" && c.path === "/payments/pay_1/void")).toBe(true);
    expect(await ledgerRows(t, crew.groupId)).toHaveLength(0);
  });

  test("a no show is captured and the money lands in the fund", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    const held = await hold(t, crew, "Maya");
    expect(held.status).toBe("held");

    await t.mutation(internal.whop.money.noShowSweep, { frolicId: crew.frolicId });
    await drain(t);

    const after = await shareOf(t, crew, "Maya");
    expect(after.status).toBe("forfeited");
    expect(calls.some((c) => c.method === "POST" && c.path === "/payments/pay_1/capture")).toBe(true);

    const rows = await ledgerRows(t, crew.groupId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entry: "forfeit",
      amountCents: 262,
      userId: crew.ids.Maya,
      shareId: after._id,
      whopPaymentId: "pay_1",
    });
  });

  test("a late arrival after a forfeit gets refunded and the fund nets back to zero", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    await hold(t, crew, "Maya");
    await t.mutation(internal.whop.money.noShowSweep, { frolicId: crew.frolicId });
    await drain(t);
    expect((await shareOf(t, crew, "Maya")).status).toBe("forfeited");

    await t.mutation(internal.checkins.checkInAs, { userId: crew.ids.Maya, frolicId: crew.frolicId, method: "geofence" });
    await drain(t);

    expect((await shareOf(t, crew, "Maya")).status).toBe("refunded");
    expect(calls.some((c) => c.method === "POST" && c.path === "/payments/pay_1/refund")).toBe(true);
    const rows = await ledgerRows(t, crew.groupId);
    expect(rows.map((r) => [r.entry, r.amountCents])).toEqual([
      ["forfeit", 262],
      ["adjustment", -262],
    ]);
    expect(rows.reduce((sum, r) => sum + r.amountCents, 0)).toBe(0);
  });

  test("a bail more than an hour out voids the hold and a later bail leaves it held", async () => {
    const t = makeT();
    const window = { start: NOON + 2 * HOUR, end: NOON + 5 * HOUR };
    const early = await setupCrew(t, ["Maya", "Dev"], { window });
    await tap(t, early, "Maya");
    await tap(t, early, "Dev");
    await flipDue(t);
    await drain(t);
    expect(await hold(t, early, "Maya")).toMatchObject({ status: "held", whopPaymentId: "pay_1" });

    await t.mutation(api.frolics.sitOut, { deviceToken: token("Maya"), frolicId: early.frolicId });
    await drain(t);
    expect((await shareOf(t, early, "Maya")).status).toBe("released");
    expect(calls.some((c) => c.method === "POST" && c.path === "/payments/pay_1/void")).toBe(true);

    const late = await setupCrew(t, ["Priya", "Noah"], { window });
    await tap(t, late, "Priya");
    await tap(t, late, "Noah");
    await flipDue(t);
    await drain(t);
    expect(await hold(t, late, "Priya")).toMatchObject({ status: "held", whopPaymentId: "pay_2" });

    vi.setSystemTime(NOON + 2 * HOUR - 30 * 60 * 1000);
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Priya"), frolicId: late.frolicId });
    await drain(t);
    expect((await shareOf(t, late, "Priya")).status).toBe("held");
    expect(calls.filter((c) => c.path.endsWith("/void")).map((c) => c.path)).toEqual(["/payments/pay_1/void"]);
  });

  test("a second payment for a share that already has one is voided and the first is kept", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    const held = await hold(t, crew, "Maya");
    expect(held.whopPaymentId).toBe("pay_1");

    await t.mutation(internal.whop.money.recordCharge, { shareId: held._id, whopPaymentId: "pay_9", signal: "authorized" });
    await drain(t);

    const after = await shareOf(t, crew, "Maya");
    expect(after).toMatchObject({ status: "held", whopPaymentId: "pay_1" });
    expect(calls.some((c) => c.method === "POST" && c.path === "/payments/pay_9/void")).toBe(true);
    expect(calls.some((c) => c.path === "/payments/pay_1/void")).toBe(false);
  });

  test("calling off a paid plan refunds the friends still going and puts the fund money back", async () => {
    const t = makeT();
    const crew = await paidCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await drain(t);
    created = { status: "paid", substatus: "succeeded" };
    await hold(t, crew, "Maya");
    await hold(t, crew, "Dev");
    expect((await ledgerRows(t, crew.groupId)).map((r) => [r.entry, r.amountCents])).toEqual([
      ["deposit", 300],
      ["payout", -300],
    ]);

    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    await drain(t);

    expect((await shareOf(t, crew, "Maya")).status).toBe("refunded");
    expect((await shareOf(t, crew, "Dev")).status).toBe("paid");
    expect(calls.some((c) => c.method === "POST" && c.path === "/payments/pay_1/refund")).toBe(true);
    expect(calls.some((c) => c.path === "/payments/pay_2/refund")).toBe(false);
    const rows = await ledgerRows(t, crew.groupId);
    expect(rows.reduce((sum, r) => sum + r.amountCents, 0)).toBe(300);
  });

  test("an unpaid share is waived when the plan is called off", async () => {
    const t = makeT();
    const crew = await paidCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await drain(t);
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    await drain(t);
    expect((await shareOf(t, crew, "Maya")).status).toBe("waived");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  test("an unconfirmed hold expires ten minutes after the reveal and sits the person out", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    expect((await shareOf(t, crew, "Maya")).status).toBe("due");

    vi.advanceTimersByTime(9 * 60 * 1000);
    await t.finishInProgressScheduledFunctions();
    expect((await shareOf(t, crew, "Maya")).status).toBe("due");

    vi.advanceTimersByTime(2 * 60 * 1000);
    await t.finishInProgressScheduledFunctions();
    await drain(t);

    expect((await shareOf(t, crew, "Maya")).status).toBe("waived");
    const attendee = await t.run(
      async (ctx) =>
        await ctx.db
          .query("attendees")
          .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", crew.frolicId).eq("userId", crew.ids.Maya))
          .unique(),
    );
    expect(attendee?.status).toBe("sittingOut");
  });

  test("a paid plan chips in what the fund does not cover", async () => {
    const t = makeT();
    const crew = await paidCrew(t);

    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Jordan");
    await flipDue(t);
    await drain(t);

    const shares = await sharesOf(t, crew.frolicId);
    expect(shares).toHaveLength(3);
    expect(shares.every((s) => s.kind === "chipIn")).toBe(true);
    expect(shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(2400 - 300);
    expect(shares.map((s) => s.amountCents)).toEqual([700, 700, 700]);

    const rows = await ledgerRows(t, crew.groupId);
    expect(rows.map((r) => [r.entry, r.amountCents])).toEqual([
      ["deposit", 300],
      ["payout", -300],
    ]);

    created = { status: "paid", substatus: "succeeded" };
    await hold(t, crew, "Maya");
    const post = calls.find((c) => c.method === "POST" && c.path === "/payments")!;
    expect(post.body).toMatchObject({ capture: true });
    expect((post.body!.variant as Record<string, unknown>).initial_price).toBe(7);
    expect((await shareOf(t, crew, "Maya")).status).toBe("paid");
  });
});

describe("webhooks", () => {
  test("ingest applies each event once and never wakes a released share", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    const share = await shareOf(t, crew, "Maya");
    const begun = await t.mutation(internal.whop.money.beginCharge, { token: share.token! });
    expect(begun.ok).toBe(true);
    expect((await shareOf(t, crew, "Maya")).status).toBe("pending");

    const authorized = JSON.stringify({
      type: "payment.authorized",
      data: { id: "pay_1", status: "authorized", substatus: "requires_capture", metadata: { shareId: share._id } },
    });
    expect(await t.mutation(internal.whop.webhooks.ingest, { eventId: "evt_1", type: "payment.authorized", payload: authorized })).toBe("applied");
    expect((await shareOf(t, crew, "Maya")).status).toBe("held");
    expect((await shareOf(t, crew, "Maya")).whopPaymentId).toBe("pay_1");

    expect(await t.mutation(internal.whop.webhooks.ingest, { eventId: "evt_1", type: "payment.authorized", payload: authorized })).toBe("duplicate");
    expect((await shareOf(t, crew, "Maya")).status).toBe("held");

    const canceled = JSON.stringify({ type: "payment.canceled", data: { id: "pay_1", status: "void", substatus: "canceled" } });
    expect(await t.mutation(internal.whop.webhooks.ingest, { eventId: "evt_2", type: "payment.canceled", payload: canceled })).toBe("applied");
    expect((await shareOf(t, crew, "Maya")).status).toBe("released");

    expect(await t.mutation(internal.whop.webhooks.ingest, { eventId: "evt_3", type: "payment.authorized", payload: authorized })).toBe("ignored");
    expect((await shareOf(t, crew, "Maya")).status).toBe("released");
  });

  test("a webhook for a stray second payment voids it and leaves the share alone", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    const held = await hold(t, crew, "Maya");
    const stray = JSON.stringify({
      type: "payment.authorized",
      data: { id: "pay_7", status: "authorized", substatus: "requires_capture", metadata: { shareId: held._id } },
    });
    expect(await t.mutation(internal.whop.webhooks.ingest, { eventId: "evt_stray", type: "payment.authorized", payload: stray })).toBe("ignored");
    await drain(t);
    expect(await shareOf(t, crew, "Maya")).toMatchObject({ status: "held", whopPaymentId: "pay_1" });
    expect(calls.some((c) => c.method === "POST" && c.path === "/payments/pay_7/void")).toBe(true);
  });

  test("the http route answers 200 on a good signature and 401 on a bad one", async () => {
    const t = makeT();
    const body = JSON.stringify({ type: "payment.authorized", data: { id: "pay_1" } });
    const ts = String(Math.floor(NOON / 1000));
    const signature = await signWebhook("ws_test", "evt_http", ts, body);
    const headers = { "Content-Type": "application/json", "webhook-id": "evt_http", "webhook-timestamp": ts, "webhook-signature": signature };

    const good = await t.fetch("/whop/webhook", { method: "POST", headers, body });
    expect(good.status).toBe(200);

    const bad = await t.fetch("/whop/webhook", {
      method: "POST",
      headers: { ...headers, "webhook-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
      body,
    });
    expect(bad.status).toBe(401);
  });
});

describe("pay views", () => {
  test("the fund hides a no show line until the frolic is done", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    await hold(t, crew, "Maya");
    await t.mutation(internal.whop.money.noShowSweep, { frolicId: crew.frolicId });
    await drain(t);

    const before = await t.query(api.whop.pay.fund, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(before.balanceCents).toBe(262);
    expect(before.entries).toEqual([]);

    await t.run(async (ctx) => await ctx.db.patch("frolics", crew.frolicId, { status: "done" }));
    const after = await t.query(api.whop.pay.fund, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(after.balanceCents).toBe(262);
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0].line).toBe("A no-show added $2.62.");
    expect(after.entries[0].amountCents).toBe(262);
    expect(after.entries[0].frolicId).toBe(crew.frolicId);
  });

  test("my payment shows my own state and only the other people who paid", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    await hold(t, crew, "Maya");
    await hold(t, crew, "Dev");

    const maya = await t.query(api.whop.pay.myPayment, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    expect(maya.state).toBe("held");
    expect(maya.kind).toBe("hold");
    expect(maya.amountCents).toBe(300);
    expect(maya.error).toBeNull();
    expect(maya.paidNames).toEqual(["Dev"]);

    const dev = await t.query(api.whop.pay.myPayment, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(dev.state).toBe("held");
    expect(dev.paidNames).toEqual(["Maya"]);
  });
});

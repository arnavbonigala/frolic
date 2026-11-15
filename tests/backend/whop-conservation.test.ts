import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { splitCost } from "../../convex/whop/split";
import { HOUR, NOON, flipDue, makeT, setupCrew as baseCrew, tap, token, type Crew, type T } from "./setup.helpers";

declare const process: { env: Record<string, string | undefined> };

const BASE = "https://sandbox-api.whop.com/api/v1";

type SandboxPayment = {
  id: string;
  amountCents: number;
  hold: boolean;
  userId: string | undefined;
  shareId: string | undefined;
  status: string;
  substatus: string;
  declined: boolean;
  captured: boolean;
  released: boolean;
  refunded: boolean;
};

let pays: SandboxPayment[] = [];
let calls: { method: string; path: string }[] = [];
let seq = 0;
let created: { status: string; substatus: string } = { status: "authorized", substatus: "requires_capture" };

function paymentJson(p: SandboxPayment) {
  return {
    id: p.id,
    status: p.status,
    substatus: p.substatus,
    client_secret: "cs",
    amount_after_fees: { amount: (p.amountCents / 100).toFixed(2) },
    metadata: { shareId: p.shareId, userId: p.userId },
  };
}

function addPayment(amountCents: number, hold: boolean, metadata: Record<string, unknown> | undefined, state: { status: string; substatus: string }) {
  const p: SandboxPayment = {
    id: `pay_${++seq}`,
    amountCents,
    hold,
    userId: typeof metadata?.userId === "string" ? metadata.userId : undefined,
    shareId: typeof metadata?.shareId === "string" ? metadata.shareId : undefined,
    status: state.status,
    substatus: state.substatus,
    declined: state.status === "failed",
    captured: false,
    released: false,
    refunded: false,
  };
  pays.push(p);
  return p;
}

async function fakeFetch(input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Response> {
  const path = input.slice(BASE.length);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
  calls.push({ method, path });
  const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  if (method === "POST" && path === "/payments") {
    const variant = (body?.variant ?? {}) as { initial_price?: number };
    const amountCents = Math.round(Number(variant.initial_price ?? 0) * 100);
    const p = addPayment(amountCents, body?.capture === false, body?.metadata as Record<string, unknown> | undefined, created);
    return reply(paymentJson(p));
  }
  if (method === "GET" && path.startsWith("/payments?")) {
    return reply({ data: pays.map((p) => ({ ...paymentJson(p), metadata: { shareId: p.shareId, userId: p.userId } })) });
  }
  const match = /^\/payments\/([^/]+)(?:\/(void|capture|refund))?$/.exec(path);
  if (!match) return reply({ error: "unknown" }, 404);
  const [, id, action] = match;
  const p = pays.find((x) => x.id === id);
  if (!p) return reply({ error: "no payment" }, 404);
  if (action === undefined) return reply(paymentJson(p));
  if (action === "void") {
    if (p.status !== "authorized") return reply({ error: "only an authorized payment can be voided" }, 400);
    p.status = "void";
    p.substatus = "canceled";
    p.released = true;
    return reply(paymentJson(p));
  }
  if (action === "capture") {
    if (p.status !== "authorized") return reply({ error: "only an authorized payment can be captured" }, 400);
    p.status = "paid";
    p.substatus = "succeeded";
    p.captured = true;
    return reply(paymentJson(p));
  }
  if (p.status !== "paid") return reply({ error: "only a paid payment can be refunded" }, 400);
  p.status = "refunded";
  p.substatus = "refunded";
  p.refunded = true;
  return reply(paymentJson(p));
}

function money() {
  const out = { authorised: 0, captured: 0, released: 0, refundedHold: 0, charged: 0, refundedChip: 0, kept: 0, open: 0 };
  for (const p of pays) {
    if (p.declined) continue;
    if (p.hold) {
      out.authorised += p.amountCents;
      if (p.captured) out.captured += p.amountCents;
      if (p.released) out.released += p.amountCents;
      if (p.refunded) out.refundedHold += p.amountCents;
      if (p.status === "authorized") out.open += p.amountCents;
    } else {
      out.charged += p.amountCents;
      if (p.refunded) out.refundedChip += p.amountCents;
      else out.kept += p.amountCents;
    }
  }
  return out;
}

function collectedOf(p: SandboxPayment): number {
  if (p.declined) return 0;
  return p.hold ? (p.captured ? p.amountCents : 0) : p.amountCents;
}

function netOf(p: SandboxPayment): number {
  return collectedOf(p) - (p.refunded ? p.amountCents : 0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  process.env.WHOP_SANDBOX_API_KEY = "test";
  process.env.WHOP_API_BASE = BASE;
  process.env.WHOP_WEBHOOK_SECRET = "ws_test";
  process.env.WHOP_ACCOUNT_ID = "biz_test";
  process.env.CONVEX_SITE_URL = "https://frolic.convex.site";
  pays = [];
  calls = [];
  seq = 0;
  created = { status: "authorized", substatus: "requires_capture" };
  vi.stubGlobal("fetch", fakeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setupCrew(t: T, names: string[], opts: Parameters<typeof baseCrew>[2] = {}): Promise<Crew> {
  const crew = await baseCrew(t, names, opts);
  await t.run(async (ctx) => await ctx.db.patch("groups", crew.groupId, { holdEnabled: true }));
  return crew;
}

async function advanceTo(t: T, when: number) {
  vi.advanceTimersByTime(Math.max(0, when - Date.now()));
  await t.finishInProgressScheduledFunctions();
  await drain(t);
}

async function drain(t: T, rounds = 10) {  for (let i = 0; i < rounds; i++) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function sharesOf(t: T, frolicId: Id<"frolics">): Promise<Doc<"shares">[]> {
  return await t.run(async (ctx) => await ctx.db.query("shares").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(50));
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

async function frolicOf(t: T, crew: Crew) {
  return (await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId)))!;
}

async function ledgerRows(t: T, groupId: Id<"groups">) {
  return await t.run(async (ctx) => await ctx.db.query("fundLedger").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).take(50));
}

async function heldCrew(t: T, names = ["Maya", "Dev", "Jordan"], durationMinutes = 60, window?: { start: number; end: number }) {
  const crew = await setupCrew(t, names, window ? { window } : {});
  await t.run(async (ctx) => await ctx.db.patch("frolics", crew.frolicId, { durationMinutes }));
  for (const name of names) await tap(t, crew, name);
  await flipDue(t);
  await drain(t);
  return crew;
}

async function paidCrew(t: T, names = ["Maya", "Dev", "Jordan"], fundCents = 300) {
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
    if (fundCents > 0) await ctx.db.insert("fundLedger", { groupId: crew.groupId, entry: "deposit", amountCents: fundCents, at: NOON });
  });
  return crew;
}

async function pay(t: T, crew: Crew, name: string, confirmationToken = `ctok_${name}`) {
  const share = await shareOf(t, crew, name);
  const out = await t.action(internal.whop.actions.charge, { token: share.token!, confirmationToken });
  await drain(t);
  return out;
}

function strayPayment(share: Doc<"shares">, state: { status: string; substatus: string }): SandboxPayment {
  return addPayment(share.amountCents, share.kind === "deposit", { shareId: share._id, userId: share.userId }, state);
}

async function webhook(t: T, eventId: string, type: string, data: Record<string, unknown>) {
  return await t.mutation(internal.whop.webhooks.ingest, { eventId, type, payload: JSON.stringify({ type, data }) });
}

async function assertConserved(t: T, crew: Crew) {
  const m = money();
  expect(m.open).toBe(0);
  expect(m.authorised).toBe(m.captured + m.released + m.refundedHold);
  expect(m.charged).toBe(m.refundedChip + m.kept);
  for (const share of await sharesOf(t, crew.frolicId)) {
    const mine = pays.filter((p) => p.shareId === share._id);
    const net = mine.reduce((sum, p) => sum + netOf(p), 0);
    expect(net).toBeLessThanOrEqual(share.amountCents);
    expect(mine.filter((p) => netOf(p) > 0).length).toBeLessThanOrEqual(1);
  }
  return m;
}

describe("two friends hold and one bails before the capture", () => {
  test("the bailer's hold is voided and the no show's is captured, so every held cent settles", async () => {
    const t = makeT();
    const crew = await heldCrew(t, ["Maya", "Dev", "Jordan"], 60, { start: NOON + 3 * HOUR, end: NOON + 8 * HOUR });
    expect((await pay(t, crew, "Maya")).ok).toBe(true);
    expect((await pay(t, crew, "Dev")).ok).toBe(true);
    expect(money()).toMatchObject({ authorised: 600, open: 600 });
    const start = (await frolicOf(t, crew)).startsAt!;

    await advanceTo(t, start - 90 * 60 * 1000);
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    await drain(t);
    expect((await shareOf(t, crew, "Dev")).status).toBe("released");

    await advanceTo(t, start + 46 * 60 * 1000);

    expect((await shareOf(t, crew, "Maya")).status).toBe("forfeited");
    const m = await assertConserved(t, crew);
    expect(m).toMatchObject({ authorised: 600, captured: 300, released: 300, refundedHold: 0 });
    expect((await ledgerRows(t, crew.groupId)).map((r) => [r.entry, r.amountCents])).toEqual([["forfeit", 300]]);
  });
});

describe("a plan is called off after every hold", () => {
  test("every hold is voided, nothing is captured, and the fund nets back to zero", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await drain(t);
    expect((await pay(t, crew, "Maya")).ok).toBe(true);
    expect((await pay(t, crew, "Dev")).ok).toBe(true);
    expect(money().open).toBe(600);

    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    await drain(t);

    expect((await shareOf(t, crew, "Maya")).status).toBe("released");
    expect((await shareOf(t, crew, "Dev")).status).toBe("released");
    const m = await assertConserved(t, crew);
    expect(m).toMatchObject({ authorised: 600, captured: 0, released: 600, refundedHold: 0 });
    expect(calls.filter((c) => c.path.endsWith("/capture"))).toHaveLength(0);
    expect((await ledgerRows(t, crew.groupId)).reduce((s, r) => s + r.amountCents, 0)).toBe(0);

    await advanceTo(t, (await frolicOf(t, crew)).startsAt! + 46 * 60 * 1000);
    expect(calls.filter((c) => c.path.endsWith("/capture"))).toHaveLength(0);
    expect((await assertConserved(t, crew)).captured).toBe(0);
  });
});

describe("a member's hold is declined", () => {
  test("no money moves, the friend comes out of the plan, and the other hold is voided", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await drain(t);

    created = { status: "failed", substatus: "blocked" };
    const declined = await pay(t, crew, "Maya");
    expect(declined).toEqual({ ok: false, message: "That didn't go through. Try again." });
    expect((await shareOf(t, crew, "Maya")).status).toBe("failed");

    created = { status: "authorized", substatus: "requires_capture" };
    expect((await pay(t, crew, "Dev")).ok).toBe(true);
    expect((await shareOf(t, crew, "Dev")).status).toBe("held");

    await t.mutation(api.frolics.sitOut, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    await drain(t);

    expect((await shareOf(t, crew, "Maya")).status).toBe("waived");
    expect((await shareOf(t, crew, "Dev")).status).toBe("released");
    const m = await assertConserved(t, crew);
    expect(m).toMatchObject({ authorised: 300, captured: 0, released: 300 });
    expect(pays.filter((p) => p.declined)).toHaveLength(1);
  });

  test("a friend whose card was declined can try again and the hold lands on the second try", async () => {
    const t = makeT();
    const crew = await heldCrew(t, ["Maya", "Dev"]);
    created = { status: "failed", substatus: "blocked" };
    expect((await pay(t, crew, "Maya")).ok).toBe(false);

    created = { status: "authorized", substatus: "requires_capture" };
    expect((await pay(t, crew, "Maya", "ctok_again")).ok).toBe(true);

    const share = await shareOf(t, crew, "Maya");
    expect(share.status).toBe("held");
    expect(share.whopPaymentId).toBe("pay_2");
    expect(pays.filter((p) => p.status === "authorized")).toHaveLength(1);
    expect(calls.some((c) => c.path === "/payments/pay_2/void")).toBe(false);
    const m = money();
    expect(m).toMatchObject({ authorised: 300, captured: 0, released: 0, open: 300 });
  });

  test("an unanswered hold that runs out sits the friend out and never takes a cent", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await drain(t);
    created = { status: "failed", substatus: "blocked" };
    expect((await pay(t, crew, "Maya")).ok).toBe(false);

    await advanceTo(t, (await frolicOf(t, crew)).startsAt! - 5 * 60 * 1000);

    expect((await shareOf(t, crew, "Maya")).status).toBe("waived");
    const m = money();
    expect(m).toMatchObject({ captured: 0, refundedHold: 0, charged: 0 });
  });
});

describe("someone chips in twice", () => {
  test("a second confirm for the same share never creates a second payment", async () => {
    const t = makeT();
    const crew = await paidCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await drain(t);
    created = { status: "paid", substatus: "succeeded" };
    const share = await shareOf(t, crew, "Maya");

    const [first, second] = await Promise.all([
      pay(t, crew, "Maya", "ctok_one"),
      pay(t, crew, "Maya", "ctok_two"),
    ]);
    expect([first.ok, second.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(pays).toHaveLength(1);
    expect(calls.filter((c) => c.method === "POST" && c.path === "/payments")).toHaveLength(1);
    const mine = pays.filter((p) => p.shareId === share._id);
    expect(mine.filter((p) => netOf(p) > 0).length).toBeLessThanOrEqual(1);
    expect(pays.reduce((s, p) => s + netOf(p), 0)).toBe(share.amountCents);
  });

  test("a duplicate payment that Whop already collected is refunded, never kept alongside the first", async () => {
    const t = makeT();
    const crew = await paidCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await drain(t);
    created = { status: "paid", substatus: "succeeded" };
    expect((await pay(t, crew, "Maya")).ok).toBe(true);
    const share = await shareOf(t, crew, "Maya");
    expect(share.status).toBe("paid");

    const duplicate = strayPayment(share, { status: "paid", substatus: "succeeded" });
    await webhook(t, "evt_dup", "payment.succeeded", {
      id: duplicate.id,
      status: "paid",
      substatus: "succeeded",
      metadata: { shareId: share._id },
    });
    await drain(t);

    expect(duplicate.refunded).toBe(true);
    expect(calls.some((c) => c.path === `/payments/${duplicate.id}/refund`)).toBe(true);
    expect((await shareOf(t, crew, "Maya")).status).toBe("paid");
    const mine = pays.filter((p) => p.shareId === share._id);
    expect(mine.reduce((s, p) => s + netOf(p), 0)).toBe(share.amountCents);
    expect(mine.filter((p) => netOf(p) > 0)).toHaveLength(1);
  });

  test("a chip in that lands after the plan is called off comes straight back", async () => {
    const t = makeT();
    const crew = await paidCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await drain(t);
    created = { status: "paid", substatus: "succeeded" };
    expect((await pay(t, crew, "Maya")).ok).toBe(true);

    const dev = await shareOf(t, crew, "Dev");
    const begun = await t.mutation(internal.whop.money.beginCharge, { token: dev.token! });
    expect(begun.ok).toBe(true);
    const inFlight = strayPayment(dev, { status: "pending", substatus: "pending" });

    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    await drain(t);
    expect((await shareOf(t, crew, "Maya")).status).toBe("refunded");

    inFlight.status = "paid";
    inFlight.substatus = "succeeded";
    await webhook(t, "evt_late", "payment.succeeded", {
      id: inFlight.id,
      status: "paid",
      substatus: "succeeded",
      metadata: { shareId: dev._id },
    });
    await drain(t);

    expect(inFlight.refunded).toBe(true);
    const m = await assertConserved(t, crew);
    expect(m).toMatchObject({ charged: 1300, refundedChip: 1300, kept: 0 });
    expect(pays.reduce((s, p) => s + netOf(p), 0)).toBe(0);
  });
});

describe("the split does not divide evenly by a cent", () => {
  test("the shares and the fund add up to the plan cost exactly, to the cent", async () => {
    const t = makeT();
    const crew = await paidCrew(t, ["Maya", "Dev", "Jordan"], 100);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Jordan");
    await flipDue(t);
    await drain(t);

    const shares = await sharesOf(t, crew.frolicId);
    expect(shares.map((s) => s.amountCents).sort()).toEqual([766, 767, 767]);
    expect(shares.reduce((s, x) => s + x.amountCents, 0) + 100).toBe(2400);

    created = { status: "paid", substatus: "succeeded" };
    for (const name of ["Maya", "Dev", "Jordan"]) expect((await pay(t, crew, name)).ok).toBe(true);

    const collected = pays.reduce((s, p) => s + netOf(p), 0);
    const rows = await ledgerRows(t, crew.groupId);
    const fund = rows.reduce((s, r) => s + r.amountCents, 0);
    expect(collected).toBe(2300);
    expect(collected + 100).toBe(2400);
    expect(fund).toBe(0);
    await assertConserved(t, crew);
  });

  test("the splitter never collects more than the plan costs", () => {
    for (const [per, people, fundCents] of [[800, 3, 100], [800, 2, 300], [999, 4, 3500], [300, 7, 1234]]) {
      const split = splitCost(per, people, fundCents, 100);
      expect(split.appliedCents + split.shares.reduce((a, b) => a + b, 0)).toBe(per * people);
    }
  });
});

describe("the plan expires with holds open", () => {
  test("every open hold is captured or released, and none is left hanging on a card", async () => {
    const t = makeT();
    const crew = await heldCrew(t, ["Maya", "Dev", "Jordan"], 30);
    expect((await pay(t, crew, "Maya")).ok).toBe(true);
    expect((await pay(t, crew, "Dev")).ok).toBe(true);
    expect(money().open).toBe(600);
    const start = (await frolicOf(t, crew)).startsAt!;

    await advanceTo(t, start + 31 * 60 * 1000);
    expect((await frolicOf(t, crew)).status).toBe("done");
    expect(money().open).toBe(600);

    await advanceTo(t, start + 46 * 60 * 1000);

    const m = await assertConserved(t, crew);
    expect(m).toMatchObject({ authorised: 600, captured: 600, open: 0 });
    expect((await shareOf(t, crew, "Maya")).status).toBe("forfeited");
    expect((await shareOf(t, crew, "Dev")).status).toBe("forfeited");
  });
});

describe("a webhook arrives twice or out of order", () => {
  test("a repeated event changes nothing and an out of order one cannot undo a capture", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    expect((await pay(t, crew, "Maya")).ok).toBe(true);
    const share = await shareOf(t, crew, "Maya");
    const paid = pays[0];
    paid.status = "paid";
    paid.substatus = "succeeded";
    paid.captured = true;

    const succeeded = { id: paid.id, status: "paid", substatus: "succeeded", amount_after_fees: { amount: "3.00" }, metadata: { shareId: share._id } };
    expect(await webhook(t, "evt_a", "payment.succeeded", succeeded)).toBe("applied");
    expect((await shareOf(t, crew, "Maya")).status).toBe("forfeited");
    expect(await webhook(t, "evt_a", "payment.succeeded", succeeded)).toBe("duplicate");
    expect(await webhook(t, "evt_b", "payment.succeeded", succeeded)).toBe("ignored");

    expect(
      await webhook(t, "evt_c", "payment.authorized", { id: paid.id, status: "authorized", substatus: "requires_capture", metadata: { shareId: share._id } }),
    ).toBe("ignored");
    expect((await shareOf(t, crew, "Maya")).status).toBe("forfeited");

    expect(await webhook(t, "evt_d", "payment.canceled", { id: paid.id, status: "void", substatus: "canceled" })).toBe("ignored");
    expect((await shareOf(t, crew, "Maya")).status).toBe("forfeited");
    expect((await ledgerRows(t, crew.groupId)).filter((r) => r.entry === "forfeit")).toHaveLength(1);
    await assertConserved(t, crew);
  });

  test("a release that arrives before the hold it releases leaves nothing held", async () => {
    const t = makeT();
    const crew = await heldCrew(t, ["Maya", "Dev"]);
    expect((await pay(t, crew, "Maya")).ok).toBe(true);
    const share = await shareOf(t, crew, "Maya");
    const held = pays[0];

    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    await drain(t);
    expect((await shareOf(t, crew, "Maya")).status).toBe("released");

    expect(await webhook(t, "evt_late_auth", "payment.authorized", { id: held.id, status: "authorized", substatus: "requires_capture", metadata: { shareId: share._id } })).toBe(
      "ignored",
    );
    expect((await shareOf(t, crew, "Maya")).status).toBe("released");
    const m = await assertConserved(t, crew);
    expect(m).toMatchObject({ authorised: 300, released: 300, open: 0 });
  });
});

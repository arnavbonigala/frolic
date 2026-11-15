import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DROP_BOOST, generatePlan, rankCandidates, validatePlan, type Attendee, type DropInput, type DropOffer } from "./plans/engine";
import { EMPTY_MEMORY } from "./plans/memoryContext";
import { localTimeToMs } from "./plans/time";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token, type Crew, type T } from "./tests/setup.helpers";

declare const process: { env: Record<string, string | undefined> };

const BASE = "https://sandbox-api.whop.com/api/v1";
const DAY = "2026-11-18";
const at = (hh: number, mm = 0) => localTimeToMs(DAY, hh * 60 + mm);

const person = (userId: string, over: Partial<Attendee> = {}): Attendee => ({
  userId,
  limits: { budgetCents: null, energy: "anything", maxMinutes: null, homeBy: null },
  origin: null,
  window: { start: at(15), end: at(23) },
  taste: [],
  ...over,
});

const kayaks = (over: Partial<DropOffer> = {}): DropOffer => ({
  dropId: "drop_kayaks",
  sellerName: "Cal Kayak Club",
  title: "Sunset kayaks",
  priceCents: 800,
  seatsLeft: 6,
  placeSlug: "berkeley-marina",
  tags: ["water", "sunsets", "outdoors"],
  validDays: [0, 1, 2, 3, 4, 5, 6],
  startMinute: 15 * 60,
  endMinute: 19 * 60,
  durationMinutes: 90,
  ...over,
});

const input = (taste: string[], over: Partial<DropInput> = {}): DropInput => ({
  day: DAY,
  kind: "daily",
  seed: "group1:" + DAY,
  nowMs: at(12),
  attendees: [person("maya", { taste }), person("dev", { taste })],
  weather: null,
  memory: EMPTY_MEMORY,
  history: [],
  lastFrolicDay: null,
  drops: [kayaks()],
  ...over,
});

const dropScoreGap = (i: DropInput) => {
  const ranked = rankCandidates(i).filter((c) => c.place.slug === "berkeley-marina");
  const hosted = ranked.find((c) => c.place.drop)!;
  const plain = ranked.find((c) => !c.place.drop)!;
  return hosted.score - plain.score;
};

describe("drops in the plan engine", () => {
  test("a drop that fits the crew's taste wins the plan and says who hosts it", () => {
    const i = input(["water", "sunsets"]);
    const plan = generatePlan(i)!;
    expect(plan.drop).toEqual({ dropId: "drop_kayaks", sellerName: "Cal Kayak Club", priceCents: 800 });
    expect(plan.title).toBe("Sunset kayaks");
    expect(plan.costLabel).toBe("$8");
    expect(plan.payUpFront).toBe(true);
    expect(plan.why).toBe("Cal Kayak Club has 6 seats at golden hour.");
    expect(validatePlan(plan, i)).toBe(true);
  });

  test("the boost only applies when the drop fits the crew's taste", () => {
    const gapWithTaste = dropScoreGap(input(["water"]));
    const gapWithout = dropScoreGap(input(["books"]));
    expect(gapWithTaste - gapWithout).toBeCloseTo(DROP_BOOST, 5);
  });

  test("a drop over someone's budget never becomes a candidate", () => {
    const i = input(["water"], { attendees: [person("maya", { taste: ["water"] }), person("dev", { limits: { budgetCents: 500, energy: "anything", maxMinutes: null, homeBy: null } })] });
    expect(rankCandidates(i).some((c) => c.place.drop)).toBe(false);
  });

  test("a sold out drop or one outside its days is skipped", () => {
    expect(rankCandidates(input(["water"], { drops: [kayaks({ seatsLeft: 1 })] })).some((c) => c.place.drop)).toBe(false);
    expect(rankCandidates(input(["water"], { drops: [kayaks({ validDays: [] })] })).some((c) => c.place.drop)).toBe(false);
  });

  test("a plain day without drops plans the same as before", () => {
    const plan = generatePlan(input(["water"], { drops: [] }))!;
    expect(plan.drop).toBeNull();
  });
});

type Call = { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let products: { id: string; title: string; metadata: Record<string, unknown> }[] = [];
let variants: { id: string; sku: string; purchase_url: string }[] = [];
let paymentStatus = { status: "paid", substatus: "succeeded" };
let seq = 0;

async function fakeFetch(input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Response> {
  const url = new URL(input);
  const path = input.slice(BASE.length).split("?")[0];
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
  calls.push({ method, path, headers: { ...(init?.headers ?? {}) }, body });
  const reply = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  if (path === "/products" && method === "GET") {
    const q = url.searchParams.get("query") ?? "";
    return reply({ data: products.filter((p) => p.title.includes(q)) });
  }
  if (path === "/products" && method === "POST") {
    const p = { id: `prod_${++seq}`, title: body!.title as string, metadata: body!.metadata as Record<string, unknown> };
    products.push(p);
    return reply(p);
  }
  if (path === "/variants" && method === "GET") return reply({ data: variants.filter((v) => v.sku === url.searchParams.get("sku")) });
  if (path === "/variants" && method === "POST") {
    const v = { id: `plan_${++seq}`, sku: body!.sku as string, purchase_url: `https://sandbox.whop.com/checkout/plan_${seq}` };
    variants.push(v);
    return reply(v);
  }
  if (path === "/payments" && method === "POST") return reply({ id: `pay_${++seq}`, ...paymentStatus, client_secret: "cs" });
  if (path.startsWith("/payments/")) return reply({ id: path.split("/")[2], ...paymentStatus });
  return new Response("{}", { status: 404 });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  process.env.WHOP_SANDBOX_API_KEY = "test";
  process.env.WHOP_API_BASE = BASE;
  process.env.WHOP_ACCOUNT_ID = "biz_test";
  process.env.WHOP_PLANS_PRODUCT_ID = "prod_frolic_plans";
  process.env.CONVEX_SITE_URL = "https://frolic.convex.site";
  calls = [];
  products = [];
  variants = [];
  paymentStatus = { status: "paid", substatus: "succeeded" };
  seq = 0;
  vi.stubGlobal("fetch", fakeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const posts = () => calls.filter((c) => c.method === "POST");

describe("seeding drops in the Whop sandbox", () => {
  test("creates three visible products with a visible variant each and stores the ids", async () => {
    const t = makeT();
    const out = await t.action(internal.drops.seed, {});
    expect(out.map((d) => d.created)).toEqual([true, true, true]);
    const productPosts = posts().filter((c) => c.path === "/products");
    expect(productPosts.map((c) => c.body!.title)).toEqual(["Sunset kayaks", "Late-night ramen flight", "Board game night"]);
    expect(productPosts.every((c) => c.body!.visibility === "visible")).toBe(true);
    const variantPosts = posts().filter((c) => c.path === "/variants");
    expect(variantPosts.map((c) => c.body!.initial_price)).toEqual([8, 12, 5]);
    expect(variantPosts.every((c) => c.body!.visibility === "visible" && c.body!.billing_type === "one_time")).toBe(true);
    expect(posts().every((c) => c.headers["Idempotency-Key"])).toBe(true);
    const rows = await t.run(async (ctx) => await ctx.db.query("drops").take(10));
    expect(rows.map((r) => [r.sellerName, r.priceCents, r.active, r.whopProductId?.startsWith("prod_"), r.whopPlanId?.startsWith("plan_")])).toEqual([
      ["Cal Kayak Club", 800, true, true, true],
      ["Ippudo Berkeley", 1200, true, true, true],
      ["The Game Table", 500, true, true, true],
    ]);
  });

  test("running it again creates nothing new", async () => {
    const t = makeT();
    const first = await t.action(internal.drops.seed, {});
    const before = posts().length;
    const second = await t.action(internal.drops.seed, {});
    expect(posts().length).toBe(before);
    expect(second.map((d) => d.created)).toEqual([false, false, false]);
    expect(second.map((d) => d.dropId)).toEqual(first.map((d) => d.dropId));
    expect(await t.run(async (ctx) => (await ctx.db.query("drops").take(10)).length)).toBe(3);
  });

  test("finds the products already in Whop when the table was wiped", async () => {
    const t = makeT();
    const first = await t.action(internal.drops.seed, {});
    await t.run(async (ctx) => {
      for (const d of await ctx.db.query("drops").take(10)) await ctx.db.delete("drops", d._id);
    });
    const before = posts().length;
    const again = await t.action(internal.drops.seed, {});
    expect(posts().length).toBe(before);
    expect(again.map((d) => d.productId)).toEqual(first.map((d) => d.productId));
    expect(again.map((d) => d.planId)).toEqual(first.map((d) => d.planId));
  });
});

async function dropCrew(t: T, fundCents: number) {
  const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
  const dropId = await t.run(
    async (ctx) =>
      await ctx.db.insert("drops", {
        key: "cal-kayak-sunset",
        sellerName: "Cal Kayak Club",
        title: "Sunset kayaks",
        priceCents: 800,
        capacity: 12,
        placeSlug: "berkeley-marina",
        tags: ["water"],
        imageKey: "plan-sunsets",
        active: true,
        validDays: [0, 1, 2, 3, 4, 5, 6],
        startMinute: 900,
        endMinute: 1140,
        durationMinutes: 90,
        whopProductId: "prod_kayaks",
        whopPlanId: "plan_kayaks",
      }),
  );
  await t.run(async (ctx) => {
    const placeId = await ctx.db.insert("places", {
      slug: "berkeley-marina",
      name: "the Marina",
      lat: 37.86,
      lng: -122.31,
      cost: 0,
      tags: [],
      hours: [],
      indoor: false,
      sober: true,
      title: "The Marina at dusk",
      address: "201 University Ave",
      costPerPersonCents: 0,
      costLabel: "Free",
      payUpFront: false,
      priceVerified: true,
      energy: "chill",
      needsDaylight: false,
      durationMinutes: 60,
      meetSpot: "The end of University Ave",
      source: "seed",
    });
    const planId = await ctx.db.insert("plans", {
      groupId: crew.groupId,
      day: "2026-11-15",
      kind: "daily",
      placeId,
      title: "Sunset kayaks",
      line: "Golden hour on the water",
      why: "Cal Kayak Club has 6 seats at golden hour.",
      cost: 8,
      startsAt: NOON + HOUR,
      durationMinutes: 90,
      source: "scorer",
      generatedAt: NOON,
      costLabel: "$8",
      payUpFront: true,
      chips: [],
      whySource: "template",
      whyInputs: { placeName: "the Marina", topTags: [], rainSwap: false },
      weatherSwap: false,
      dropId,
    });
    await ctx.db.patch("frolics", crew.frolicId, { planId });
    if (fundCents) await ctx.db.insert("fundLedger", { groupId: crew.groupId, entry: "deposit", amountCents: fundCents, at: NOON });
  });
  await tap(t, crew, "Maya");
  await tap(t, crew, "Dev");
  await flipDue(t);
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
  return { crew, dropId };
}

async function shareOf(t: T, crew: Crew, name: string) {
  return (await t.run(
    async (ctx) =>
      await ctx.db
        .query("shares")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", crew.frolicId).eq("userId", crew.ids[name]))
        .unique(),
  ))!;
}

describe("paying for a drop", () => {
  test("a full share is charged against the seller's own Whop variant", async () => {
    const t = makeT();
    const { crew, dropId } = await dropCrew(t, 0);
    const share = await shareOf(t, crew, "Maya");
    expect(share.kind).toBe("chipIn");
    expect(share.amountCents).toBe(800);
    const out = await t.action(internal.whop.actions.charge, { token: share.token!, confirmationToken: "ctok_maya" });
    expect(out.ok).toBe(true);
    const pay = posts().find((c) => c.path === "/payments")!;
    expect(pay.body!.variant_id).toBe("plan_kayaks");
    expect(pay.body!.variant).toBeUndefined();
    expect(pay.body!.capture).toBe(true);
    expect((pay.body!.metadata as Record<string, unknown>).dropId).toBe(dropId);
    expect((await shareOf(t, crew, "Maya")).status).toBe("paid");
  });

  test("with the Frolic Fund applied first, the smaller share still lands on the seller's product", async () => {
    const t = makeT();
    const { crew } = await dropCrew(t, 300);
    const share = await shareOf(t, crew, "Dev");
    expect(share.amountCents).toBe(650);
    await t.action(internal.whop.actions.charge, { token: share.token!, confirmationToken: "ctok_dev" });
    const pay = posts().find((c) => c.path === "/payments")!;
    expect(pay.body!.variant_id).toBeUndefined();
    const variant = pay.body!.variant as Record<string, unknown>;
    expect(variant.product_id).toBe("prod_kayaks");
    expect(variant.initial_price).toBe(6.5);
  });

  test("the plan card reads who hosts it and how many seats are left", async () => {
    const t = makeT();
    const { crew } = await dropCrew(t, 0);
    const view = await t.query(api.drops.forPlan, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    expect(view).toMatchObject({ sellerName: "Cal Kayak Club", hostedBy: "Hosted by Cal Kayak Club", title: "Sunset kayaks", priceCents: 800, priceLabel: "$8", seatsLeft: 10 });
  });

  test("the plan card refuses someone outside the crew", async () => {
    const t = makeT();
    const { crew } = await dropCrew(t, 0);
    const other = await setupCrew(t, ["Priya"]);
    expect(other.groupId).not.toBe(crew.groupId);
    await expect(t.query(api.drops.forPlan, { deviceToken: token("Priya"), frolicId: crew.frolicId })).rejects.toThrow();
  });
});

describe("the drop step reads live offers", () => {
  test("offers count seats taken by crews already going", async () => {
    const t = makeT();
    const { dropId } = await dropCrew(t, 0);
    const offers = await t.query(internal.drops.offers, { day: "2026-11-15" });
    expect(offers).toEqual([expect.objectContaining({ dropId, seatsLeft: 10, sellerName: "Cal Kayak Club" })]);
    const other = await t.query(internal.drops.offers, { day: "2026-11-16" });
    expect(other[0].seatsLeft).toBe(12);
  });

  test("drops without Whop ids are never offered", async () => {
    const t = makeT();
    await t.run(async (ctx) => {
      await ctx.db.insert("drops", {
        key: "x",
        sellerName: "X",
        title: "X",
        priceCents: 500,
        capacity: 4,
        placeSlug: "ippudo",
        tags: [],
        imageKey: "plan-games",
        active: true,
        validDays: [],
        startMinute: 0,
        endMinute: 60,
        durationMinutes: 60,
      });
    });
    expect(await t.query(internal.drops.offers, { day: DAY })).toEqual([]);
  });

  test("the pick step plans a seeded drop and keeps its id", async () => {
    const t = makeT();
    await t.action(internal.drops.seed, {});
    const kayakId: Id<"drops"> = (await t.run(async (ctx) => await ctx.db.query("drops").withIndex("by_key", (q) => q.eq("key", "cal-kayak-sunset")).unique()))!._id;
    const groupId = (await setupCrew(t, ["Maya", "Dev"])).groupId;
    const plan = await t.action(internal.plans.drop.pickStep, {
      groupId,
      day: DAY,
      kind: "daily",
      inputs: {
        nowMs: at(12),
        attendees: [
          { ...person("maya", { taste: ["water", "sunsets"] }), origin: null },
          { ...person("dev", { taste: ["water"] }), origin: null },
        ],
        history: [],
        lastFrolicDay: null,
      },
      weather: null,
      memory: EMPTY_MEMORY,
    });
    expect(plan?.dropId).toBe(kayakId);
    expect(plan?.cost).toBe(8);
    expect(plan?.why).toBe("Cal Kayak Club has 12 seats at golden hour.");
  });
});

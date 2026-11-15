/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { healthFor, milestoneFor, varietyOf } from "../../convex/garden";
import { NOON, makeT, setupCrew, token, type Crew, type T } from "./setup.helpers";

const TODAY = "2026-11-15";
const NAMES = ["Maya", "Dev", "Jordan"];
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function plant(
  t: T,
  crew: Crew,
  day: string,
  opts: { tags?: string[]; drop?: boolean; going?: string[]; cost?: number; upcoming?: boolean } = {},
): Promise<Id<"frolics">> {
  return await t.run(async (ctx) => {
    const placeId = await ctx.db.insert("places", {
      slug: `place-${day}-${Math.random()}`,
      name: "A spot",
      lat: 37.87,
      lng: -122.27,
      cost: opts.cost ?? 5,
      tags: opts.tags ?? [],
      hours: [],
      indoor: false,
      sober: true,
      title: "A spot",
      address: "Berkeley",
      costPerPersonCents: (opts.cost ?? 5) * 100,
      costLabel: "$5",
      payUpFront: false,
      priceVerified: true,
      energy: "chill",
      needsDaylight: false,
      durationMinutes: 60,
      meetSpot: "Front",
      source: "seed",
    });
    const dropId = opts.drop
      ? await ctx.db.insert("drops", {
          key: `drop-${day}`,
          sellerName: "Seller",
          title: "Pottery night",
          priceCents: 2000,
          capacity: 6,
          placeSlug: "a-spot",
          tags: [],
          imageKey: "pottery",
          active: true,
          validDays: [0, 1, 2, 3, 4, 5, 6],
          startMinute: 1080,
          endMinute: 1260,
          durationMinutes: 90,
        })
      : undefined;
    const planId = await ctx.db.insert("plans", {
      groupId: crew.groupId,
      day,
      kind: "daily",
      placeId,
      title: `Plan for ${day}`,
      line: "A line",
      why: "A why",
      cost: opts.cost ?? 5,
      startsAt: NOON,
      durationMinutes: 60,
      meetingPoint: { lat: 37.87, lng: -122.27, label: "Front" },
      source: "model",
      generatedAt: NOON,
      costLabel: "$5",
      payUpFront: false,
      chips: [],
      whySource: "template",
      whyInputs: { placeName: "A spot", topTags: [], rainSwap: false },
      weatherSwap: false,
      dropId,
    });
    const frolicId = await ctx.db.insert("frolics", {
      groupId: crew.groupId,
      day,
      kind: "daily",
      planId,
      status: opts.upcoming ? "on" : "done",
      ...(opts.upcoming ? { startsAt: NOON + 2 * 60 * 60 * 1000, endsAt: NOON + 3 * 60 * 60 * 1000 } : {}),
      window: { start: NOON, end: NOON + 1 },
      durationMinutes: 60,
      deadline: NOON,
    });
    for (const name of opts.going ?? ["Maya", "Dev"]) {
      await ctx.db.insert("attendees", {
        frolicId,
        groupId: crew.groupId,
        userId: crew.ids[name],
        role: "matched",
        status: "going",
        revealAt: NOON,
        bloomAt: NOON,
      });
    }
    return frolicId;
  });
}

async function checkIn(t: T, crew: Crew, frolicId: Id<"frolics">, name: string) {
  await t.run(async (ctx) =>
    ctx.db.insert("checkins", { frolicId, userId: crew.ids[name], method: "manual", at: Date.now() }),
  );
}

async function overview(t: T, crew: Crew, name = "Maya", day = TODAY) {
  return await t.query(api.garden.overview, { deviceToken: token(name), groupId: crew.groupId, day });
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("garden health", () => {
  test("thresholds", () => {
    const states = [0, 1, 2, 3, 4, 5, 6, 7, 8, 30].map((d) => healthFor(d, 1).state);
    expect(states).toEqual([
      "thriving", "thriving", "thriving", "fine", "fine", "thirsty", "thirsty", "thirsty", "wilting", "wilting",
    ]);
    expect(healthFor(2, 1)).toEqual({ state: "thriving", daysSince: 2, line: "Your garden is thriving", cta: null });
    expect(healthFor(5, 1)).toMatchObject({ line: "Your garden is getting thirsty. Anyone free?", cta: "imFree" });
    expect(healthFor(9, 1)).toMatchObject({ line: "The flowers are resting. They never wilt for good.", cta: "imFree" });
    expect(healthFor(3, 1).cta).toBeNull();
  });

  test("derived from the crew's last frolic with two or more going", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await plant(t, crew, "2026-11-09");
    await plant(t, crew, "2026-11-14", { going: ["Maya"] });
    const view = await overview(t, crew);
    expect(view.health).toMatchObject({ state: "thirsty", daysSince: 6, cta: "imFree" });
    await plant(t, crew, "2026-11-13");
    expect((await overview(t, crew)).health).toMatchObject({ state: "thriving", daysSince: 2, cta: null });
    expect((await overview(t, crew, "Maya", "2026-11-21")).health).toMatchObject({ state: "wilting", daysSince: 8 });
  });

  test("a new crew with no frolics is not told it is wilting", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    const view = await overview(t, crew);
    expect(view.health).toEqual({ state: "thriving", daysSince: 0, line: "Your first frolic plants the first flower", cta: null, todayWatered: false });
    expect(view.collection.flowers).toEqual([]);
  });
});

describe("collection and milestones", () => {
  test("each category unlocks its variety, and a paid drop gives the rare ranunculus", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    const sunset = await plant(t, crew, "2026-11-10", { tags: ["sunsets", "outdoors"] });
    await plant(t, crew, "2026-11-11", { tags: ["games"] });
    await plant(t, crew, "2026-11-12", { tags: ["games"] });
    const drop = await plant(t, crew, "2026-11-13", { tags: ["sunsets"], drop: true });
    await plant(t, crew, "2026-11-14", { tags: ["late_night_food"], going: ["Maya"] });
    const view = await overview(t, crew);
    const byKey = Object.fromEntries(view.collection.varieties.map((x) => [x.key, x]));
    expect(view.collection.varieties.map((x) => x.key)).toEqual([
      "goldenPoppy", "wildLupine", "nightJasmine", "sweetPea", "daisy", "ranunculus",
    ]);
    expect(byKey.goldenPoppy).toEqual({ key: "goldenPoppy", name: "Golden poppy", count: 1, unlocked: true, hint: null });
    expect(byKey.sweetPea).toMatchObject({ count: 2, unlocked: true });
    expect(byKey.ranunculus).toMatchObject({ count: 1, unlocked: true, hint: null });
    expect(byKey.nightJasmine).toEqual({
      key: "nightJasmine", name: "Night jasmine", count: 0, unlocked: false, hint: "Grab late-night food together",
    });
    expect(byKey.wildLupine).toMatchObject({ unlocked: false, hint: "Get outside together" });
    expect(view.collection.flowers).toHaveLength(4);
    expect(view.collection.flowers.find((f) => f.frolicId === drop)?.variety).toBe("ranunculus");
    expect(view.collection.flowers.find((f) => f.frolicId === sunset)?.variety).toBe("goldenPoppy");
    expect(view.milestone).toEqual({ reached: "bench", next: "path", nextAt: 10, line: "10 frolics: the garden gets a winding path" });
  });

  test("a sunset place unlocks the golden poppy, singular or plural", () => {
    const place = (tags: string[]) => ({ tags }) as never;
    const plan = (cost: number) => ({ cost }) as never;
    expect(varietyOf({ plan: plan(0), place: place(["sunset", "views", "outdoors"]) })).toBe("goldenPoppy");
    expect(varietyOf({ plan: plan(0), place: place(["sunsets", "views", "outdoors"]) })).toBe("goldenPoppy");
  });

  test("varieties for the other categories", () => {
    const place = (tags: string[]) => ({ tags }) as never;
    const plan = (cost: number) => ({ cost }) as never;
    expect(varietyOf({ plan: plan(5), place: place(["hiking"]) })).toBe("wildLupine");
    expect(varietyOf({ plan: plan(5), place: place(["free"]) })).toBe("daisy");
    expect(varietyOf({ plan: plan(0), place: place(["coffee"]) })).toBe("daisy");
    expect(varietyOf({ plan: plan(5), place: place(["coffee"]) })).toBeNull();
    expect(varietyOf({ plan: null, place: null })).toBeNull();
  });

  test("milestones at 3, 10 and 25", () => {
    expect(milestoneFor(0)).toEqual({ reached: null, next: "bench", nextAt: 3, line: "3 frolics: the garden gets a bench" });
    expect(milestoneFor(2).reached).toBeNull();
    expect(milestoneFor(3)).toMatchObject({ reached: "bench", next: "path", nextAt: 10 });
    expect(milestoneFor(10)).toMatchObject({ reached: "path", next: "lights", nextAt: 25 });
    expect(milestoneFor(25)).toEqual({
      reached: "lights", next: null, nextAt: null, line: "The garden has a bench, a winding path and string lights",
    });
  });
});

describe("on this day", () => {
  test("a frolic from a week ago comes back, then a month ago, else nothing", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    const args = { deviceToken: token("Jordan"), groupId: crew.groupId, day: TODAY };
    expect(await t.query(api.garden.onThisDay, args)).toBeNull();
    const month = await plant(t, crew, "2026-10-16", { tags: ["sunsets"] });
    expect(await t.query(api.garden.onThisDay, args)).toEqual({
      frolicId: month, daysAgo: 30, label: "1 month ago today", title: "Plan for 2026-10-16", heroKey: expect.any(String), photoUrl: null,
    });
    const week = await plant(t, crew, "2026-11-08");
    expect(await t.query(api.garden.onThisDay, args)).toMatchObject({ frolicId: week, daysAgo: 7, label: "1 week ago today" });
    await plant(t, crew, "2026-11-09");
    expect((await t.query(api.garden.onThisDay, { ...args, day: "2026-11-16" }))?.daysAgo).toBe(7);
    expect(await t.query(api.garden.onThisDay, { ...args, day: "2026-11-20" })).toBeNull();
  });

  test("a stranger is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(
      t.query(api.garden.onThisDay, { deviceToken: token("Eve"), groupId: crew.groupId }),
    ).rejects.toThrow(/not in this crew/);
    await expect(t.query(api.garden.nudge, { deviceToken: token("Eve"), groupId: crew.groupId })).rejects.toThrow(
      /not in this crew/,
    );
  });
});

describe("garden nudge", () => {
  async function link(t: T, crew: Crew, name: string, paused = false) {
    await t.run(async (ctx) => {
      await ctx.db.insert("keikiLinks", { phone: `+1510555${name.length}${name.charCodeAt(0)}`, userId: crew.ids[name], paused, linkedAt: NOON });
    });
  }
  const outbox = (t: T) => t.run(async (ctx) => await ctx.db.query("keikiOutbox").collect());

  test("one gentle nudge per thirsty streak, to linked texters and the app, never paused ones", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await link(t, crew, "Maya");
    await link(t, crew, "Dev", true);
    const crew2 = await setupCrew(t, ["Ana", "Sam"]);
    await plant(t, crew, "2026-11-12");
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(false);

    vi.setSystemTime(NOON + 2 * DAY);
    expect(await t.query(api.garden.nudge, { deviceToken: token("Jordan"), groupId: crew.groupId })).toBeNull();
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(true);
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(false);
    vi.setSystemTime(NOON + 3 * DAY);
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(false);
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew2.groupId })).toBe(false);

    const rows = await outbox(t);
    expect(rows).toHaveLength(2);
    const maya = rows.find((r) => r.userId === crew.ids.Maya)!;
    expect(maya).toMatchObject({ kind: "nudge", status: "queued", text: "Your garden's getting thirsty. Anyone free tonight?" });
    expect(rows.find((r) => r.userId === crew.ids.Dev)?.status).toBe("skipped");

    const inApp = await t.query(api.garden.nudge, { deviceToken: token("Jordan"), groupId: crew.groupId });
    expect(inApp).toEqual({ line: "Your garden's getting thirsty. Anyone free tonight?", cta: "imFree", sentAt: NOON + 2 * DAY });

    await plant(t, crew, "2026-11-18");
    expect(await t.query(api.garden.nudge, { deviceToken: token("Jordan"), groupId: crew.groupId })).toBeNull();
    vi.setSystemTime(NOON + 8 * DAY);
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(true);
    expect(await outbox(t)).toHaveLength(4);
  });

  test("the cron only nudges crews where it is 5pm", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await plant(t, crew, "2026-11-09");
    await t.mutation(internal.garden.nudgeCrews, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(async (ctx) => await ctx.db.query("gardenNudges").collect())).toHaveLength(0);
    vi.setSystemTime(Date.UTC(2026, 10, 16, 1, 5, 0));
    await t.mutation(internal.garden.nudgeCrews, {});
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    const sent = await t.run(async (ctx) => await ctx.db.query("gardenNudges").collect());
    expect(sent.map((s) => s.groupId)).toEqual([crew.groupId]);
  });

  test("garden copy names nobody and stays calm", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await plant(t, crew, "2026-11-09", { going: ["Maya", "Dev", "Jordan"] });
    await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId });
    const view = await overview(t, crew);
    const copy = [
      ...strings(view.health),
      ...strings(view.collection),
      ...strings(view.milestone),
      ...strings(await t.query(api.garden.nudge, { deviceToken: token("Maya"), groupId: crew.groupId })),
      ...[0, 3, 5, 8].map((d) => healthFor(d, 1).line),
      ...[0, 3, 10, 25].map((n) => milestoneFor(n).line),
    ];
    expect(copy.length).toBeGreaterThan(10);
    for (const line of copy) {
      for (const name of NAMES) expect(line).not.toContain(name);
      expect(line).not.toMatch(/[—!]/);
    }
  });
});

describe("only frolics that happened count", () => {
  test("today's matched plan counts nowhere until someone checks in", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    const today = await plant(t, crew, TODAY, { tags: ["sunset"], upcoming: true });
    const before = await overview(t, crew);
    expect(before.youWent).toBe(false);
    expect(before.count).toBe(0);
    expect(before.yourCount).toBe(0);
    expect(before.memories).toEqual([]);
    expect(before.collection.flowers).toEqual([]);
    expect(before.collection.varieties.every((x) => x.count === 0)).toBe(true);
    expect(before.milestone.reached).toBeNull();
    expect(before.health.line).toBe("Your first frolic plants the first flower");
    const crewBefore = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: TODAY });
    expect(crewBefore.members.every((m) => m.together.count === 0)).toBe(true);

    await checkIn(t, crew, today, "Dev");
    const after = await overview(t, crew);
    expect(after.youWent).toBe(true);
    expect(after.count).toBe(1);
    expect(after.yourCount).toBe(1);
    expect(after.collection.flowers).toEqual([{ frolicId: today, variety: "goldenPoppy" }]);
    expect(after.health.line).toBe("Your garden is thriving");
  });

  test("a plan whose end has passed counts without a check-in", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await plant(t, crew, TODAY, { upcoming: true });
    expect((await overview(t, crew)).yourCount).toBe(0);
    vi.setSystemTime(NOON + 3 * 60 * 60 * 1000);
    const later = await overview(t, crew);
    expect(later.yourCount).toBe(1);
    expect(later.collection.flowers).toHaveLength(1);
  });

  test("each friend carries how many frolics you went on together", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await plant(t, crew, "2026-11-12", { going: ["Maya", "Dev"] });
    await plant(t, crew, "2026-11-13", { going: ["Maya", "Dev", "Jordan"] });
    await plant(t, crew, "2026-11-14", { going: ["Dev", "Jordan"] });
    await plant(t, crew, TODAY, { going: ["Maya", "Jordan"], upcoming: true });
    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: TODAY });
    const byName = Object.fromEntries(view.members.map((m) => [m.name, m.together]));
    expect(byName.Dev).toEqual({ count: 2, lastPlace: "A spot", lastDateLine: "Nov 13" });
    expect(byName.Jordan).toEqual({ count: 1, lastPlace: "A spot", lastDateLine: "Nov 13" });
    expect(byName.Maya.count).toBe(2);
    expect((await overview(t, crew)).yourCount).toBe(2);
    const jordan = await t.query(api.crew.crew, { deviceToken: token("Jordan"), groupId: crew.groupId, day: TODAY });
    expect(jordan.members.find((m) => m.name === "Maya")?.together.count).toBe(1);
  });
});

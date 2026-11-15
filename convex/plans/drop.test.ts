import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { PLACE_BY_SLUG } from "../places/data";
import { makeT } from "../tests/setup.helpers";
import { EMPTY_MEMORY } from "./memoryContext";
import { addDays, localTimeToMs, solarTimes } from "./time";

const DAY = "2026-11-15";
const NOON = localTimeToMs(DAY, 12 * 60);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function crew(names: string[] = ["Maya", "Dev"], days: string[] = [DAY]) {
  const t = makeT();
  await t.mutation(internal.places.seed.seedPlaces, {});
  const groupId = await t.run(async (ctx) => {
    const createdBy = await ctx.db.insert("users", { name: names[0], source: "app" });
    const groupId = await ctx.db.insert("groups", { name: "Sunset Crew", createdBy, timezone: "America/Los_Angeles" });
    for (const name of names) {
      const userId = await ctx.db.insert("users", { name, source: "app" });
      await ctx.db.insert("memberships", { groupId, userId, color: "cobalt", joinedVia: "invite" });
      for (const day of days) {
        await ctx.db.insert("availability", { groupId, userId, day, state: "now", updatedAt: NOON });
      }
    }
    return groupId;
  });
  return { t, groupId };
}

const storedPlan = (overrides: Partial<{ placeSlug: string; startsAt: number; source: "model" | "scorer" | "fallback" }> = {}) => ({
  placeSlug: overrides.placeSlug ?? "rose-garden",
  title: "Golden hour at Cragmont Rock",
  line: "Clear and 62 degrees. Sunset at 5:01.",
  why: "it's free and it looks straight at the Golden Gate.",
  whySource: "template" as const,
  whyInputs: {
    placeName: "Cragmont Rock Park",
    memory: null,
    topTags: ["sunsets"],
    weather: "Clear, 62 degrees",
    tempF: 62,
    sunsetAt: NOON,
    rainSwap: false,
  },
  chips: ["Free", "12 min walk", "Golden hour 4:31"],
  cost: 0,
  costLabel: "Free",
  payUpFront: false,
  startsAt: overrides.startsAt ?? localTimeToMs(DAY, 17 * 60),
  durationMinutes: 60,
  meetingPoint: { lat: 37.8932, lng: -122.2649, label: "The lookout at the top of the stairs" },
  sunsetAt: NOON,
  weather: "Clear, 62 degrees",
  weatherSwap: false,
  favoredUserId: null,
  source: overrides.source ?? ("scorer" as const),
});

const plans = async (t: ReturnType<typeof makeT>, groupId: Id<"groups">) =>
  await t.run(async (ctx) => await ctx.db.query("plans").take(10));

describe("writePlan", () => {
  test("writes once per group day and kind", async () => {
    const { t, groupId } = await crew();
    const first = await t.mutation(internal.plans.drop.writePlan, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: storedPlan(),
    });
    expect(first).not.toBeNull();
    const second = await t.mutation(internal.plans.drop.writePlan, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: storedPlan({ placeSlug: "live-oak-park" }),
    });
    expect(second).toEqual(first);
    const rows = await plans(t, groupId);
    expect(rows).toHaveLength(1);
    expect(rows[0].placeId).toBe((await t.run(async (ctx) => (await ctx.db.query("places").withIndex("by_slug", (q) => q.eq("slug", "rose-garden")).unique())!._id)));
  });

  test("returns null when the place is not seeded", async () => {
    const { t, groupId } = await crew();
    const id = await t.mutation(internal.plans.drop.writePlan, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: storedPlan({ placeSlug: "not-a-place" }),
    });
    expect(id).toBeNull();
    expect(await plans(t, groupId)).toHaveLength(0);
  });
});

describe("pickStep", () => {
  test("still returns a plan with no weather", async () => {
    const { t, groupId } = await crew();
    const inputs = await t.query(internal.plans.inputs.dropInputs, { groupId, day: DAY, nowMs: NOON });
    const plan = await t.action(internal.plans.drop.pickStep, {
      groupId,
      day: DAY,
      kind: "daily",
      inputs,
      weather: null,
      memory: EMPTY_MEMORY,
    });
    expect(plan).not.toBeNull();
    expect(PLACE_BY_SLUG.has(plan!.placeSlug)).toBe(true);
    expect(plan!.startsAt).toBeGreaterThanOrEqual(NOON);
    expect(plan!.startsAt).toBeLessThan(localTimeToMs(addDays(DAY, 1), 0));
    expect(["scorer", "model", "fallback"]).toContain(plan!.source);
  });

  test("returns null when nobody is free", async () => {
    const { t, groupId } = await crew();
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("availability").take(10)) await ctx.db.delete("availability", row._id);
    });
    const inputs = await t.query(internal.plans.inputs.dropInputs, { groupId, day: DAY, nowMs: NOON });
    const plan = await t.action(internal.plans.drop.pickStep, {
      groupId,
      day: DAY,
      kind: "daily",
      inputs,
      weather: null,
      memory: EMPTY_MEMORY,
    });
    expect(plan).toBeNull();
  });
});

describe("drop workflow", () => {
  test("writes exactly one plan whose place is a seeded place", async () => {
    const { t, groupId } = await crew();
    const workflowId = await t.mutation(internal.plans.drop.startDrop, { groupId, day: DAY, kind: "daily" });
    expect(workflowId).not.toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await plans(t, groupId);
    expect(rows).toHaveLength(1);
    const place = await t.run(async (ctx) => await ctx.db.get("places", rows[0].placeId));
    expect(place?.slug).toBeDefined();
    expect(PLACE_BY_SLUG.has(place!.slug)).toBe(true);
    expect(rows[0].kind).toBe("daily");
    expect(rows[0].day).toBe(DAY);
  });

  test("a second start does not start another drop for the day", async () => {
    const { t, groupId } = await crew();
    await t.mutation(internal.plans.drop.startDrop, { groupId, day: DAY, kind: "daily" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const again = await t.mutation(internal.plans.drop.startDrop, { groupId, day: DAY, kind: "daily" });
    expect(again).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await plans(t, groupId)).toHaveLength(1);
  });

  test("daily drop starts a plan for every group", async () => {
    const { t, groupId } = await crew();
    const started = await t.mutation(internal.plans.drop.dailyDrop, {});
    expect(started.started).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await plans(t, groupId);
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toBe(DAY);
  });

  test("weekend drop plans the coming saturday and sunday", async () => {
    const { t, groupId } = await crew(["Maya", "Dev"], [DAY, "2026-11-21", "2026-11-22"]);
    const started = await t.mutation(internal.plans.drop.weekendDrop, {});
    expect(started.started).toBe(2);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await plans(t, groupId);
    expect(rows.map((row) => row.kind)).toEqual(["weekend", "weekend"]);
    expect(rows.map((row) => row.day).sort()).toEqual(["2026-11-21", "2026-11-22"]);
  });
});

describe("weather swap", () => {
  const rainy = (day: string) => {
    const sun = solarTimes(day);
    const hours = Array.from({ length: 24 }, (_, i) => localTimeToMs(day, i * 60) / 1000);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        hourly: {
          time: hours,
          temperature_2m: hours.map(() => 58),
          precipitation_probability: hours.map(() => 90),
          weather_code: hours.map(() => 63),
          cloud_cover: hours.map(() => 95),
        },
        daily: { sunrise: [sun.sunriseMs / 1000], sunset: [sun.sunsetMs / 1000] },
      }),
    };
  };

  test("regenerates indoors and patches the plan when rain lands on an outdoor slot", async () => {
    const { t, groupId } = await crew();
    const outdoor = storedPlan({ placeSlug: "indian-rock", startsAt: localTimeToMs(DAY, 17 * 60) });
    vi.stubGlobal("fetch", vi.fn(async () => rainy(DAY)));
    await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind: "daily", plan: outdoor });
    const swapped = await t.action(internal.plans.drop.weatherSwapStep, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: outdoor,
    });
    expect(swapped).not.toBeNull();
    expect(swapped!.placeSlug).not.toBe("indian-rock");
    expect(PLACE_BY_SLUG.get(swapped!.placeSlug)?.indoor).toBe(true);
    const rows = await plans(t, groupId);
    expect(rows).toHaveLength(1);
    const place = await t.run(async (ctx) => await ctx.db.get("places", rows[0].placeId));
    expect(place?.slug).toBe(swapped!.placeSlug);
    expect(rows[0].weatherCheckedAt).toBeGreaterThanOrEqual(NOON);
  });

  test("leaves an indoor plan alone", async () => {
    const { t, groupId } = await crew();
    const indoor = storedPlan({ placeSlug: "pegasus-books", startsAt: localTimeToMs(DAY, 17 * 60) });
    vi.stubGlobal("fetch", vi.fn(async () => rainy(DAY)));
    await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind: "daily", plan: indoor });
    const swapped = await t.action(internal.plans.drop.weatherSwapStep, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: indoor,
    });
    expect(swapped).toBeNull();
    const rows = await plans(t, groupId);
    expect(rows[0].weatherCheckedAt).toBeUndefined();
  });

  test("leaves the plan alone when the forecast is dry", async () => {
    const { t, groupId } = await crew();
    const outdoor = storedPlan({ placeSlug: "indian-rock", startsAt: localTimeToMs(DAY, 17 * 60) });
    await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind: "daily", plan: outdoor });
    const swapped = await t.action(internal.plans.drop.weatherSwapStep, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: outdoor,
    });
    expect(swapped).toBeNull();
  });
});

describe("writeFallback", () => {
  test("writes a plan for the day when nothing else did", async () => {
    const { t, groupId } = await crew();
    const id = await t.mutation(internal.plans.drop.writeFallback, { groupId, day: DAY, kind: "daily" });
    expect(id).not.toBeNull();
    const rows = await plans(t, groupId);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("fallback");
    expect(rows[0].startsAt).toBeGreaterThanOrEqual(NOON);
    const place = await t.run(async (ctx) => await ctx.db.get("places", rows[0].placeId));
    expect(PLACE_BY_SLUG.has(place!.slug)).toBe(true);
    const again = await t.mutation(internal.plans.drop.writeFallback, { groupId, day: DAY, kind: "daily" });
    expect(again).toEqual(id);
    expect(await plans(t, groupId)).toHaveLength(1);
  });

  test("writes nothing when nobody is free today", async () => {
    const { t, groupId } = await crew();
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("availability").take(10)) await ctx.db.delete("availability", row._id);
    });
    const id = await t.mutation(internal.plans.drop.writeFallback, { groupId, day: DAY, kind: "daily" });
    expect(id).toBeNull();
    expect(await plans(t, groupId)).toHaveLength(0);
  });
});

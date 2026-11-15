import type { WorkflowId } from "@convex-dev/workflow";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PLACE_BY_SLUG } from "../../../convex/places/data";
import { FALLBACK_SLUGS } from "../../../convex/plans/engine";
import { localTimeToMs, solarTimes } from "../../../convex/plans/time";
import { flipDue, makeT, NOON, setupCrew, token, type T } from "../setup.helpers";

declare const process: { env: Record<string, string | undefined> };

const DAY = "2026-11-15";
const HOUR = 60 * 60 * 1000;
const NEXT_MIDNIGHT = localTimeToMs("2026-11-16", 0);
const WORKFLOW_ID = "wf_00000000000000000000000000000001" as WorkflowId;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  delete process.env.OPENAI_API_KEY;
  delete process.env.SUPERMEMORY_API_KEY;
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
  delete process.env.OPENAI_API_KEY;
  delete process.env.SUPERMEMORY_API_KEY;
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const forecast = (
  day: string,
  opts: { tempF?: number[]; precip?: number[]; code?: number[]; cloud?: number[] } = {},
) => {
  const sun = solarTimes(day);
  const hours = Array.from({ length: 24 }, (_, i) => localTimeToMs(day, i * 60) / 1000);
  return {
    hourly: {
      time: hours,
      temperature_2m: opts.tempF ?? hours.map(() => 58),
      precipitation_probability: opts.precip ?? hours.map(() => 0),
      weather_code: opts.code ?? hours.map(() => 1),
      cloud_cover: opts.cloud ?? hours.map(() => 10),
    },
    daily: { sunrise: [sun.sunriseMs / 1000], sunset: [sun.sunsetMs / 1000] },
  };
};

async function freeCrew(names: string[] = ["Maya", "Dev"]) {
  const t = makeT();
  const crew = await setupCrew(t, names);
  await t.mutation(internal.places.seed.seedPlaces, {});
  for (const name of names) {
    await t.mutation(api.crew.setFree, { deviceToken: token(name), groupId: crew.groupId, day: DAY, state: "now" });
  }
  return { t, crew, groupId: crew.groupId };
}

const planRows = async (t: T) => await t.run(async (ctx) => await ctx.db.query("plans").take(10));

const placeOf = async (t: T, planId: Id<"places">) => await t.run(async (ctx) => await ctx.db.get("places", planId));

const planFixture = (
  overrides: Partial<{
    placeSlug: string;
    title: string;
    startsAt: number;
    source: "model" | "scorer" | "fallback";
    favoredUserId: string | null;
    whyMemoryId: string | null;
  }> = {},
) => ({
  placeSlug: overrides.placeSlug ?? "rose-garden",
  title: overrides.title ?? "Golden hour at Cragmont Rock",
  line: "Clear and 62 degrees. Sunset at 5:01.",
  why: "it's free and it looks straight at the Golden Gate.",
  whySource: "template" as const,
  whyMemoryId: overrides.whyMemoryId ?? null,
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
  favoredUserId: overrides.favoredUserId ?? null,
  source: overrides.source ?? ("scorer" as const),
});

describe("fetchWeatherStep", () => {
  test("returns null instead of throwing when the forecast is unreachable", async () => {
    const t = makeT();
    expect(await t.action(internal.plans.drop.fetchWeatherStep, { day: DAY })).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    expect(await t.action(internal.plans.drop.fetchWeatherStep, { day: DAY })).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => json({ daily: { sunrise: [1], sunset: [2] } })));
    expect(await t.action(internal.plans.drop.fetchWeatherStep, { day: DAY })).toBeNull();
  });

  test("asks open meteo for the requested day and returns its hours", async () => {
    const t = makeT();
    const fetcher = vi.fn(async (_url: string | URL | Request) =>
      json(forecast(DAY, { tempF: Array.from({ length: 24 }, () => 58.6) })),
    );
    vi.stubGlobal("fetch", fetcher);
    const got = await t.action(internal.plans.drop.fetchWeatherStep, { day: DAY });
    const sun = solarTimes(DAY);
    expect(got).not.toBeNull();
    expect(got!.sunriseMs).toBe(sun.sunriseMs);
    expect(got!.sunsetMs).toBe(sun.sunsetMs);
    expect(got!.hourly).toHaveLength(24);
    expect(got!.hourly[17]).toEqual({
      timeMs: localTimeToMs(DAY, 17 * 60),
      tempF: 59,
      precipProb: 0,
      code: 1,
      cloudCover: 10,
    });
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain("api.open-meteo.com");
    expect(url).toContain("start_date=" + DAY);
    expect(url).toContain("end_date=" + DAY);
  });

  test("keeps the rain signal the plan engine reads", async () => {
    const t = makeT();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(forecast(DAY, { precip: Array.from({ length: 24 }, () => 90), code: Array.from({ length: 24 }, () => 63) })),
      ),
    );
    const got = await t.action(internal.plans.drop.fetchWeatherStep, { day: DAY });
    expect(got!.hourly[17].precipProb).toBe(90);
    expect(got!.hourly[17].code).toBe(63);
  });
});

describe("dropWorkflow", () => {
  test("writes one plan for the crew and the day", async () => {
    const { t, groupId } = await freeCrew();
    await t.mutation(internal.plans.drop.dropWorkflow, { args: { groupId, day: DAY, kind: "daily", nowMs: NOON } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.groupId).toBe(groupId);
    expect(row.day).toBe(DAY);
    expect(row.kind).toBe("daily");
    expect(row.generatedAt).toBeGreaterThanOrEqual(NOON);
    expect(row.generatedAt).toBeLessThan(NEXT_MIDNIGHT);
    expect(row.startsAt).toBeGreaterThanOrEqual(NOON);
    expect(row.startsAt).toBeLessThan(NEXT_MIDNIGHT);
    expect(row.source).toBe("scorer");
    expect(row.weather).toBeUndefined();
    expect(row.weatherSwap).toBe(false);
    const place = await placeOf(t, row.placeId);
    expect(PLACE_BY_SLUG.has(place!.slug)).toBe(true);
    expect(row.title).toBe(PLACE_BY_SLUG.get(place!.slug)!.title);
    expect(row.weatherCheckedAt).toBeUndefined();
  });

  test("a second drop for the same crew and day keeps the first plan", async () => {
    const { t, groupId } = await freeCrew();
    await t.mutation(internal.plans.drop.dropWorkflow, { args: { groupId, day: DAY, kind: "daily", nowMs: NOON } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [first] = await planRows(t);
    await flipDue(t, 3 * HOUR);
    await t.mutation(internal.plans.drop.dropWorkflow, {
      args: { groupId, day: DAY, kind: "daily", nowMs: NOON + 3 * HOUR },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(first._id);
    expect(rows[0].placeId).toBe(first.placeId);
    expect(rows[0].title).toBe(first.title);
    expect(rows[0].startsAt).toBe(first.startsAt);
  });

  test("does not overwrite a plan the crew already has for the day", async () => {
    const { t, crew, groupId } = await freeCrew();
    const planId = await t.mutation(internal.plans.drop.writePlan, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: planFixture({ title: "Hand picked", favoredUserId: crew.ids["Maya"] }),
    });
    expect(planId).not.toBeNull();
    await t.mutation(internal.plans.drop.dropWorkflow, { args: { groupId, day: DAY, kind: "daily", nowMs: NOON } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(planId);
    expect(rows[0].title).toBe("Hand picked");
    expect(rows[0].favoredUserId).toBe(crew.ids["Maya"]);
  });

  test("the same day at another kind is its own plan", async () => {
    const { t, groupId } = await freeCrew();
    await t.mutation(internal.plans.drop.dropWorkflow, { args: { groupId, day: DAY, kind: "daily", nowMs: NOON } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(internal.plans.drop.dropWorkflow, { args: { groupId, day: DAY, kind: "weekend", nowMs: NOON } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await planRows(t);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.kind).sort()).toEqual(["daily", "weekend"]);
    expect(new Set(rows.map((row) => row._id)).size).toBe(2);
  });

  test("falls back to the scorer when the model pick fails", async () => {
    const { t, groupId } = await freeCrew();
    process.env.OPENAI_API_KEY = "test-key";
    await t.mutation(internal.plans.drop.dropWorkflow, { args: { groupId, day: DAY, kind: "daily", nowMs: NOON } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("scorer");
    expect(rows[0].whySource).toBe("template");
    const running = await t.run(
      async (ctx) => (await ctx.db.query("planRuns").take(10)).filter((run) => run.status === "running"),
    );
    expect(running).toEqual([]);
  });

  test("writes nothing when nobody in the crew is free", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(internal.places.seed.seedPlaces, {});
    await t.mutation(internal.plans.drop.dropWorkflow, {
      args: { groupId: crew.groupId, day: DAY, kind: "daily", nowMs: NOON },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await planRows(t)).toHaveLength(0);
  });

  test("writes nothing once the day it was queued for has run out", async () => {
    const { t, groupId } = await freeCrew();
    await t.mutation(internal.plans.drop.dropWorkflow, {
      args: { groupId, day: DAY, kind: "daily", nowMs: NEXT_MIDNIGHT + HOUR },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await planRows(t)).toHaveLength(0);
  });
});

describe("patchPlan", () => {
  test("updates only the fields the new plan carries", async () => {
    const { t, crew, groupId } = await freeCrew();
    const original = planFixture({ favoredUserId: crew.ids["Maya"], whyMemoryId: "mem_night1" });
    const planId = await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind: "daily", plan: original });
    expect(planId).not.toBeNull();
    const written = (await planRows(t))[0];
    const indoors = {
      ...planFixture({ placeSlug: "pegasus-books", whyMemoryId: null }),
      title: "Rain, so books",
      line: "Rain around 6, so it's indoors. Sunset at 5:01.",
      why: "rain's coming, so this one keeps everyone dry, and it's free.",
      chips: ["Free", "8 min walk", "Dry inside"],
      startsAt: localTimeToMs(DAY, 18 * 60),
      weather: "Rain, 58 degrees",
      weatherSwap: true,
      cost: 500,
      costLabel: "$5",
      payUpFront: true,
    };
    vi.setSystemTime(NOON + 2 * HOUR);
    const patched = await t.mutation(internal.plans.drop.patchPlan, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: indoors,
    });
    expect(patched).toBe(planId);
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.title).toBe("Rain, so books");
    expect(row.line).toBe("Rain around 6, so it's indoors. Sunset at 5:01.");
    expect(row.why).toBe("rain's coming, so this one keeps everyone dry, and it's free.");
    expect(row.chips).toEqual(["Free", "8 min walk", "Dry inside"]);
    expect(row.startsAt).toBe(localTimeToMs(DAY, 18 * 60));
    expect(row.cost).toBe(500);
    expect(row.costLabel).toBe("$5");
    expect(row.payUpFront).toBe(true);
    expect(row.weather).toBe("Rain, 58 degrees");
    expect(row.weatherSwap).toBe(true);
    expect(row.weatherCheckedAt).toBeGreaterThanOrEqual(NOON + 2 * HOUR);
    expect(row.weatherCheckedAt).toBeLessThan(NOON + 3 * HOUR);
    expect(row.whyMemoryId).toBeUndefined();
    const place = await placeOf(t, row.placeId);
    expect(place!.slug).toBe("pegasus-books");
    expect(row.source).toBe("scorer");
    expect(row.generatedAt).toBe(written.generatedAt);
    expect(row.favoredUserId).toBe(crew.ids["Maya"]);
  });

  test("returns null when the day has no plan to patch", async () => {
    const { t, groupId } = await freeCrew();
    expect(
      await t.mutation(internal.plans.drop.patchPlan, { groupId, day: DAY, kind: "daily", plan: planFixture() }),
    ).toBeNull();
    expect(await planRows(t)).toHaveLength(0);
  });

  test("returns null and leaves the plan alone when the new place is missing", async () => {
    const { t, groupId } = await freeCrew();
    await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind: "daily", plan: planFixture() });
    const patched = await t.mutation(internal.plans.drop.patchPlan, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: { ...planFixture({ placeSlug: "not-a-place" }), title: "Somewhere else" },
    });
    expect(patched).toBeNull();
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Golden hour at Cragmont Rock");
    const place = await placeOf(t, rows[0].placeId);
    expect(place!.slug).toBe("rose-garden");
  });

  test("patches the plan for its own kind and ignores another", async () => {
    const { t, groupId } = await freeCrew();
    await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind: "daily", plan: planFixture() });
    expect(
      await t.mutation(internal.plans.drop.patchPlan, {
        groupId,
        day: DAY,
        kind: "weekend",
        plan: planFixture({ title: "Weekend only" }),
      }),
    ).toBeNull();
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("daily");
    expect(rows[0].title).toBe("Golden hour at Cragmont Rock");
  });
});

describe("dropComplete", () => {
  test("writes nothing when the workflow already returned a plan", async () => {
    const { t, groupId } = await freeCrew();
    const planId = await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind: "daily", plan: planFixture() });
    expect(planId).not.toBeNull();
    const result = await t.mutation(internal.plans.drop.dropComplete, {
      workflowId: WORKFLOW_ID,
      result: { kind: "success", returnValue: planId },
      context: { groupId, day: DAY, kind: "daily" },
    });
    expect(result).toBeNull();
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(planId);
    expect(rows[0].title).toBe("Golden hour at Cragmont Rock");
  });

  test("writes the deterministic fallback when the workflow came back empty", async () => {
    const { t, groupId } = await freeCrew();
    const id = await t.mutation(internal.plans.drop.dropComplete, {
      workflowId: WORKFLOW_ID,
      result: { kind: "success", returnValue: null },
      context: { groupId, day: DAY, kind: "daily" },
    });
    expect(id).not.toBeNull();
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(id);
    expect(rows[0].source).toBe("fallback");
    expect(rows[0].kind).toBe("daily");
    expect(rows[0].day).toBe(DAY);
    expect(rows[0].startsAt).toBeGreaterThanOrEqual(NOON);
    expect(rows[0].startsAt).toBeLessThan(NEXT_MIDNIGHT);
    const place = await placeOf(t, rows[0].placeId);
    expect(FALLBACK_SLUGS).toContain(place!.slug);
    expect(rows[0].why).toBe(PLACE_BY_SLUG.get(place!.slug)!.fallbackWhy);
  });

  test("covers a failed or canceled workflow without leaving a run stuck", async () => {
    const { t, groupId } = await freeCrew();
    const failed = await t.mutation(internal.plans.drop.dropComplete, {
      workflowId: WORKFLOW_ID,
      result: { kind: "failed", error: "pick failed" },
      context: { groupId, day: DAY, kind: "daily" },
    });
    expect(failed).not.toBeNull();
    const canceled = await t.mutation(internal.plans.drop.dropComplete, {
      workflowId: WORKFLOW_ID,
      result: { kind: "canceled" },
      context: { groupId, day: DAY, kind: "daily" },
    });
    expect(canceled).toBe(failed);
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("fallback");
    const running = await t.run(
      async (ctx) => (await ctx.db.query("planRuns").take(10)).filter((run) => run.status === "running"),
    );
    expect(running).toEqual([]);
  });

  test("keeps a plan that is already on the books when the fallback lands late", async () => {
    const { t, crew, groupId } = await freeCrew();
    const planId = await t.mutation(internal.plans.drop.writePlan, {
      groupId,
      day: DAY,
      kind: "daily",
      plan: planFixture({ favoredUserId: crew.ids["Dev"] }),
    });
    const result = await t.mutation(internal.plans.drop.dropComplete, {
      workflowId: WORKFLOW_ID,
      result: { kind: "failed", error: "timed out" },
      context: { groupId, day: DAY, kind: "daily" },
    });
    expect(result).toBe(planId);
    const rows = await planRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("scorer");
    expect(rows[0].title).toBe("Golden hour at Cragmont Rock");
  });

  test("writes nothing when nobody in the crew is free", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(internal.places.seed.seedPlaces, {});
    expect(
      await t.mutation(internal.plans.drop.dropComplete, {
        workflowId: WORKFLOW_ID,
        result: { kind: "failed", error: "pick failed" },
        context: { groupId: crew.groupId, day: DAY, kind: "daily" },
      }),
    ).toBeNull();
    expect(await planRows(t)).toHaveLength(0);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createFake } from "../memory/fakeSupermemory";
import { groupNamespace } from "../memory/mapping";
import { PLACE_BY_SLUG } from "../places/data";
import { makeT } from "../tests/setup.helpers";
import { modelPick } from "./drop";
import { rankCandidates, type DropInput } from "./engine";
import { EMPTY_MEMORY, type MemoryContext } from "./memoryContext";
import { addDays, localTimeToMs, solarTimes } from "./time";

declare const process: { env: Record<string, string | undefined> };

const DAY = "2026-11-15";
const NOON = localTimeToMs(DAY, 12 * 60);

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
  whyMemoryId: null,
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

const PICK_WHY = "you're into sunsets, it's free, and the sky's clear until dark.";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const answer = (slug: string, why = PICK_WHY) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json({ output_text: JSON.stringify({ slug, why }) }));

async function dropInput(t: ReturnType<typeof makeT>, groupId: Id<"groups">, memory: MemoryContext = EMPTY_MEMORY): Promise<DropInput> {
  const inputs = await t.query(internal.plans.inputs.dropInputs, { groupId, day: DAY, nowMs: NOON });
  return {
    day: DAY,
    kind: "daily",
    seed: groupId + ":" + DAY,
    nowMs: NOON,
    attendees: inputs.attendees,
    weather: null,
    memory,
    history: inputs.history,
    lastFrolicDay: inputs.lastFrolicDay,
  };
}

describe("modelPick", () => {
  test("takes a candidate the model chose", async () => {
    const { t, groupId } = await crew();
    const input = await dropInput(t, groupId);
    const candidates = rankCandidates(input).slice(0, 8);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const chosen = candidates[2].place.slug;
    process.env.OPENAI_API_KEY = "test-key";
    const fetcher = answer(chosen);
    const pick = await modelPick(input, fetcher);
    expect(pick).toEqual({ preferredSlug: chosen, preferredWhy: PICK_WHY });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain("api.openai.com");
    expect(String(init?.body)).toContain(chosen);
  });

  test("refuses a slug that is not on the shortlist", async () => {
    const { t, groupId } = await crew();
    const input = await dropInput(t, groupId);
    process.env.OPENAI_API_KEY = "test-key";
    expect(await modelPick(input, answer("not-a-place"))).toBeNull();
    expect(await modelPick(input, answer(rankCandidates(input)[0].place.slug, "the best night of the week!"))).toBeNull();
  });

  test("returns null when the call fails", async () => {
    const { t, groupId } = await crew();
    const input = await dropInput(t, groupId);
    process.env.OPENAI_API_KEY = "test-key";
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await modelPick(input, down)).toBeNull();
    const broken = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await modelPick(input, broken)).toBeNull();
  });

  test("pickStep never calls OpenAI when the key is unset", async () => {
    const { t, groupId } = await crew();
    const fetcher = vi.fn(async (_url: string | URL | Request) => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetcher);
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
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("api.openai.com"))).toBe(false);
  });
});

describe("demo beat", () => {
  let fake: ReturnType<typeof createFake>;

  beforeEach(() => {
    fake = createFake();
    vi.stubGlobal("fetch", fake.handler);
    process.env.SUPERMEMORY_API_KEY = "test-key";
  });

  const bobaSkips = async (t: ReturnType<typeof makeT>, groupId: Id<"groups">) =>
    await t.run(async (ctx) => {
      await ctx.db.insert("tasteProfiles", { groupId, tags: ["boba"], updatedAt: NOON });
      await ctx.db.insert("memoryTagStats", { groupId, tag: "boba", liked: 0, skipped: 2, updatedAt: NOON });
    });

  const memoryOf = (t: ReturnType<typeof makeT>, groupId: Id<"groups">) =>
    t.action(internal.plans.drop.memoryStep, { groupId, day: DAY });

  test("memoryStep falls back to an empty context when Supermemory is not there", async () => {
    const { t, groupId } = await crew();
    delete process.env.SUPERMEMORY_API_KEY;
    await bobaSkips(t, groupId);
    const memory = await memoryOf(t, groupId);
    expect(memory).toEqual(EMPTY_MEMORY);
  });

  test("a crew that keeps passing on boba never gets a boba place", async () => {
    const { t, groupId } = await crew();
    await bobaSkips(t, groupId);
    const memory = await memoryOf(t, groupId);
    expect(memory.suppressed).toContain("boba");
    const open = rankCandidates(await dropInput(t, groupId));
    expect(open[0].place.tags).toContain("boba");
    const inputs = await t.query(internal.plans.inputs.dropInputs, { groupId, day: DAY, nowMs: NOON });
    const plan = await t.action(internal.plans.drop.pickStep, {
      groupId,
      day: DAY,
      kind: "daily",
      inputs,
      weather: null,
      memory,
    });
    expect(plan).not.toBeNull();
    expect(plan!.placeSlug).toBe(open.find((c) => !c.place.tags.includes("boba"))!.place.slug);
    expect(PLACE_BY_SLUG.get(plan!.placeSlug)!.tags).not.toContain("boba");
    await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind: "daily", plan: plan! });
    const rows = await plans(t, groupId);
    const place = await t.run(async (ctx) => await ctx.db.get("places", rows[0].placeId));
    expect(place!.tags).not.toContain("boba");
  });

  test("a memory about the chosen place becomes the why", async () => {
    const { t, groupId } = await crew();
    await bobaSkips(t, groupId);
    const memory = await memoryOf(t, groupId);
    const inputs = await t.query(internal.plans.inputs.dropInputs, { groupId, day: DAY, nowMs: NOON });
    const args = { groupId, day: DAY, kind: "daily" as const, inputs, weather: null, memory };
    const first = await t.action(internal.plans.drop.pickStep, args);
    expect(first).not.toBeNull();
    const place = PLACE_BY_SLUG.get(first!.placeSlug)!;
    const night = "Went to " + place.name + " and stayed until the sky went orange.";
    fake.docs.set(groupNamespace(groupId), new Map([["night1", { id: "night1", content: night, metadata: { kind: "night", tags: place.tags }, date: "2026-11-08" }]]));
    const plan = await t.action(internal.plans.drop.pickStep, args);
    expect(plan!.placeSlug).toBe(first!.placeSlug);
    expect(plan!.whySource).toBe("memory");
    expect(plan!.whyMemoryId).toBe("mem_night1");
    expect(plan!.why).toContain(place.name);
    expect(plan!.why).toContain("you remembered it like this");
    expect(plan!.whyInputs.memory).toBe(night);
    await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind: "daily", plan: plan! });
    const rows = await plans(t, groupId);
    expect(rows[0].why).toBe(plan!.why);
    expect(rows[0].whySource).toBe("memory");
    expect(rows[0].whyMemoryId).toBe("mem_night1");
    expect(fake.calls.some((c) => c.path.endsWith("/search"))).toBe(true);
  });
});

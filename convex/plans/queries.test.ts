import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeT } from "../tests/setup.helpers";
import { localTimeToMs } from "./time";

const DAY = "2026-11-15";
const NOON = localTimeToMs(DAY, 12 * 60);

async function crew() {
  const t = makeT();
  await t.mutation(internal.places.seed.seedPlaces, {});
  const groupId = await t.run(async (ctx) => {
    const createdBy = await ctx.db.insert("users", { name: "Maya", source: "app" });
    const groupId = await ctx.db.insert("groups", { name: "Sunset Crew", createdBy, timezone: "America/Los_Angeles" });
    for (const name of ["Maya", "Dev"]) {
      const userId = await ctx.db.insert("users", { name, source: "app" });
      await ctx.db.insert("memberships", { groupId, userId, color: "cobalt", joinedVia: "invite" });
    }
    return groupId;
  });
  return { t, groupId };
}

const plan = (placeSlug: string) => ({
  placeSlug,
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
  startsAt: localTimeToMs(DAY, 17 * 60),
  durationMinutes: 60,
  meetingPoint: { lat: 37.8932, lng: -122.2649, label: "The lookout at the top of the stairs" },
  sunsetAt: localTimeToMs(DAY, 17 * 60),
  weather: "Clear, 62 degrees",
  weatherSwap: false,
  favoredUserId: null,
  source: "scorer" as const,
});

const write = async (t: ReturnType<typeof makeT>, groupId: Id<"groups">, kind: "daily" | "weekend" | "solo", slug: string) =>
  await t.mutation(internal.plans.drop.writePlan, { groupId, day: DAY, kind, plan: plan(slug) });

describe("today plan query", () => {
  test("returns null before any plan exists", async () => {
    const { t, groupId } = await crew();
    expect(await t.query(api.plans.queries.today, { groupId, day: DAY })).toBeNull();
  });

  test("returns the plan for the day joined with its place", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "cragmont-rock");
    const view = await t.query(api.plans.queries.today, { groupId, day: DAY });
    expect(view).not.toBeNull();
    expect(view).toMatchObject({
      kind: "daily",
      title: "Golden hour at Cragmont Rock",
      cost: 0,
      costLabel: "Free",
      startsAt: localTimeToMs(DAY, 17 * 60),
      place: {
        name: "Cragmont Rock Park",
        slug: "cragmont-rock",
        lat: 37.8932,
        lng: -122.2649,
        indoor: false,
        photoUrl: null,
      },
    });
    expect(view!.place.tags).toContain("sunsets");
    expect(JSON.stringify(view)).not.toContain("budget");
    expect(JSON.stringify(view)).not.toContain("candidates");
  });

  test("prefers the daily plan over the solo one", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "solo", "rose-garden");
    await write(t, groupId, "daily", "live-oak-park");
    const view = await t.query(api.plans.queries.today, { groupId, day: DAY });
    expect(view?.kind).toBe("daily");
    expect(view?.place.slug).toBe("live-oak-park");
  });

  test("falls back to the solo plan on a day with none", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "solo", "rose-garden");
    const view = await t.query(api.plans.queries.today, { groupId, day: DAY });
    expect(view?.kind).toBe("solo");
    expect(view?.place.slug).toBe("rose-garden");
  });

  test("returns nothing for another day", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    expect(await t.query(api.plans.queries.today, { groupId, day: "2026-11-16" })).toBeNull();
  });
});

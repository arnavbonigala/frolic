import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { hashToken } from "../../convex/lib/identity";
import { HERO_KEYS } from "../../convex/places/data";
import { makeT, token } from "../backend/setup.helpers";
import { localTimeToMs } from "../../convex/plans/time";

const DAY = "2026-11-15";
const NOON = localTimeToMs(DAY, 12 * 60);

async function crew() {
  const t = makeT();
  await t.mutation(internal.places.seed.seedPlaces, {});
  const { groupId, ids } = await t.run(async (ctx) => {
    const ids: Record<string, Id<"users">> = {};
    for (const name of ["Maya", "Dev"]) {
      const userId = await ctx.db.insert("users", { name, source: "app", tokenHash: await hashToken(token(name)) });
      ids[name] = userId;
    }
    const groupId = await ctx.db.insert("groups", { name: "Sunset Crew", createdBy: ids.Maya, timezone: "America/Los_Angeles" });
    for (const name of ["Maya", "Dev"]) {
      await ctx.db.insert("memberships", { groupId, userId: ids[name], color: "cobalt", joinedVia: "invite" });
    }
    ids.Eve = await ctx.db.insert("users", { name: "Eve", source: "app", tokenHash: await hashToken(token("Eve")) });
    return { groupId, ids };
  });
  return { t, groupId, ids };
}

const plan = (placeSlug: string) => ({
  placeSlug,
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

const view = (t: ReturnType<typeof makeT>, groupId: Id<"groups">, name = "Maya", day = DAY) =>
  t.query(api.plans.queries.today, { token: token(name), groupId, day });

describe("today plan query", () => {
  test("returns null before any plan exists", async () => {
    const { t, groupId } = await crew();
    expect(await view(t, groupId)).toBeNull();
  });

  test("returns the plan for the day joined with its place", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "cragmont-rock");
    const today = await view(t, groupId);
    expect(today).not.toBeNull();
    expect(today).toMatchObject({
      kind: "daily",
      title: "Golden hour at Cragmont Rock",
      cost: 0,
      costLabel: "Free",
      startsAt: localTimeToMs(DAY, 17 * 60),
      whySource: "template",
      place: {
        name: "Cragmont Rock Park",
        slug: "cragmont-rock",
        lat: 37.8932,
        lng: -122.2649,
        indoor: false,
        photoUrl: null,
      },
    });
    expect(today!.place.tags).toContain("sunsets");
    expect(today!.whyInputs.topTags).toEqual(["sunsets"]);
    expect(JSON.stringify(today)).not.toContain("budget");
    expect(JSON.stringify(today)).not.toContain("candidates");
  });

  test("returns a hero key the app has art for", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "cragmont-rock");
    const today = await view(t, groupId);
    expect(HERO_KEYS).toContain(today!.heroKey);
  });

  test("prefers the daily plan over the solo one", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "solo", "rose-garden");
    await write(t, groupId, "daily", "live-oak-park");
    const today = await view(t, groupId);
    expect(today?.kind).toBe("daily");
    expect(today?.place.slug).toBe("live-oak-park");
  });

  test("falls back to the solo plan on a day with none", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "solo", "rose-garden");
    const today = await view(t, groupId);
    expect(today?.kind).toBe("solo");
    expect(today?.place.slug).toBe("rose-garden");
  });

  test("returns nothing for another day", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    expect(await view(t, groupId, "Maya", "2026-11-16")).toBeNull();
  });

  test("rejects a token from someone outside the crew", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    await expect(view(t, groupId, "Eve")).rejects.toThrow(/not in this crew/);
  });

  test("rejects a token no device owns", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    await expect(
      t.query(api.plans.queries.today, { token: "device-nobody-0123456789abcdefghijklmnop", groupId, day: DAY }),
    ).rejects.toThrow(/not signed in/);
  });
});

describe("setDeviceWhy", () => {
  const planId = async (t: ReturnType<typeof makeT>, groupId: Id<"groups">) =>
    (await t.run(async (ctx) => (await ctx.db.query("plans").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId)).take(1))[0]))!._id;

  const set = (t: ReturnType<typeof makeT>, id: Id<"plans">, name: string, text: string) =>
    t.mutation(api.plans.queries.setDeviceWhy, { token: token(name), planId: id, text });

  test("a member writes the why and the plan quotes it", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    const result = await set(t, await planId(t, groupId), "Maya", "we always end up on the grass here");
    expect(result).toEqual({ accepted: true, why: "we always end up on the grass here" });
    const today = await view(t, groupId);
    expect(today?.why).toBe("we always end up on the grass here");
    expect(today?.whySource).toBe("device");
  });

  test("the first line sticks when a second member writes one", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    const id = await planId(t, groupId);
    await set(t, id, "Maya", "we always end up on the grass here");
    const second = await set(t, id, "Dev", "or we sit on the wall instead");
    expect(second).toEqual({ accepted: false, why: "we always end up on the grass here" });
    expect((await view(t, groupId))?.why).toBe("we always end up on the grass here");
  });

  test("collapses whitespace before it counts characters", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    const result = await set(t, await planId(t, groupId), "Maya", "  we   end  up on the grass  ");
    expect(result.why).toBe("we end up on the grass");
  });

  test("takes a line exactly at the limit", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    const line = "word ".repeat(23) + "words";
    expect(line).toHaveLength(120);
    expect((await set(t, await planId(t, groupId), "Maya", line)).accepted).toBe(true);
  });

  test("refuses an em dash, an exclamation mark, or a line over the limit", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    const id = await planId(t, groupId);
    await expect(set(t, id, "Maya", "we end up on the grass \u2014 every time")).rejects.toThrow(/house rules/);
    expect((await view(t, groupId))?.whySource).toBe("template");
    await expect(set(t, id, "Maya", "best night of the week!")).rejects.toThrow(/house rules/);
    await expect(set(t, id, "Maya", "word ".repeat(24) + "word")).rejects.toThrow(/house rules/);
    expect((await view(t, groupId))?.why).toBe("it's free and it looks straight at the Golden Gate.");
  });

  test("refuses a writer outside the crew", async () => {
    const { t, groupId } = await crew();
    await write(t, groupId, "daily", "rose-garden");
    await expect(set(t, await planId(t, groupId), "Eve", "we ended up on the grass")).rejects.toThrow(/not in this crew/);
    expect((await view(t, groupId))?.whySource).toBe("template");
  });
});

import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import { BERKELEY_PLACES, PLACE_BY_SLUG } from "../places/data";
import { makeT } from "../tests/setup.helpers";

describe("seedPlaces", () => {
  test("inserts every Berkeley place once", async () => {
    const t = makeT();
    const first = await t.mutation(internal.places.seed.seedPlaces, {});
    expect(BERKELEY_PLACES.length).toBeGreaterThanOrEqual(60);
    expect(first).toMatchObject({ inserted: BERKELEY_PLACES.length, updated: 0, removed: 0 });
    const rows = await t.run(async (ctx) => await ctx.db.query("places").take(200));
    expect(rows).toHaveLength(BERKELEY_PLACES.length);
    expect(new Set(rows.map((row) => row.slug)).size).toBe(rows.length);
  });

  test("a second run updates in place without duplicating", async () => {
    const t = makeT();
    await t.mutation(internal.places.seed.seedPlaces, {});
    const second = await t.mutation(internal.places.seed.seedPlaces, {});
    expect(second).toMatchObject({ inserted: 0, updated: BERKELEY_PLACES.length, removed: 0 });
    const rows = await t.run(async (ctx) => await ctx.db.query("places").take(200));
    expect(rows).toHaveLength(BERKELEY_PLACES.length);
  });

  test("maps the engine place fields onto the table", async () => {
    const t = makeT();
    await t.mutation(internal.places.seed.seedPlaces, {});
    const source = PLACE_BY_SLUG.get("indian-rock");
    const row = await t.run(
      async (ctx) => await ctx.db.query("places").withIndex("by_slug", (q) => q.eq("slug", "indian-rock")).unique(),
    );
    expect(source).toBeDefined();
    expect(row).toMatchObject({
      name: source!.name,
      title: source!.title,
      neighborhood: source!.area,
      address: source!.address,
      lat: source!.lat,
      lng: source!.lng,
      cost: source!.costPerPersonCents,
      costPerPersonCents: source!.costPerPersonCents,
      costLabel: source!.costLabel,
      tags: source!.tags,
      bestTime: "goldenHour",
      indoor: source!.indoor,
      sober: true,
      energy: source!.energy,
      durationMinutes: source!.durationMin,
      meetSpot: source!.meetSpot,
      blurb: source!.fallbackWhy,
    });
    expect(row!.hours.length).toBeGreaterThan(0);
    expect(row!.hours.every((span) => span.day >= 0 && span.day <= 6)).toBe(true);
    expect(row!.hours.every((span) => span.open >= 0 && span.close > span.open)).toBe(true);
  });

});

describe("seedPlaces cleanup", () => {
  test("drops a place that is no longer in the set", async () => {
    const t = makeT();
    await t.mutation(internal.places.seed.seedPlaces, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("places", {
        slug: "retired-place",
        name: "Retired",
        lat: 37.87,
        lng: -122.26,
        cost: 0,
        tags: ["free"],
        hours: [],
        indoor: false,
        sober: true,
        costLabel: "Free",
        payUpFront: false,
        priceVerified: true,
        energy: "chill",
        needsDaylight: false,
        title: "Retired",
        address: "Nowhere",
        durationMinutes: 30,
        meetSpot: "Nowhere",
        source: "https://example.com",
        costPerPersonCents: 0,
      });
    });
    const result = await t.mutation(internal.places.seed.seedPlaces, {});
    expect(result.removed).toBe(1);
    const slugs = await t.run(async (ctx) => (await ctx.db.query("places").take(500)).map((p) => p.slug));
    expect(slugs).not.toContain("retired-place");
    expect(slugs).toHaveLength(BERKELEY_PLACES.length);
  });
});

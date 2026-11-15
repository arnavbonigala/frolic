import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { BERKELEY_PLACES, type BestTime, type Span } from "./data";

const bestTimeOf = (time: BestTime | undefined) => {
  if (time === "golden_hour") return "goldenHour" as const;
  if (time === "late_night") return "lateNight" as const;
  return "daytime" as const;
};

const flattenHours = (hours: Span[][]) =>
  hours.flatMap((spans, day) => spans.map(([open, close]) => ({ day, open, close })));

const fieldsOf = (place: (typeof BERKELEY_PLACES)[number]) => ({
  name: place.name,
  title: place.title,
  neighborhood: place.area,
  address: place.address,
  lat: place.lat,
  lng: place.lng,
  cost: place.costPerPersonCents,
  costPerPersonCents: place.costPerPersonCents,
  costLabel: place.costLabel,
  payUpFront: place.payUpFront,
  priceVerified: place.priceVerified,
  tags: place.tags,
  hours: flattenHours(place.hours),
  bestTime: bestTimeOf(place.bestTimes[0]),
  indoor: place.indoor,
  sober: true,
  energy: place.energy,
  needsDaylight: place.needsDaylight,
  durationMinutes: place.durationMin,
  meetSpot: place.meetSpot,
  source: place.source,
  blurb: place.fallbackWhy,
});

export const seedPlaces = internalMutation({
  args: {},
  returns: v.object({ inserted: v.number(), updated: v.number(), removed: v.number() }),
  handler: async (ctx) => {
    let inserted = 0;
    let updated = 0;
    for (const place of BERKELEY_PLACES) {
      const fields = fieldsOf(place);
      const existing = await ctx.db
        .query("places")
        .withIndex("by_slug", (q) => q.eq("slug", place.slug))
        .unique();
      if (existing) {
        await ctx.db.patch("places", existing._id, fields);
        updated += 1;
      } else {
        await ctx.db.insert("places", { slug: place.slug, ...fields });
        inserted += 1;
      }
    }
    const keep = new Set(BERKELEY_PLACES.map((place) => place.slug));
    const stored = await ctx.db.query("places").take(500);
    let removed = 0;
    for (const row of stored) {
      if (keep.has(row.slug)) continue;
      await ctx.db.delete("places", row._id);
      removed += 1;
    }
    return { inserted, updated, removed };
  },
});

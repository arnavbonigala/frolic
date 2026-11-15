import { v } from "convex/values";
import { query } from "../_generated/server";

const vPlace = v.object({
  name: v.string(),
  slug: v.string(),
  lat: v.number(),
  lng: v.number(),
  tags: v.array(v.string()),
  indoor: v.boolean(),
  photoUrl: v.union(v.string(), v.null()),
});

const vPlanView = v.object({
  planId: v.id("plans"),
  kind: v.union(v.literal("daily"), v.literal("weekend"), v.literal("solo")),
  title: v.string(),
  line: v.string(),
  why: v.union(v.string(), v.null()),
  chips: v.array(v.string()),
  cost: v.number(),
  costLabel: v.string(),
  payUpFront: v.boolean(),
  startsAt: v.number(),
  durationMinutes: v.number(),
  meetingPoint: v.union(v.object({ lat: v.number(), lng: v.number(), label: v.string() }), v.null()),
  sunsetAt: v.union(v.number(), v.null()),
  weather: v.union(v.string(), v.null()),
  source: v.union(v.literal("model"), v.literal("scorer"), v.literal("fallback")),
  generatedAt: v.number(),
  place: vPlace,
});

export const today = query({
  args: { groupId: v.id("groups"), day: v.string() },
  returns: v.union(vPlanView, v.null()),
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("plans")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", args.groupId).eq("day", args.day))
      .take(10);
    const plan =
      plans.find((p) => p.kind === "daily") ??
      plans.find((p) => p.kind === "solo") ??
      plans.find((p) => p.kind === "weekend");
    if (!plan) return null;
    const place = await ctx.db.get("places", plan.placeId);
    if (!place) return null;
    return {
      planId: plan._id,
      kind: plan.kind,
      title: plan.title,
      line: plan.line,
      why: plan.why ?? null,
      chips: plan.chips,
      cost: plan.cost,
      costLabel: plan.costLabel,
      payUpFront: plan.payUpFront,
      startsAt: plan.startsAt,
      durationMinutes: plan.durationMinutes,
      meetingPoint: plan.meetingPoint ?? null,
      sunsetAt: plan.sunsetAt ?? null,
      weather: plan.weather ?? null,
      source: plan.source,
      generatedAt: plan.generatedAt,
      place: {
        name: place.name,
        slug: place.slug,
        lat: place.lat,
        lng: place.lng,
        tags: place.tags,
        indoor: place.indoor,
        photoUrl: place.photoUrl ?? null,
      },
    };
  },
});

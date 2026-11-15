import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireMember, userFromToken } from "../lib/identity";
import { HERO_KEYS, PLACE_BY_SLUG, heroKeyFor } from "../places/data";
import { copyOk } from "./engine";

export const DEVICE_WHY_MAX = 120;

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
  kind: v.union(v.literal("daily"), v.literal("weekend"), v.literal("solo"), v.literal("free")),
  title: v.string(),
  line: v.string(),
  why: v.union(v.string(), v.null()),
  whySource: v.union(v.literal("template"), v.literal("memory"), v.literal("device"), v.literal("haiku")),
  whyInputs: v.object({
    placeName: v.string(),
    topTags: v.array(v.string()),
    weather: v.optional(v.string()),
    tempF: v.optional(v.number()),
    sunsetAt: v.optional(v.number()),
    rainSwap: v.boolean(),
  }),
  heroKey: v.union(...HERO_KEYS.map((k) => v.literal(k))),
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
  args: { token: v.string(), groupId: v.id("groups"), day: v.string() },
  returns: v.union(vPlanView, v.null()),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.token);
    await requireMember(ctx, args.groupId, user._id);
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
      whySource: plan.whySource,
      whyInputs: {
        placeName: plan.whyInputs.placeName,
        topTags: plan.whyInputs.topTags,
        weather: plan.whyInputs.weather,
        tempF: plan.whyInputs.tempF,
        sunsetAt: plan.whyInputs.sunsetAt,
        rainSwap: plan.whyInputs.rainSwap,
      },
      heroKey: PLACE_BY_SLUG.has(place.slug) ? heroKeyFor(PLACE_BY_SLUG.get(place.slug)!) : "plan-free-stuff",
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

export const setDeviceWhy = mutation({
  args: { token: v.string(), planId: v.id("plans"), text: v.string() },
  returns: v.object({ accepted: v.boolean(), why: v.string() }),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.token);
    const plan = await ctx.db.get("plans", args.planId);
    if (!plan) throw new ConvexError({ code: "NO_PLAN", message: "That plan is gone" });
    await requireMember(ctx, plan.groupId, user._id);
    if (plan.whySource === "device") return { accepted: false, why: plan.why ?? "" };
    const text = args.text.replace(/\s+/g, " ").trim();
    if (text.length > DEVICE_WHY_MAX || !copyOk(text)) throw new ConvexError({ code: "BAD_COPY", message: "That line does not fit the house rules" });
    await ctx.db.patch("plans", plan._id, { why: text, whySource: "device" });
    return { accepted: true, why: text };
  },
});

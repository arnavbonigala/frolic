import type { TestConvex } from "convex-test";
import type schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";

export type T = TestConvex<typeof schema>;

export type Variant = "sunset" | "kayaks";

export type SeedOptions = { variant?: Variant; samJoins?: boolean };

export const INVITE_CODE = "SUNSET";
export const SAM_PHONE = "+15105550103";
export const ANA_PHONE = "+15105550104";

const SUNSET = {
  variant: "sunset" as const,
  day: "2026-11-15",
  now: Date.parse("2026-11-16T02:05:00.000Z"),
  window: { start: Date.parse("2026-11-16T01:00:00.000Z"), end: Date.parse("2026-11-16T04:00:00.000Z") },
  deadline: Date.parse("2026-11-16T03:45:00.000Z"),
  startsAt: Date.parse("2026-11-16T01:45:00.000Z"),
  title: "Sunset at Indian Rock",
  line: "Golden hour on the rock, tacos after.",
  why: "The rock clears out after five.",
  cost: 0,
  costLabel: "Free",
  payUpFront: false,
  amountCents: 0,
  place: {
    slug: "indian-rock",
    name: "Indian Rock",
    title: "Indian Rock",
    neighborhood: "Northbrae",
    address: "Indian Rock Path, Berkeley, CA",
    lat: 37.8925,
    lng: -122.2717,
    meetSpot: "The bottom of the stairs",
  },
};

const KAYAKS = {
  variant: "kayaks" as const,
  day: "2026-11-16",
  now: Date.parse("2026-11-16T18:05:00.000Z"),
  window: { start: Date.parse("2026-11-16T17:00:00.000Z"), end: Date.parse("2026-11-16T20:00:00.000Z") },
  deadline: Date.parse("2026-11-16T19:45:00.000Z"),
  startsAt: Date.parse("2026-11-16T17:30:00.000Z"),
  title: "Kayaks at the Berkeley Marina",
  line: "Two hours on the water before the wind picks up.",
  why: "The bay is glass at nine.",
  cost: 25,
  costLabel: "$25",
  payUpFront: true,
  amountCents: 500,
  place: {
    slug: "berkeley-marina-launch",
    name: "Berkeley Marina Launch",
    title: "Berkeley Marina Launch",
    neighborhood: "Berkeley Marina",
    address: "201 University Ave, Berkeley, CA",
    lat: 37.866,
    lng: -122.313,
    meetSpot: "The launch ramp by the parking lot",
  },
};

export function nowFor(variant: Variant = "sunset"): number {
  return variant === "kayaks" ? KAYAKS.now : SUNSET.now;
}

export type Seed = {
  now: number;
  variant: Variant;
  day: string;
  title: string;
  coords: { lat: number; lng: number };
  groupId: Id<"groups">;
  mayaId: Id<"users">;
  devId: Id<"users">;
  samId: Id<"users">;
  anaId: Id<"users">;
  placeId: Id<"places">;
  planId: Id<"plans">;
  frolicId: Id<"frolics">;
  inviteId: Id<"invites">;
};

export async function seedCrew(t: T, options: SeedOptions = {}): Promise<Seed> {
  const variant = options.variant ?? "sunset";
  const config = variant === "kayaks" ? KAYAKS : SUNSET;
  const samJoins = options.samJoins ?? false;
  const ids = await t.run(async (ctx) => {
    const maya = await ctx.db.insert("users", { name: "Maya Chen", source: "app" });
    const dev = await ctx.db.insert("users", { name: "Dev Park", source: "app" });
    const sam = await ctx.db.insert("users", { name: "Sam Rivera", phone: SAM_PHONE, source: "imessage" });
    const ana = await ctx.db.insert("users", { name: "Ana Liu", phone: ANA_PHONE, source: "imessage" });
    const group = await ctx.db.insert("groups", { name: "Sunset Crew", createdBy: maya, timezone: "America/Los_Angeles" });
    await ctx.db.insert("memberships", { groupId: group, userId: maya, color: "pink", joinedVia: "creator" });
    await ctx.db.insert("memberships", { groupId: group, userId: dev, color: "cobalt", joinedVia: "invite" });
    if (!samJoins) await ctx.db.insert("memberships", { groupId: group, userId: sam, color: "moss", joinedVia: "invite" });
    await ctx.db.insert("memberships", { groupId: group, userId: ana, color: "marigold", joinedVia: "invite" });
    const place = await ctx.db.insert("places", {
      slug: config.place.slug,
      name: config.place.name,
      title: config.place.title,
      neighborhood: config.place.neighborhood,
      address: config.place.address,
      lat: config.place.lat,
      lng: config.place.lng,
      cost: config.cost,
      costPerPersonCents: config.amountCents,
      costLabel: config.costLabel,
      payUpFront: config.payUpFront,
      priceVerified: true,
      energy: "chill",
      needsDaylight: true,
      durationMinutes: 60,
      meetSpot: config.place.meetSpot,
      tags: ["outdoors", "goldenHour"],
      hours: [{ day: 0, open: 0, close: 1440 }],
      bestTime: "goldenHour",
      indoor: false,
      sober: true,
      source: "seed",
    });
    const plan = await ctx.db.insert("plans", {
      groupId: group,
      day: config.day,
      kind: "daily",
      placeId: place,
      title: config.title,
      line: config.line,
      why: config.why,
      cost: config.cost,
      costLabel: config.costLabel,
      payUpFront: config.payUpFront,
      chips: ["golden hour", "walkable"],
      startsAt: config.startsAt,
      durationMinutes: 60,
      source: "fallback",
      generatedAt: config.window.start,
      whySource: "template",
      whyInputs: { placeName: config.place.name, topTags: ["outdoors"], rainSwap: false },
      weatherSwap: false,
    });
    const frolic = await ctx.db.insert("frolics", {
      groupId: group,
      day: config.day,
      kind: "daily",
      planId: plan,
      status: "open",
      window: config.window,
      durationMinutes: 60,
      deadline: config.deadline,
      startsAt: config.startsAt,
    });
    const invite = await ctx.db.insert("invites", { code: INVITE_CODE, groupId: group, createdBy: maya, kind: "group", revoked: false });
    if (!samJoins) await ctx.db.insert("keikiLinks", { phone: SAM_PHONE, userId: sam, paused: false, linkedAt: config.window.start });
    await ctx.db.insert("keikiLinks", { phone: ANA_PHONE, userId: ana, paused: false, linkedAt: config.window.start });
    if (config.amountCents > 0) {
      await ctx.db.insert("whopPlans", {
        frolicId: frolic,
        whopProductId: "prod_test",
        whopPlanId: "plan_test",
        amountCents: config.amountCents,
        currency: "usd",
        createdAt: config.window.start,
      });
    }
    return { maya, dev, sam, ana, group, place, plan, frolic, invite };
  });
  return {
    now: config.now,
    variant,
    day: config.day,
    title: config.title,
    coords: { lat: config.place.lat, lng: config.place.lng },
    groupId: ids.group,
    mayaId: ids.maya,
    devId: ids.dev,
    samId: ids.sam,
    anaId: ids.ana,
    placeId: ids.place,
    planId: ids.plan,
    frolicId: ids.frolic,
    inviteId: ids.invite,
  };
}

export async function linkPhone(t: T, userId: Id<"users">, phone: string, paused = false) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("keikiLinks")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!existing) await ctx.db.insert("keikiLinks", { phone, userId, paused, linkedAt: 0 });
  });
}

export async function linkChat(t: T, groupId: Id<"groups">, chatId: string) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("keikiGroupChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (!existing) await ctx.db.insert("keikiGroupChats", { chatId, groupId, linkedAt: 0 });
  });
}

export async function seat(t: T, frolicId: Id<"frolics">, groupId: Id<"groups">, userIds: Id<"users">[], revealAt: number) {
  await t.run(async (ctx) => {
    for (const userId of userIds) {
      await ctx.db.insert("attendees", {
        frolicId,
        groupId,
        userId,
        role: "matched",
        status: "going",
        revealAt,
        bloomAt: revealAt + 800,
      });
    }
  });
}

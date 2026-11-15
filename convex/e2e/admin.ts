import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { hashToken } from "../lib/identity";
import { PLACE_BY_SLUG, type Place, type Span } from "../places/data";
import { isOpenFor, timeOfDay } from "../plans/engine";
import { clockLabel, solarTimes } from "../plans/time";
import { CAMPUS, tripLabel, tripTo } from "../plans/travel";
import { addMember, createGroupFor } from "../users";

const ZONE = "America/Los_Angeles";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const BATCH = 100;
const MAX_BATCHES = 50;
const SLOT = 5 * MINUTE;
const PLAN_LEAD = 45 * MINUTE;
const PREFERRED_HOUR = 16;
const PREFERRED_MINUTE = 30;
const INDIAN_ROCK = "indian-rock";
const KAYAKS = "berkeley-marina-kayaks";

const seededUser = v.object({
  userId: v.id("users"),
  deviceToken: v.string(),
  link: v.string(),
});

function zonedParts(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour") % 24,
    minute: pick("minute"),
    second: pick("second"),
  };
}

function offsetAt(utcMs: number, timeZone: string): number {
  const p = zonedParts(utcMs, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

function dayInZone(utcMs: number, timeZone: string): string {
  const p = zonedParts(utcMs, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function instantInZone(day: string, hour: number, minute: number, timeZone: string): number {
  const [year, month, date] = day.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, date, hour, minute, 0);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date) + days * 24 * HOUR).toISOString().slice(0, 10);
}

function weekdayOf(day: string): number {
  return new Date(day + "T00:00:00Z").getUTCDay();
}

function spanOf(place: Place, day: string): Span | null {
  return place.hours[weekdayOf(day)][0] ?? null;
}

function closesAt(place: Place, day: string): number | null {
  const span = spanOf(place, day);
  if (!span) return null;
  return instantInZone(day, 0, 0, ZONE) + span[1] * MINUTE;
}

function startsAtFor(now: number, place: Place, day: string): number {
  const preferred = instantInZone(day, PREFERRED_HOUR, PREFERRED_MINUTE, ZONE);
  const lead = Math.ceil((now + PLAN_LEAD) / SLOT) * SLOT;
  const span = spanOf(place, day);
  if (!span) return Math.max(preferred, lead);
  const open = instantInZone(day, 0, 0, ZONE) + span[0] * MINUTE;
  const latest = instantInZone(day, 0, 0, ZONE) + span[1] * MINUTE - place.durationMin * MINUTE;
  if (latest <= open) return preferred;
  return Math.max(open, Math.min(latest, Math.max(preferred, lead)));
}

function titleFor(place: Place, start: number, sunsetMs: number): string {
  return place.titles?.[timeOfDay(start, sunsetMs)] ?? place.title;
}

function lineFor(place: Place, start: number, sunsetMs: number, day: string): string {
  const hook = place.tip.charAt(0).toUpperCase() + place.tip.slice(1) + ".";
  const parts = [hook];
  if (start < sunsetMs) parts.push("Sunset at " + clockLabel(sunsetMs) + ".");
  const close = closesAt(place, day);
  if (close !== null) parts.push("Open until " + clockLabel(close) + ".");
  parts.push(tripLabel(tripTo(CAMPUS, place)) + ".");
  return parts.join(" ");
}

function chipsFor(place: Place, start: number, sunsetMs: number, day: string): string[] {
  const trip = tripLabel(tripTo(CAMPUS, place));
  const golden = start >= sunsetMs - 90 * MINUTE && start <= sunsetMs;
  const close = closesAt(place, day);
  const third = golden
    ? "Golden hour " + clockLabel(sunsetMs - 30 * MINUTE)
    : start < sunsetMs
      ? "Sunset " + clockLabel(sunsetMs)
      : close !== null
        ? "Open until " + clockLabel(close)
        : trip;
  return [place.costLabel, trip, third];
}

function deviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function drain<T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  read: () => Promise<Doc<T>[]>,
): Promise<number> {
  let cleared = 0;
  for (let pass = 0; pass < MAX_BATCHES; pass++) {
    const rows = await read();
    if (rows.length === 0) break;
    for (const row of rows) await ctx.db.delete(table, row._id);
    cleared += rows.length;
    if (rows.length < BATCH) break;
  }
  return cleared;
}

async function clearFrolic(ctx: MutationCtx, frolicId: Id<"frolics">): Promise<number> {
  let cleared = 0;
  for (let pass = 0; pass < MAX_BATCHES; pass++) {
    const pending = await ctx.db
      .query("reveals")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
      .take(BATCH);
    if (pending.length === 0) break;
    for (const row of pending) {
      await ctx.scheduler.cancel(row.scheduledId);
      await ctx.db.delete("reveals", row._id);
    }
    cleared += pending.length;
    if (pending.length < BATCH) break;
  }
  cleared += await drain(ctx, "taps", () =>
    ctx.db.query("taps").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "attendees", () =>
    ctx.db.query("attendees").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "hopIns", () =>
    ctx.db.query("hopIns").withIndex("by_frolicId_and_status", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "revealLog", () =>
    ctx.db.query("revealLog").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "checkins", () =>
    ctx.db.query("checkins").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "etas", () =>
    ctx.db.query("etas").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "shares", () =>
    ctx.db.query("shares").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "whopPlans", () =>
    ctx.db.query("whopPlans").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "collages", () =>
    ctx.db.query("collages").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "fundLedger", () =>
    ctx.db.query("fundLedger").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  cleared += await drain(ctx, "keikiOutbox", () =>
    ctx.db.query("keikiOutbox").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(BATCH),
  );
  return cleared;
}

async function drainContainer(ctx: MutationCtx, containerTag: string): Promise<number> {
  let cleared = 0;
  cleared += await drain(ctx, "memoryOutbox", () =>
    ctx.db
      .query("memoryOutbox")
      .withIndex("by_containerTag", (q) => q.eq("containerTag", containerTag))
      .take(BATCH),
  );
  cleared += await drain(ctx, "memoryContainers", () =>
    ctx.db
      .query("memoryContainers")
      .withIndex("by_containerTag", (q) => q.eq("containerTag", containerTag))
      .take(BATCH),
  );
  return cleared;
}

async function clearRun(ctx: MutationCtx, run: string): Promise<number> {
  let cleared = 0;
  for (let pass = 0; pass < MAX_BATCHES; pass++) {
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_e2eRun", (q) => q.eq("e2eRun", run))
      .take(BATCH);
    if (groups.length === 0) break;
    for (const group of groups) {
      for (let frolicPass = 0; frolicPass < MAX_BATCHES; frolicPass++) {
        const frolics = await ctx.db
          .query("frolics")
          .withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id))
          .take(BATCH);
        if (frolics.length === 0) break;
        for (const frolic of frolics) {
          cleared += await clearFrolic(ctx, frolic._id);
          await ctx.db.delete("frolics", frolic._id);
          cleared++;
        }
        if (frolics.length < BATCH) break;
      }
      cleared += await drain(ctx, "snaps", () =>
        ctx.db.query("snaps").withIndex("by_groupId", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "revealLog", () =>
        ctx.db.query("revealLog").withIndex("by_groupId", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "plans", () =>
        ctx.db.query("plans").withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "availability", () =>
        ctx.db.query("availability").withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "invites", () =>
        ctx.db.query("invites").withIndex("by_groupId_and_kind", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "fundLedger", () =>
        ctx.db.query("fundLedger").withIndex("by_groupId", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "memoryEvents", () =>
        ctx.db.query("memoryEvents").withIndex("by_groupId_and_kind", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "memoryTagStats", () =>
        ctx.db.query("memoryTagStats").withIndex("by_groupId_and_tag", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "memoryContextCache", () =>
        ctx.db.query("memoryContextCache").withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "keikiGroupChats", () =>
        ctx.db.query("keikiGroupChats").withIndex("by_groupId", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "gardenNudges", () =>
        ctx.db.query("gardenNudges").withIndex("by_groupId", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "tasteProfiles", () =>
        ctx.db.query("tasteProfiles").withIndex("by_groupId", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "dailyPicks", () =>
        ctx.db.query("dailyPicks").withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "dailyPickAnswers", () =>
        ctx.db.query("dailyPickAnswers").withIndex("by_groupId_and_day_and_userId", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drain(ctx, "planRuns", () =>
        ctx.db.query("planRuns").withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id)).take(BATCH),
      );
      cleared += await drainContainer(ctx, "frolic_g_" + group._id);
      for (let memberPass = 0; memberPass < MAX_BATCHES; memberPass++) {
        const memberships = await ctx.db
          .query("memberships")
          .withIndex("by_groupId", (q) => q.eq("groupId", group._id))
          .take(BATCH);
        if (memberships.length === 0) break;
        for (const membership of memberships) {
          await ctx.db.delete("memberships", membership._id);
          cleared++;
          const remaining = await ctx.db
            .query("memberships")
            .withIndex("by_userId", (q) => q.eq("userId", membership.userId))
            .take(1);
          if (remaining.length === 0) {
            cleared += await drain(ctx, "limits", () =>
              ctx.db.query("limits").withIndex("by_userId", (q) => q.eq("userId", membership.userId)).take(BATCH),
            );
            cleared += await drain(ctx, "keikiLinks", () =>
              ctx.db.query("keikiLinks").withIndex("by_userId", (q) => q.eq("userId", membership.userId)).take(BATCH),
            );
            cleared += await drain(ctx, "memoryEvents", () =>
              ctx.db.query("memoryEvents").withIndex("by_userId", (q) => q.eq("userId", membership.userId)).take(BATCH),
            );
            cleared += await drain(ctx, "dailyPickAnswers", () =>
              ctx.db.query("dailyPickAnswers").withIndex("by_userId", (q) => q.eq("userId", membership.userId)).take(BATCH),
            );
            cleared += await drainContainer(ctx, "frolic_p_" + membership.userId);
            await ctx.db.delete("users", membership.userId);
            cleared++;
          }
        }
        if (memberships.length < BATCH) break;
      }
      await ctx.db.delete("groups", group._id);
      cleared++;
    }
    if (groups.length < BATCH) break;
  }
  return cleared;
}

async function upsertPlace(
  ctx: MutationCtx,
  place: Omit<Doc<"places">, "_id" | "_creationTime">,
): Promise<Id<"places">> {
  const existing = await ctx.db
    .query("places")
    .withIndex("by_slug", (q) => q.eq("slug", place.slug))
    .unique();
  if (existing) {
    await ctx.db.replace("places", existing._id, place);
    return existing._id;
  }
  return await ctx.db.insert("places", place);
}

async function catalogPlace(ctx: MutationCtx, slug: string): Promise<Doc<"places">> {
  const place = PLACE_BY_SLUG.get(slug);
  if (!place) throw new ConvexError({ code: "NO_PLACE", message: "No catalog place for " + slug });
  const stored = await ctx.db
    .query("places")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (stored && stored.title === place.title && stored.blurb === place.fallbackWhy) return stored;
  await ctx.runMutation(internal.places.seed.seedPlaces, {});
  const refreshed = await ctx.db
    .query("places")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!refreshed) throw new ConvexError({ code: "NO_PLACE", message: "No stored place for " + slug });
  return refreshed;
}

async function upsertPlan(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  day: string,
  plan: Omit<Doc<"plans">, "_id" | "_creationTime" | "groupId" | "day">,
): Promise<Id<"plans">> {
  const existing = await ctx.db
    .query("plans")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day))
    .take(10);
  const same = existing.find((row) => row.title === plan.title);
  const doc = { ...plan, groupId, day };
  if (same) {
    await ctx.db.replace("plans", same._id, doc);
    return same._id;
  }
  return await ctx.db.insert("plans", doc);
}

export const reset = internalMutation({
  args: { run: v.string() },
  returns: v.object({ cleared: v.number() }),
  handler: async (ctx, { run }) => {
    const cleared = await clearRun(ctx, run);
    return { cleared };
  },
});

export const seed = internalMutation({
  args: {
    run: v.string(),
    scenario: v.optional(v.union(v.literal("three-phone"), v.literal("demo"))),
  },
  returns: v.object({
    run: v.string(),
    groupId: v.id("groups"),
    inviteCode: v.string(),
    frolicId: v.id("frolics"),
    deadline: v.number(),
    plan: v.object({
      title: v.string(),
      line: v.string(),
      chips: v.array(v.string()),
      startsAt: v.number(),
    }),
    users: v.object({
      maya: seededUser,
      dev: seededUser,
      jordan: seededUser,
      priya: seededUser,
    }),
    reveal_at: v.null(),
  }),
  handler: async (ctx, args) => {
    await clearRun(ctx, args.run);
    const now = Date.now();
    const today = dayInZone(now, ZONE);
    const tokens: Record<string, string> = {};
    const ids: Record<string, Id<"users">> = {};
    for (const name of ["Maya", "Dev", "Jordan", "Priya"]) {
      const token = deviceToken();
      tokens[name] = token;
      ids[name] = await ctx.db.insert("users", {
        name,
        tokenHash: await hashToken(token),
        source: "app",
        avatarUrl: `/p/avatar/${name.toLowerCase()}.jpg`,
      });
    }
    const { groupId, inviteCode } = await createGroupFor(ctx, ids.Maya, "Sunset Crew", ZONE, args.run, args.scenario === "demo" ? true : undefined);
    for (const name of ["Dev", "Jordan", "Priya"]) await addMember(ctx, groupId, ids[name], "invite");

    const rock = await catalogPlace(ctx, INDIAN_ROCK);
    const rockPlace = PLACE_BY_SLUG.get(INDIAN_ROCK)!;
    const { sunsetMs } = solarTimes(today);
    const startsAt = startsAtFor(now, rockPlace, today);
    if (!isOpenFor(rockPlace, startsAt, rockPlace.durationMin)) {
      throw new ConvexError({ code: "PLACE_CLOSED", message: "Indian Rock is not open at the seeded hour" });
    }
    const indianRockPlan = await upsertPlan(ctx, groupId, today, {
      kind: "daily",
      placeId: rock._id,
      title: titleFor(rockPlace, startsAt, sunsetMs),
      line: lineFor(rockPlace, startsAt, sunsetMs, today),
      why: rockPlace.fallbackWhy,
      cost: rockPlace.costPerPersonCents / 100,
      startsAt,
      durationMinutes: rockPlace.durationMin,
      meetingPoint: { lat: rockPlace.lat, lng: rockPlace.lng, label: rockPlace.meetSpot },
      sunsetAt: sunsetMs,
      source: "fallback",
      generatedAt: now,
      costLabel: rockPlace.costLabel,
      payUpFront: rockPlace.payUpFront,
      chips: chipsFor(rockPlace, startsAt, sunsetMs, today),
      whySource: "template",
      whyInputs: {
        placeName: rockPlace.name,
        memory: undefined,
        topTags: rockPlace.tags.slice(0, 2),
        weather: undefined,
        tempF: undefined,
        sunsetAt: sunsetMs,
        rainSwap: false,
      },
      weatherSwap: false,
    });

    const deadline = now + 3 * HOUR;
    const frolicId: Id<"frolics"> = await ctx.runMutation(internal.frolics.open, {
      groupId,
      day: today,
      kind: "daily",
      planId: indianRockPlan,
      window: { start: startsAt - 2 * HOUR, end: startsAt + rockPlace.durationMin * MINUTE + 3 * HOUR },
      durationMinutes: rockPlace.durationMin,
      deadline,
    });

    await ctx.db.insert("availability", {
      groupId,
      userId: ids.Priya,
      day: today,
      state: "window",
      window: {
        start: startsAt - 15 * MINUTE,
        end: startsAt + 3 * HOUR,
      },
      updatedAt: now,
    });

    if (args.scenario === "demo") {
      if (ids.Dev) await ctx.db.insert("availability", { groupId, userId: ids.Dev, day: today, state: "now", minutesAway: 12, updatedAt: now });
      if (ids.Jordan) {
        await ctx.db.insert("availability", {
          groupId,
          userId: ids.Jordan,
          day: today,
          state: "window",
          window: { start: startsAt - 30 * MINUTE, end: startsAt + 3 * HOUR },
          updatedAt: now,
        });
      }
      await seedDemo(ctx, groupId, today, now);
    }

    const link = (name: string) =>
      `frolic://signin?deviceToken=${tokens[name]}&groupId=${groupId}`;
    return {
      run: args.run,
      groupId,
      inviteCode,
      frolicId,
      deadline,
      plan: {
        title: titleFor(rockPlace, startsAt, sunsetMs),
        line: lineFor(rockPlace, startsAt, sunsetMs, today),
        chips: chipsFor(rockPlace, startsAt, sunsetMs, today),
        startsAt,
      },
      users: {
        maya: { userId: ids.Maya, deviceToken: tokens.Maya, link: link("Maya") },
        dev: { userId: ids.Dev, deviceToken: tokens.Dev, link: link("Dev") },
        jordan: { userId: ids.Jordan, deviceToken: tokens.Jordan, link: link("Jordan") },
        priya: { userId: ids.Priya, deviceToken: tokens.Priya, link: link("Priya") },
      },
      reveal_at: null,
    };
  },
});

async function seedDemo(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  today: string,
  now: number,
): Promise<void> {
  const day = addDays(today, 1);
  const kayaks = await upsertPlace(ctx, {
    slug: KAYAKS,
    name: "Cal Adventures",
    neighborhood: "Berkeley Marina",
    title: "Kayaks at the Marina",
    address: "124 University Ave, Berkeley, CA 94710",
    lat: 37.8654,
    lng: -122.3141,
    cost: 8,
    costPerPersonCents: 800,
    costLabel: "$8 each",
    payUpFront: true,
    priceVerified: false,
    tags: ["water", "outdoors", "kayak"],
    hours: [],
    bestTime: "daytime",
    indoor: false,
    sober: true,
    energy: "active",
    needsDaylight: true,
    durationMinutes: 120,
    meetSpot: "The Cal Adventures boat ramp",
    blurb: "Two hours on the bay with the marina to yourselves.",
    capacity: 6,
    source: "https://recwell.berkeley.edu/facilities/uc-aquatic-center-at-the-berkeley-marina/",
  });
  const kayakPlanId = await upsertPlan(ctx, groupId, day, {
    kind: "daily",
    placeId: kayaks,
    title: "Kayaks at the Marina",
    line: "Paddle out before noon, the afternoon wind picks up.",
    why: "Dev's been asking for something on the water, and it fits everyone's budget.",
    cost: 8,
    startsAt: instantInZone(day, 11, 0, ZONE),
    durationMinutes: 120,
    meetingPoint: { lat: 37.8654, lng: -122.3141, label: "The Cal Adventures boat ramp" },
    source: "fallback",
    generatedAt: now,
    costLabel: "$8 each",
    payUpFront: true,
    chips: ["$8 each", "2 hours", "Calm before noon"],
    whySource: "template",
    whyInputs: {
      placeName: "Cal Adventures",
      memory: undefined,
      topTags: ["water", "outdoors"],
      weather: undefined,
      tempF: undefined,
      sunsetAt: undefined,
      rainSwap: false,
    },
    weatherSwap: false,
  });
  await seedPast(ctx, groupId, today, kayakPlanId);
}

const PAST = [
  { slug: "indian-rock", ago: 2, hour: 16, title: "Sunset at Indian Rock", line: "The whole bay lit up from the top of the rock.", going: 4 },
  { slug: "codornices-slide", ago: 5, hour: 14, title: "The Codornices slide", line: "Cardboard makes it twice as fast.", going: 3 },
  { slug: "kingpin-donuts", ago: 9, hour: 22, title: "Late donuts at Kingpin", line: "Warm glazed, straight from the rack.", going: 2 },
];

async function seedPast(ctx: MutationCtx, groupId: Id<"groups">, today: string, templateId: Id<"plans">): Promise<void> {
  const template = await ctx.db.get("plans", templateId);
  if (!template) return;
  const members = await ctx.db
    .query("memberships")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .take(10);
  const { _id, _creationTime, groupId: _g, day: _d, ...base } = template;
  for (const past of PAST) {
    const day = addDays(today, -past.ago);
    const existing = await ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day))
      .first();
    if (existing) continue;
    const place = await ctx.db
      .query("places")
      .withIndex("by_slug", (q) => q.eq("slug", past.slug))
      .unique();
    if (!place) continue;
    const start = instantInZone(day, past.hour, 0, ZONE);
    const planId = await upsertPlan(ctx, groupId, day, {
      ...base,
      placeId: place._id,
      title: past.title,
      line: past.line,
      why: place.blurb ?? base.why,
      cost: place.costPerPersonCents / 100,
      costLabel: place.costLabel,
      payUpFront: place.payUpFront,
      chips: [place.costLabel],
      startsAt: start,
      durationMinutes: 60,
    });
    const revealAt = start - 3 * HOUR;
    const frolicId = await ctx.db.insert("frolics", {
      groupId,
      day,
      kind: "daily",
      planId,
      status: "done",
      window: { start, end: start + 2 * HOUR },
      durationMinutes: 60,
      deadline: revealAt,
      matchedAt: revealAt,
      revealAt,
      bloomAt: revealAt,
      startsAt: start,
      endsAt: start + HOUR,
      origin: "daily",
    });
    for (const member of members.slice(0, past.going)) {
      await ctx.db.insert("attendees", {
        frolicId,
        groupId,
        userId: member.userId,
        role: "matched",
        status: "going",
        revealAt,
        bloomAt: revealAt,
      });
    }
  }
}

export const advance = internalMutation({
  args: { run: v.string() },
  returns: v.union(v.null(), v.id("frolics")),
  handler: async (ctx, { run }) => {
    const group = await ctx.db
      .query("groups")
      .withIndex("by_e2eRun", (q) => q.eq("e2eRun", run))
      .first();
    if (!group) return null;
    const kayaks = await ctx.db
      .query("places")
      .withIndex("by_slug", (q) => q.eq("slug", KAYAKS))
      .unique();
    if (!kayaks) return null;
    const plans = await ctx.db
      .query("plans")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id))
      .take(20);
    const plan = plans.find((row) => row.placeId === kayaks._id);
    if (!plan) return null;
    const now = Date.now();
    const today = dayInZone(now, ZONE);
    const sameDay = await ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id).eq("day", today))
      .take(10);
    const already = sameDay.find((row) => row.planId === plan._id);
    if (already) return already._id;
    for (const row of sameDay) await ctx.db.delete("frolics", row._id);
    const frolicId: Id<"frolics"> = await ctx.runMutation(internal.frolics.open, {
      groupId: group._id,
      day: today,
      kind: "daily",
      planId: plan._id,
      window: { start: now, end: now + 8 * HOUR },
      durationMinutes: 120,
      deadline: now + 3 * HOUR,
      capacity: 6,
    });
    return frolicId;
  },
});

export const revealLog = internalQuery({
  args: { run: v.string() },
  returns: v.array(
    v.object({
      frolicId: v.id("frolics"),
      userId: v.id("users"),
      name: v.string(),
      reveal_at: v.number(),
      bloom_at: v.number(),
      delivered_at: v.number(),
    }),
  ),
  handler: async (ctx, { run }) => {
    const group = await ctx.db
      .query("groups")
      .withIndex("by_e2eRun", (q) => q.eq("e2eRun", run))
      .first();
    if (!group) return [];
    const rows = await ctx.db
      .query("revealLog")
      .withIndex("by_groupId", (q) => q.eq("groupId", group._id))
      .take(50);
    const out = [];
    for (const row of rows) {
      const user = await ctx.db.get("users", row.userId);
      out.push({
        frolicId: row.frolicId,
        userId: row.userId,
        name: user?.name ?? "",
        reveal_at: row.revealAt,
        bloom_at: row.bloomAt,
        delivered_at: row.flippedAt,
      });
    }
    return out.sort((a, b) => a.reveal_at - b.reveal_at);
  },
});

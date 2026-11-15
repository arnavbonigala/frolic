import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { templateCopy } from "./ai/copy";
import { requireMember, userFromToken } from "./lib/identity";
import { photoUrlOf } from "./lib/photo";
import { decodeTasteLine } from "./memory/read";
import { templateTaste } from "./memory/taste";
import { HERO_KEYS, PLACE_BY_SLUG, heroKeyFor } from "./places/data";
import { dateLabel, localParts } from "./plans/time";
import { flowerColor } from "./schema";

const heroKeyValue = v.union(...HERO_KEYS.map((k) => v.literal(k)), v.null());

const person = v.object({
  userId: v.id("users"),
  name: v.string(),
  color: flowerColor,
  photoUrl: v.union(v.string(), v.null()),
});

const MAX_MEMORIES = 30;

async function placeFor(ctx: QueryCtx, frolic: Doc<"frolics">) {
  const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
  const place = plan ? await ctx.db.get("places", plan.placeId) : null;
  const known = place ? PLACE_BY_SLUG.get(place.slug) : undefined;
  return { plan, place, heroKey: known ? heroKeyFor(known) : place ? ("plan-free-stuff" as const) : null };
}

async function goingPeople(ctx: QueryCtx, frolic: Doc<"frolics">, viewer: Id<"users">) {
  const attendees = await ctx.db
    .query("attendees")
    .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
    .take(100);
  const people = [];
  let viewerWent = false;
  for (const a of attendees) {
    if (a.status !== "going") continue;
    if (a.userId === viewer) {
      viewerWent = true;
      continue;
    }
    const user = await ctx.db.get("users", a.userId);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", frolic.groupId).eq("userId", a.userId))
      .unique();
    if (!user || !membership) continue;
    people.push({ userId: user._id, name: user.name, color: membership.color, photoUrl: await photoUrlOf(ctx, user) });
  }
  return { people, viewerWent };
}

function dateLine(frolic: Doc<"frolics">): string {
  const today = localParts(Date.now()).day;
  return frolic.day === today ? "Today" : dateLabel(frolic.day);
}

async function fundLineFor(ctx: QueryCtx, frolicId: Id<"frolics">): Promise<string | null> {
  const entries = await ctx.db.query("fundLedger").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(50);
  const cents = entries.filter((e) => e.entry === "payout").reduce((sum, e) => sum + Math.abs(e.amountCents), 0);
  if (cents === 0) return null;
  const dollars = "$" + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  return "The Frolic Fund covered " + dollars + " of this one.";
}

export const overview = query({
  args: { deviceToken: v.string(), groupId: v.id("groups") },
  returns: v.object({
    groupName: v.string(),
    youWent: v.boolean(),
    count: v.number(),
    sinceLine: v.string(),
    weekLine: v.string(),
    taste: v.object({ headline: v.string(), why: v.string() }),
    fund: v.union(v.object({ line: v.string(), frolicTitle: v.string() }), v.null()),
    memories: v.array(
      v.object({
        frolicId: v.id("frolics"),
        title: v.string(),
        dateLine: v.string(),
        heroKey: heroKeyValue,
        photoUrl: v.union(v.string(), v.null()),
        youWent: v.boolean(),
        going: v.array(person),
      }),
    ),
  }),
  handler: async (ctx, { deviceToken, groupId }) => {
    const user = await userFromToken(ctx, deviceToken);
    await requireMember(ctx, groupId, user._id);
    const group = await ctx.db.get("groups", groupId);
    if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "This crew is gone" });
    const rows = await ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId))
      .order("desc")
      .take(MAX_MEMORIES * 2);
    const memories = [];
    let fund: { line: string; frolicTitle: string } | null = null;
    for (const frolic of rows) {
      if (frolic.status !== "on" && frolic.status !== "done") continue;
      const { people, viewerWent } = await goingPeople(ctx, frolic, user._id);
      if (people.length === 0 && !viewerWent) continue;
      const { plan, heroKey } = await placeFor(ctx, frolic);
      const snap = await ctx.db.query("snaps").withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id)).first();
      const photoUrl = snap ? await ctx.storage.getUrl(snap.storageId) : null;
      const title = plan?.title ?? "A frolic";
      if (!fund) {
        const line = await fundLineFor(ctx, frolic._id);
        if (line) fund = { line, frolicTitle: title };
      }
      memories.push({ frolicId: frolic._id, title, dateLine: dateLine(frolic), heroKey, photoUrl, youWent: viewerWent, going: people });
      if (memories.length === MAX_MEMORIES) break;
    }
    const mine = memories.filter((m) => m.youWent).length;
    const profile = await ctx.db.query("tasteProfiles").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).unique();
    const stored = decodeTasteLine(profile?.card);
    const line = stored ?? templateTaste(profile?.tags ?? [], []);
    return {
      groupName: group.name,
      youWent: mine > 0,
      count: memories.length,
      sinceLine: mine === 0 ? "all before you joined" : memories.length === mine ? mine + " with you" : memories.length - mine + " before you, " + mine + " with you",
      weekLine: line.why.charAt(0).toLowerCase() + line.why.slice(1),
      taste: { headline: line.headline, why: line.why },
      fund,
      memories,
    };
  },
});

export const memory = query({
  args: { deviceToken: v.string(), frolicId: v.id("frolics") },
  returns: v.object({
    frolicId: v.id("frolics"),
    title: v.string(),
    dateLine: v.string(),
    caption: v.union(v.string(), v.null()),
    heroKey: heroKeyValue,
    place: v.union(v.object({ name: v.string(), heroKey: heroKeyValue }), v.null()),
    fundLine: v.union(v.string(), v.null()),
    going: v.array(person),
    photos: v.array(v.object({ url: v.string(), caption: v.union(v.string(), v.null()) })),
  }),
  handler: async (ctx, { deviceToken, frolicId }) => {
    const user = await userFromToken(ctx, deviceToken);
    const frolic = await ctx.db.get("frolics", frolicId);
    if (!frolic) throw new ConvexError({ code: "NOT_FOUND", message: "That frolic is gone" });
    const membership = await requireMember(ctx, frolic.groupId, user._id);
    const { people, viewerWent } = await goingPeople(ctx, frolic, user._id);
    const { plan, place, heroKey } = await placeFor(ctx, frolic);
    const me = await ctx.db.get("users", user._id);
    const going = viewerWent && me
      ? [{ userId: me._id, name: "You", color: membership.color, photoUrl: await photoUrlOf(ctx, me) }, ...people]
      : people;
    const snaps = await ctx.db.query("snaps").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(20);
    const photos = [];
    for (const snap of snaps.sort((a, b) => a.takenAt - b.takenAt)) {
      const url = await ctx.storage.getUrl(snap.storageId);
      if (url) photos.push({ url, caption: null });
    }
    const placeName = place?.name ?? plan?.title ?? "the park";
    const copy = templateCopy({ kind: "gardenCaption", placeName, date: frolic.day, people: going.length, memory: null });
    return {
      frolicId,
      title: plan?.title ?? "A frolic",
      dateLine: dateLine(frolic),
      caption: copy.kind === "gardenCaption" ? copy.text : null,
      heroKey,
      place: place ? { name: place.name, heroKey } : null,
      fundLine: await fundLineFor(ctx, frolicId),
      going,
      photos,
    };
  },
});

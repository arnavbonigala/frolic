import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { templateCopy } from "./ai/copy";
import { heroKeyOf } from "./lib/heroArt";
import { requireMember, userFromToken } from "./lib/identity";
import { photoUrlOf } from "./lib/photo";
import { decodeTasteLine } from "./memory/read";
import { templateTaste } from "./memory/taste";
import { flowerColor } from "./schema";

const MAX_MEMORIES = 30;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const person = v.object({
  userId: v.id("users"),
  name: v.string(),
  color: flowerColor,
  photoUrl: v.union(v.string(), v.null()),
});

const memoryCard = v.object({
  frolicId: v.id("frolics"),
  title: v.string(),
  dateLine: v.string(),
  heroKey: v.union(v.string(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
  youWent: v.boolean(),
  going: v.array(person),
});

function dayIn(timezone: string, at: number): string {
  const options = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  try {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: timezone }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "America/Los_Angeles" }).format(at);
  }
}

function dateLineFor(day: string, timezone: string, now: number): string {
  if (day === dayIn(timezone, now)) return "Today";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

function captionFor(placeName: string, day: string, people: number): string {
  const copy = templateCopy({ kind: "gardenCaption", placeName, date: day, people, memory: null });
  return copy.kind === "gardenCaption" ? copy.text : "";
}

function dollars(cents: number): string {
  const value = Math.abs(cents) / 100;
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

type MemoryRow = {
  frolic: Doc<"frolics">;
  plan: Doc<"plans"> | null;
  place: Doc<"places"> | null;
  going: Doc<"attendees">[];
  snaps: Doc<"snaps">[];
  collage: Doc<"collages"> | null;
};

async function memoryRows(
  ctx: QueryCtx,
  groupId: Id<"groups">,
): Promise<MemoryRow[]> {
  const frolics = await ctx.db
    .query("frolics")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId))
    .order("desc")
    .take(60);
  const rows: MemoryRow[] = [];
  for (const frolic of frolics) {
    if (frolic.status !== "on" && frolic.status !== "done") continue;
    const attendees = await ctx.db
      .query("attendees")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
      .take(50);
    const going = attendees.filter((a) => a.status === "going");
    if (going.length === 0) continue;
    const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
    const place = plan ? await ctx.db.get("places", plan.placeId) : null;
    const snaps = await ctx.db
      .query("snaps")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
      .take(50);
    const collage = await ctx.db
      .query("collages")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
      .first();
    rows.push({ frolic, plan, place, going, snaps, collage });
  }
  rows.sort((a, b) => {
    const left = a.frolic.startsAt ?? a.frolic.matchedAt ?? a.frolic._creationTime;
    const right = b.frolic.startsAt ?? b.frolic.matchedAt ?? b.frolic._creationTime;
    return right - left;
  });
  return rows.slice(0, MAX_MEMORIES);
}

async function people(
  ctx: QueryCtx,
  memberships: Doc<"memberships">[],
  userIds: Id<"users">[],
) {
  const out = [];
  for (const userId of userIds) {
    const membership = memberships.find((m) => m.userId === userId);
    const user = await ctx.db.get("users", userId);
    if (!membership || !user) continue;
    out.push({
      userId,
      name: user.name,
      color: membership.color,
      photoUrl: await photoUrlOf(ctx, user),
    });
  }
  return out;
}

export const overview = query({
  args: { deviceToken: v.string(), groupId: v.id("groups") },
  returns: v.object({
    groupName: v.string(),
    youWent: v.boolean(),
    count: v.number(),
    sinceLine: v.string(),
    weekLine: v.string(),
    taste: v.union(v.object({ headline: v.string(), why: v.string() }), v.null()),
    fund: v.union(v.object({ line: v.string(), frolicTitle: v.string() }), v.null()),
    memories: v.array(memoryCard),
  }),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "This crew is gone" });
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .take(100);
    const rows = await memoryRows(ctx, args.groupId);
    const now = Date.now();

    const memories = [];
    let mine = 0;
    let fund: { line: string; frolicTitle: string } | null = null;
    for (const row of rows) {
      const went = row.going.some((a) => a.userId === user._id);
      if (went) mine++;
      const newestSnap = row.snaps[row.snaps.length - 1];
      const seen = row.frolic.status === "done" || row.snaps.some((s) => s.userId === user._id);
      const photo = seen
        ? newestSnap
          ? await ctx.storage.getUrl(newestSnap.storageId)
          : row.collage
            ? await ctx.storage.getUrl(row.collage.storageId)
            : null
        : null;
      memories.push({
        frolicId: row.frolic._id,
        title: row.plan?.title ?? "A frolic",
        dateLine: dateLineFor(row.frolic.day, group.timezone, now),
        heroKey: row.place ? heroKeyOf(row.place.slug) : null,
        photoUrl: photo,
        youWent: went,
        going: await people(ctx, memberships, row.going.map((a) => a.userId)),
      });
      if (!fund) {
        const payout = await ctx.db
          .query("fundLedger")
          .withIndex("by_frolicId", (q) => q.eq("frolicId", row.frolic._id))
          .take(20);
        const covered = payout.find((entry) => entry.entry === "payout");
        if (covered) {
          fund = {
            line: `The Frolic Fund covered ${dollars(covered.amountCents)} of this one.`,
            frolicTitle: row.plan?.title ?? "A frolic",
          };
        }
      }
    }

    const tasteRow = await ctx.db
      .query("tasteProfiles")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .unique();
    const stored = decodeTasteLine(tasteRow?.card);
    const stats = await ctx.db
      .query("memoryTagStats")
      .withIndex("by_groupId_and_tag", (q) => q.eq("groupId", args.groupId))
      .take(200);
    const topTags = stats
      .filter((s) => s.liked > 0)
      .sort((a, b) => b.liked - a.liked)
      .slice(0, 3)
      .map((s) => s.tag);
    const line = stored ?? templateTaste(topTags, []);
    const taste = stored ? { headline: line.headline, why: line.why } : null;
    const weekLine = line.why.charAt(0).toLowerCase() + line.why.slice(1);
    const count = memories.length;

    return {
      groupName: group.name,
      youWent: mine > 0,
      count,
      sinceLine: mine === 0 ? "all before you joined" : `${count - mine} before you, ${mine} with you`,
      weekLine,
      taste,
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
    heroKey: v.union(v.string(), v.null()),
    place: v.union(v.object({ name: v.string(), heroKey: v.union(v.string(), v.null()) }), v.null()),
    fundLine: v.union(v.string(), v.null()),
    going: v.array(person),
    photos: v.array(v.object({ url: v.string(), caption: v.union(v.string(), v.null()) })),
  }),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    const frolic = await ctx.db.get("frolics", args.frolicId);
    if (!frolic) throw new ConvexError({ code: "NOT_FOUND", message: "This frolic is gone" });
    await requireMember(ctx, frolic.groupId, user._id);
    const group = await ctx.db.get("groups", frolic.groupId);
    if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "This crew is gone" });
    if (frolic.status !== "on" && frolic.status !== "done") {
      throw new ConvexError({ code: "NOT_FOUND", message: "This frolic did not happen" });
    }
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_groupId", (q) => q.eq("groupId", frolic.groupId))
      .take(100);
    const attendees = await ctx.db
      .query("attendees")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
      .take(50);
    const going = attendees.filter((a) => a.status === "going");
    const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
    const place = plan ? await ctx.db.get("places", plan.placeId) : null;
    const snaps = await ctx.db
      .query("snaps")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
      .order("asc")
      .take(50);
    const mineSnap = snaps.some((s) => s.userId === user._id);
    const visible = frolic.status === "done" || mineSnap ? snaps : [];
    const photos = [];
    for (const snap of visible) {
      const url = await ctx.storage.getUrl(snap.storageId);
      if (url) {
        photos.push({
          url,
          caption: captionFor(place?.name ?? "the park", frolic.day, going.length),
        });
      }
    }
    const payout = await ctx.db
      .query("fundLedger")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
      .take(20);
    const covered = payout.find((entry) => entry.entry === "payout");
    return {
      frolicId: frolic._id,
      title: plan?.title ?? "A frolic",
      dateLine: dateLineFor(frolic.day, group.timezone, Date.now()),
      caption: captionFor(place?.name ?? "the park", frolic.day, going.length),
      heroKey: place ? heroKeyOf(place.slug) : null,
      place: place ? { name: place.name, heroKey: heroKeyOf(place.slug) } : null,
      fundLine: covered ? `The Frolic Fund covered ${dollars(covered.amountCents)} of this one.` : null,
      going: await people(ctx, memberships, going.map((a) => a.userId)),
      photos,
    };
  },
});

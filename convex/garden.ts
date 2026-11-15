import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { GARDEN_NUDGE_TEXT, gardenNudge } from "./keiki/outbound";
import { addDays, daysBetween } from "./plans/time";
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

const BLOOM_SCAN = 200;
const NUDGE_HOUR = 17;

const VARIETIES = [
  { key: "goldenPoppy", name: "Golden poppy", hint: "Catch a sunset together", tags: ["sunsets"] },
  { key: "wildLupine", name: "Wild lupine", hint: "Get outside together", tags: ["outdoors", "hiking", "picnic", "nature", "water", "views"] },
  { key: "nightJasmine", name: "Night jasmine", hint: "Grab late-night food together", tags: ["late_night_food"] },
  { key: "sweetPea", name: "Sweet pea", hint: "Play a game together", tags: ["games", "play"] },
  { key: "daisy", name: "Daisy", hint: "Find something free together", tags: ["free"] },
  { key: "ranunculus", name: "Ranunculus", hint: "Book a Frolic Drop together", tags: [] },
] as const;

type VarietyKey = (typeof VARIETIES)[number]["key"];

const MILESTONES = [
  { key: "bench", at: 3, line: "3 frolics: the garden gets a bench" },
  { key: "path", at: 10, line: "10 frolics: the garden gets a winding path" },
  { key: "lights", at: 25, line: "25 frolics: the garden gets string lights" },
] as const;

const vVariety = v.union(
  v.literal("goldenPoppy"),
  v.literal("wildLupine"),
  v.literal("nightJasmine"),
  v.literal("sweetPea"),
  v.literal("daisy"),
  v.literal("ranunculus"),
);
const vMilestone = v.union(v.literal("bench"), v.literal("path"), v.literal("lights"));
type HealthState = "thriving" | "fine" | "thirsty" | "wilting";

const health = v.object({
  state: v.union(v.literal("thriving"), v.literal("fine"), v.literal("thirsty"), v.literal("wilting")),
  daysSince: v.number(),
  line: v.string(),
  cta: v.union(v.literal("imFree"), v.null()),
});

const collection = v.object({
  varieties: v.array(
    v.object({ key: vVariety, name: v.string(), count: v.number(), unlocked: v.boolean(), hint: v.union(v.string(), v.null()) }),
  ),
  flowers: v.array(v.object({ frolicId: v.id("frolics"), variety: v.union(vVariety, v.null()) })),
});

const milestone = v.object({
  reached: v.union(vMilestone, v.null()),
  next: v.union(vMilestone, v.null()),
  nextAt: v.union(v.number(), v.null()),
  line: v.string(),
});

type Bloom = { frolic: Doc<"frolics">; plan: Doc<"plans"> | null; place: Doc<"places"> | null };

async function bloomOf(ctx: QueryCtx, frolic: Doc<"frolics">): Promise<Bloom | null> {
  if (frolic.status !== "on" && frolic.status !== "done") return null;
  const attendees = await ctx.db
    .query("attendees")
    .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
    .take(50);
  if (attendees.filter((a) => a.status === "going").length < 2) return null;
  const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
  const place = plan ? await ctx.db.get("places", plan.placeId) : null;
  return { frolic, plan, place };
}

async function blooms(ctx: QueryCtx, groupId: Id<"groups">, newestOnly = false): Promise<Bloom[]> {
  const frolics = await ctx.db
    .query("frolics")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId))
    .order("desc")
    .take(BLOOM_SCAN);
  const out: Bloom[] = [];
  for (const frolic of frolics) {
    const bloom = await bloomOf(ctx, frolic);
    if (!bloom) continue;
    out.push(bloom);
    if (newestOnly) break;
  }
  return out;
}

export function varietyOf(bloom: Pick<Bloom, "plan" | "place">): VarietyKey | null {
  if (bloom.plan?.dropId) return "ranunculus";
  const tags = bloom.place?.tags ?? [];
  for (const variety of VARIETIES) {
    if (variety.tags.some((tag) => tags.includes(tag))) return variety.key;
  }
  if (bloom.plan && bloom.plan.cost === 0) return "daisy";
  return null;
}

export function healthFor(daysSince: number, planted: number) {
  const state: HealthState = daysSince <= 2 ? "thriving" : daysSince <= 4 ? "fine" : daysSince <= 7 ? "thirsty" : "wilting";
  const first = "Your first frolic plants the first flower";
  const lines: Record<HealthState, string> = {
    thriving: planted === 0 ? first : "Your garden is thriving",
    fine: planted === 0 ? first : "Your garden is doing fine",
    thirsty: "Your garden is getting thirsty. Anyone free?",
    wilting: "Your garden misses you",
  };
  return {
    state,
    daysSince,
    line: lines[state],
    cta: state === "thirsty" || state === "wilting" ? ("imFree" as const) : null,
  };
}

export function milestoneFor(count: number) {
  const reached = [...MILESTONES].reverse().find((m) => count >= m.at) ?? null;
  const next = MILESTONES.find((m) => count < m.at) ?? null;
  return {
    reached: reached?.key ?? null,
    next: next?.key ?? null,
    nextAt: next?.at ?? null,
    line: next ? next.line : "The garden has a bench, a winding path and string lights",
  };
}

function collectionFor(rows: Bloom[]) {
  const flowers = rows.map((row) => ({ frolicId: row.frolic._id, variety: varietyOf(row) }));
  return {
    varieties: VARIETIES.map((variety) => {
      const count = flowers.filter((f) => f.variety === variety.key).length;
      return { key: variety.key, name: variety.name, count, unlocked: count > 0, hint: count > 0 ? null : variety.hint };
    }),
    flowers,
  };
}

function gardenHealth(group: Doc<"groups">, newest: Bloom | null, planted: number, today: string) {
  const since = newest ? newest.frolic.day : dayIn(group.timezone, group._creationTime);
  return healthFor(Math.max(0, daysBetween(since, today)), planted);
}

function hourIn(timezone: string, at: number): number {
  const options = { hour: "numeric", hourCycle: "h23" } as const;
  try {
    return Number(new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone }).format(at));
  } catch {
    return Number(new Intl.DateTimeFormat("en-US", { ...options, timeZone: "America/Los_Angeles" }).format(at));
  }
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
  args: { deviceToken: v.string(), groupId: v.id("groups"), day: v.optional(v.string()) },
  returns: v.object({
    groupName: v.string(),
    youWent: v.boolean(),
    count: v.number(),
    sinceLine: v.string(),
    weekLine: v.string(),
    taste: v.union(v.object({ headline: v.string(), why: v.string() }), v.null()),
    fund: v.union(v.object({ line: v.string(), frolicTitle: v.string() }), v.null()),
    memories: v.array(memoryCard),
    health,
    collection,
    milestone,
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
    const planted = await blooms(ctx, args.groupId);

    return {
      groupName: group.name,
      youWent: mine > 0,
      count,
      sinceLine: mine === 0 ? "all before you joined" : `${count - mine} before you, ${mine} with you`,
      weekLine,
      taste,
      fund,
      memories,
      health: gardenHealth(group, planted[0] ?? null, planted.length, args.day ?? dayIn(group.timezone, now)),
      collection: collectionFor(planted),
      milestone: milestoneFor(planted.length),
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
    if (frolic.status === "faded") {
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
          caption: snap.caption ?? captionFor(place?.name ?? "the park", frolic.day, going.length),
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

export const setMine = mutation({
  args: {
    deviceToken: v.string(),
    frolicId: v.id("frolics"),
    storageId: v.optional(v.id("_storage")),
    caption: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    const frolic = await ctx.db.get("frolics", args.frolicId);
    if (!frolic) throw new ConvexError({ code: "NOT_FOUND", message: "This frolic is gone" });
    await requireMember(ctx, frolic.groupId, user._id);
    if (frolic.status === "faded") {
      throw new ConvexError({ code: "NOT_FOUND", message: "This frolic did not happen" });
    }
    const attendee = await ctx.db
      .query("attendees")
      .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", args.frolicId).eq("userId", user._id))
      .unique();
    if (attendee?.status !== "going") {
      throw new ConvexError({ code: "NOT_GOING", message: "Memories are for people who went" });
    }
    const caption = args.caption?.trim();
    if (caption !== undefined && (caption.length === 0 || caption.length > 80 || /[\u2014!]/.test(caption))) {
      throw new ConvexError({ code: "BAD_CAPTION", message: "Captions are short and calm, up to 80 characters" });
    }
    const existing = await ctx.db
      .query("snaps")
      .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", args.frolicId).eq("userId", user._id))
      .take(20);
    const mine = existing[existing.length - 1];
    const now = Date.now();
    if (mine) {
      await ctx.db.patch("snaps", mine._id, {
        ...(args.storageId !== undefined ? { storageId: args.storageId } : {}),
        ...(caption !== undefined ? { caption } : {}),
      });
      return null;
    }
    if (args.storageId === undefined) {
      throw new ConvexError({ code: "NO_PHOTO", message: "Add a photo first" });
    }
    await ctx.db.insert("snaps", {
      frolicId: args.frolicId,
      groupId: frolic.groupId,
      userId: user._id,
      storageId: args.storageId,
      snapAt: frolic.snapAt ?? now,
      takenAt: now,
      caption,
    });
    return null;
  },
});

const ON_THIS_DAY = [
  { daysAgo: 7, label: "1 week ago today" },
  { daysAgo: 30, label: "1 month ago today" },
] as const;

export const onThisDay = query({
  args: { deviceToken: v.string(), groupId: v.id("groups"), day: v.optional(v.string()) },
  returns: v.union(
    v.object({
      frolicId: v.id("frolics"),
      daysAgo: v.number(),
      label: v.string(),
      title: v.string(),
      heroKey: v.union(v.string(), v.null()),
      photoUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "This crew is gone" });
    const today = args.day ?? dayIn(group.timezone, Date.now());
    for (const when of ON_THIS_DAY) {
      const frolics = await ctx.db
        .query("frolics")
        .withIndex("by_groupId_and_day", (q) => q.eq("groupId", args.groupId).eq("day", addDays(today, -when.daysAgo)))
        .take(5);
      for (const frolic of frolics) {
        const bloom = await bloomOf(ctx, frolic);
        if (!bloom) continue;
        let photoUrl: string | null = null;
        if (frolic.status === "done") {
          const snap = await ctx.db
            .query("snaps")
            .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
            .order("desc")
            .first();
          const collage = snap
            ? null
            : await ctx.db
                .query("collages")
                .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
                .first();
          const storageId = snap?.storageId ?? collage?.storageId;
          photoUrl = storageId ? await ctx.storage.getUrl(storageId) : null;
        }
        return {
          frolicId: frolic._id,
          daysAgo: when.daysAgo,
          label: when.label,
          title: bloom.plan?.title ?? "A frolic",
          heroKey: bloom.place ? heroKeyOf(bloom.place.slug) : null,
          photoUrl,
        };
      }
    }
    return null;
  },
});

export const nudge = query({
  args: { deviceToken: v.string(), groupId: v.id("groups") },
  returns: v.union(v.object({ line: v.string(), cta: v.literal("imFree"), sentAt: v.number() }), v.null()),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    const latest = await ctx.db
      .query("gardenNudges")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .first();
    if (!latest) return null;
    const newest = (await blooms(ctx, args.groupId, true))[0] ?? null;
    if ((newest?.frolic._id ?? null) !== latest.anchor) return null;
    return { line: latest.text, cta: "imFree" as const, sentAt: latest.sentAt };
  },
});

export const nudgeCrew = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) return false;
    const now = Date.now();
    const newest = (await blooms(ctx, args.groupId, true))[0] ?? null;
    if (gardenHealth(group, newest, newest ? 1 : 0, dayIn(group.timezone, now)).state !== "thirsty") return false;
    const anchor = newest?.frolic._id ?? null;
    const sent = await ctx.db
      .query("gardenNudges")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .take(20);
    if (sent.some((row) => row.anchor === anchor)) return false;
    await ctx.db.insert("gardenNudges", { groupId: args.groupId, anchor, text: GARDEN_NUDGE_TEXT, sentAt: now });
    const carrier = await ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .first();
    if (carrier) await gardenNudge(ctx, args.groupId, carrier._id, anchor ?? "none");
    return true;
  },
});

export const nudgeCrews = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("groups").paginate({ numItems: 100, cursor: args.cursor ?? null });
    const now = Date.now();
    for (const group of page.page) {
      if (hourIn(group.timezone, now) !== NUDGE_HOUR) continue;
      await ctx.scheduler.runAfter(0, internal.garden.nudgeCrew, { groupId: group._id });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.garden.nudgeCrews, { cursor: page.continueCursor });
    }
    return null;
  },
});

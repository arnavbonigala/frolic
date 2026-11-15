import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { hashToken } from "../lib/identity";
import { PLACE_BY_SLUG, type Place } from "../places/data";
import { isOpenFor } from "../plans/engine";
import { solarTimes } from "../plans/time";
import { addMember, createGroupFor } from "../users";
import {
  ZONE,
  catalogPlace,
  chipsFor,
  clearFrolic,
  dayInZone,
  deviceToken,
  lineFor,
  startsAtFor,
  titleFor,
  upsertPlan,
} from "./admin";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const BATCH = 100;
const REHEARSAL_DEADLINE = 6 * HOUR;

const CREWS = [
  { name: "Sunset Crew", slug: "indian-rock", creator: "Maya", members: ["Maya", "Dev", "Jordan", "Priya"] },
  { name: "Climbing Club", slug: "mortar-rock", creator: "Maya", members: ["Maya", "Dev"] },
] as const;

const NAMES = ["Maya", "Dev", "Jordan", "Priya"];

async function groupMembers(ctx: MutationCtx, groupId: Id<"groups">): Promise<Doc<"users">[]> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .take(BATCH);
  const users: Doc<"users">[] = [];
  for (const membership of memberships) {
    const user = await ctx.db.get("users", membership.userId);
    if (user) users.push(user);
  }
  return users;
}

async function openGroupInvite(ctx: MutationCtx, groupId: Id<"groups">): Promise<string> {
  const invites = await ctx.db
    .query("invites")
    .withIndex("by_groupId_and_kind", (q) => q.eq("groupId", groupId).eq("kind", "group"))
    .take(10);
  const live = invites.find((invite) => !invite.revoked);
  return live?.code ?? "";
}

async function clearToday(ctx: MutationCtx, groupId: Id<"groups">, day: string) {
  const frolics = await ctx.db
    .query("frolics")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day))
    .take(BATCH);
  let rows = 0;
  for (const frolic of frolics) {
    rows += await clearFrolic(ctx, frolic._id);
    await ctx.db.delete("frolics", frolic._id);
  }
  for (const plan of await ctx.db
    .query("plans")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day))
    .take(BATCH)) {
    await ctx.db.delete("plans", plan._id);
  }
  for (const row of await ctx.db
    .query("availability")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day))
    .take(BATCH)) {
    await ctx.db.delete("availability", row._id);
  }
  let revealLog = 0;
  for (const row of await ctx.db
    .query("revealLog")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .take(BATCH)) {
    await ctx.db.delete("revealLog", row._id);
    revealLog++;
  }
  return { frolics: frolics.length, rows, revealLog };
}

async function keptState(ctx: MutationCtx, groupId: Id<"groups">, day: string) {
  const past = (await ctx.db
    .query("frolics")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).lt("day", day))
    .take(BATCH));
  let snaps = 0;
  for (const frolic of past) {
    snaps += (
      await ctx.db
        .query("snaps")
        .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
        .take(BATCH)
    ).length;
  }
  const moneyRows = (
    await ctx.db
      .query("fundLedger")
      .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
      .take(BATCH)
  ).length;
  return { pastFrolics: past.length, snaps, moneyRows };
}

async function todayPlan(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  day: string,
  now: number,
  place: Place,
  placeId: Id<"places">,
) {
  const { sunsetMs } = solarTimes(day);
  const startsAt = startsAtFor(now, place, day);
  if (!isOpenFor(place, startsAt, place.durationMin)) {
    throw new ConvexError({ code: "PLACE_CLOSED", message: place.name + " is not open at the rehearsal hour" });
  }
  const planId = await upsertPlan(ctx, groupId, day, {
    kind: "daily",
    placeId,
    title: titleFor(place, startsAt, sunsetMs),
    line: lineFor(place, startsAt, sunsetMs, day),
    why: place.fallbackWhy,
    cost: place.costPerPersonCents / 100,
    startsAt,
    durationMinutes: place.durationMin,
    meetingPoint: { lat: place.lat, lng: place.lng, label: place.meetSpot },
    sunsetAt: sunsetMs,
    source: "fallback",
    generatedAt: now,
    costLabel: place.costLabel,
    payUpFront: place.payUpFront,
    chips: chipsFor(place, startsAt, sunsetMs, day),
    whySource: "template",
    whyInputs: {
      placeName: place.name,
      memory: undefined,
      topTags: place.tags.slice(0, 2),
      weather: undefined,
      tempF: undefined,
      sunsetAt: sunsetMs,
      rainSwap: false,
    },
    weatherSwap: false,
  });
  const frolicId = await ctx.runMutation(internal.frolics.open, {
    groupId,
    day,
    kind: "daily",
    planId,
    window: { start: startsAt - 2 * HOUR, end: startsAt + place.durationMin * MINUTE + 3 * HOUR },
    durationMinutes: place.durationMin,
    deadline: now + REHEARSAL_DEADLINE,
  });
  return { frolicId, startsAt, title: titleFor(place, startsAt, sunsetMs) };
}

export const rehearse = internalMutation({
  args: { run: v.string() },
  returns: v.object({
    run: v.string(),
    day: v.string(),
    crews: v.array(
      v.object({
        name: v.string(),
        groupId: v.id("groups"),
        inviteCode: v.string(),
        members: v.array(v.string()),
        frolicId: v.id("frolics"),
        planTitle: v.string(),
        startsAt: v.number(),
        deadline: v.number(),
        taps: v.number(),
      }),
    ),
    users: v.array(
      v.object({
        name: v.string(),
        userId: v.id("users"),
        groupId: v.id("groups"),
        link: v.union(v.string(), v.null()),
      }),
    ),
    kept: v.object({ pastFrolics: v.number(), snaps: v.number(), moneyRows: v.number() }),
    cleared: v.object({ frolics: v.number(), rows: v.number(), revealLog: v.number() }),
  }),
  handler: async (ctx, { run }) => {
    const now = Date.now();
    const day = dayInZone(now, ZONE);
    const existingGroups = await ctx.db
      .query("groups")
      .withIndex("by_e2eRun", (q) => q.eq("e2eRun", run))
      .take(BATCH);
    const ids: Record<string, Id<"users">> = {};
    for (const group of existingGroups) {
      for (const user of await groupMembers(ctx, group._id)) ids[user.name] = user._id;
    }
    const freshTokens: Record<string, string> = {};
    for (const name of NAMES) {
      if (ids[name]) continue;
      const token = deviceToken();
      freshTokens[name] = token;
      ids[name] = await ctx.db.insert("users", {
        name,
        tokenHash: await hashToken(token),
        source: "app",
        avatarUrl: `/p/avatar/${name.toLowerCase()}.jpg`,
      });
    }

    let cleared = { frolics: 0, rows: 0, revealLog: 0 };
    let kept = { pastFrolics: 0, snaps: 0, moneyRows: 0 };
    const crews: {
      name: string;
      groupId: Id<"groups">;
      inviteCode: string;
      members: string[];
      frolicId: Id<"frolics">;
      planTitle: string;
      startsAt: number;
      deadline: number;
      taps: number;
    }[] = [];
    for (const crew of CREWS) {
      let group: Doc<"groups"> | null = existingGroups.find((row) => row.name === crew.name) ?? null;
      if (!group) {
        const created = await createGroupFor(ctx, ids[crew.creator], crew.name, ZONE, run);
        group = await ctx.db.get("groups", created.groupId);
      }
      if (!group) throw new ConvexError({ code: "NO_GROUP", message: "Could not build " + crew.name });
      for (const name of crew.members) await addMember(ctx, group._id, ids[name], "invite");

      const today = await clearToday(ctx, group._id, day);
      cleared = {
        frolics: cleared.frolics + today.frolics,
        rows: cleared.rows + today.rows,
        revealLog: cleared.revealLog + today.revealLog,
      };
      const survived = await keptState(ctx, group._id, day);
      kept = {
        pastFrolics: kept.pastFrolics + survived.pastFrolics,
        snaps: kept.snaps + survived.snaps,
        moneyRows: kept.moneyRows + survived.moneyRows,
      };

      const catalog = PLACE_BY_SLUG.get(crew.slug);
      if (!catalog) throw new ConvexError({ code: "NO_PLACE", message: "No catalog place for " + crew.slug });
      const place = await catalogPlace(ctx, crew.slug);
      const opened = await todayPlan(ctx, group._id, day, now, catalog, place._id);
      const taps = await ctx.db
        .query("taps")
        .withIndex("by_frolicId", (q) => q.eq("frolicId", opened.frolicId))
        .take(1);
      crews.push({
        name: crew.name,
        groupId: group._id,
        inviteCode: await openGroupInvite(ctx, group._id),
        members: (await groupMembers(ctx, group._id)).map((user) => user.name),
        frolicId: opened.frolicId,
        planTitle: opened.title,
        startsAt: opened.startsAt,
        deadline: now + REHEARSAL_DEADLINE,
        taps: taps.length,
      });
    }

    const home = crews[0].groupId;
    const users = NAMES.map((name) => {
      const token = freshTokens[name];
      return {
        name,
        userId: ids[name],
        groupId: home,
        link: token ? `frolic://signin?deviceToken=${token}&groupId=${home}` : null,
      };
    });

    return { run, day, crews, users, kept, cleared };
  },
});

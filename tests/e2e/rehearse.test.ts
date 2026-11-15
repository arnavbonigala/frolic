/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { HOUR, NOON, makeT, type T } from "../backend/setup.helpers";

const SECRET = "e2e-secret-for-tests";
const RUN = "rehearse-1";
const MINUTE = 60 * 1000;

type SeededUser = { userId: Id<"users">; deviceToken: string; link: string };
type SeedBody = { groupId: Id<"groups">; frolicId: Id<"frolics">; users: Record<string, SeededUser> };
type Crew = {
  name: string;
  groupId: Id<"groups">;
  inviteCode: string;
  members: string[];
  frolicId: Id<"frolics">;
  planTitle: string;
  startsAt: number;
  deadline: number;
  taps: number;
};
type Rehearsal = {
  run: string;
  day: string;
  crews: Crew[];
  users: { name: string; userId: Id<"users">; groupId: Id<"groups">; link: string | null }[];
  kept: { pastFrolics: number; snaps: number; moneyRows: number };
  cleared: { frolics: number; rows: number; revealLog: number };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubEnv("E2E_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function post(t: T, path: string, body: unknown) {
  return t.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-e2e-secret": SECRET },
    body: JSON.stringify(body),
  });
}

async function rehearse(t: T, run = RUN): Promise<Rehearsal> {
  const response = await post(t, "/e2e/rehearse", { run });
  expect(response.status).toBe(200);
  return (await response.json()) as Rehearsal;
}

function tokenOf(body: Rehearsal, name: string): string {
  const link = body.users.find((user) => user.name === name)?.link ?? "";
  return link.split("deviceToken=")[1].split("&")[0];
}

async function crewCounts(t: T, run = RUN) {
  return await t.run(async (ctx) => {
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_e2eRun", (q) => q.eq("e2eRun", run))
      .take(20);
    const rows = [];
    for (const group of groups) {
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_groupId", (q) => q.eq("groupId", group._id))
        .take(20);
      const frolics = await ctx.db
        .query("frolics")
        .withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id))
        .take(20);
      let taps = 0;
      let attendees = 0;
      for (const frolic of frolics) {
        taps += (await ctx.db.query("taps").withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id)).take(50)).length;
        attendees += (
          await ctx.db.query("attendees").withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id)).take(50)
        ).length;
      }
      rows.push({
        name: group.name,
        groupId: group._id,
        members: memberships.length,
        frolics: frolics.map((frolic) => ({ id: frolic._id, day: frolic.day, status: frolic.status })),
        taps,
        attendees,
      });
    }
    return {
      groups: rows,
      users: (await ctx.db.query("users").take(50)).length,
      revealLog: (await ctx.db.query("revealLog").take(50)).length,
    };
  });
}

describe("rehearse", () => {
  test("builds two crews, each with today's plan open and nobody down", async () => {
    const t = makeT();
    const body = await rehearse(t);

    expect(body.run).toBe(RUN);
    expect(body.day).toBe("2026-11-15");
    expect(body.crews.map((crew) => crew.name)).toEqual(["Sunset Crew", "Climbing Club"]);
    for (const crew of body.crews) {
      expect(crew.taps).toBe(0);
      expect(crew.startsAt).toBeGreaterThanOrEqual(NOON + 45 * MINUTE);
      expect(crew.deadline).toBeGreaterThanOrEqual(NOON + 6 * HOUR);
      expect(crew.inviteCode.length).toBeGreaterThan(0);
    }
    const sunset = body.crews[0];
    const climbing = body.crews[1];
    expect([...sunset.members].sort()).toEqual(["Dev", "Jordan", "Maya", "Priya"]);
    expect([...climbing.members].sort()).toEqual(["Dev", "Maya"]);
    expect(sunset.planTitle).toBe("Sunset at Indian Rock");
    expect(climbing.planTitle).toBe("Bouldering on Mortar Rock");

    const counts = await crewCounts(t);
    expect(counts.groups.map((group) => group.name)).toEqual(["Sunset Crew", "Climbing Club"]);
    expect(counts.groups.map((group) => group.members)).toEqual([4, 2]);
    for (const group of counts.groups) {
      expect(group.frolics).toHaveLength(1);
      expect(group.frolics[0].day).toBe("2026-11-15");
      expect(group.frolics[0].status).toBe("open");
      expect(group.taps).toBe(0);
      expect(group.attendees).toBe(0);
    }
    expect(counts.users).toBe(4);
    expect(counts.revealLog).toBe(0);

    const maya = tokenOf(body, "Maya");
    for (const crew of body.crews) {
      const seen = await t.query(api.frolics.today, { deviceToken: maya, groupId: crew.groupId });
      expect(seen.phase).toBe("open");
      expect(seen.frolic?.frolicId).toBe(crew.frolicId);
      expect(seen.myTap).toBeNull();
    }
  });

  test("a second call leaves one Sunset Crew and one Climbing Club", async () => {
    const t = makeT();
    const first = await rehearse(t);
    const second = await rehearse(t);

    expect(second.crews.map((crew) => crew.name)).toEqual(["Sunset Crew", "Climbing Club"]);
    expect(second.crews.map((crew) => crew.groupId)).toEqual(first.crews.map((crew) => crew.groupId));
    expect(second.crews.map((crew) => crew.frolicId)).not.toEqual(first.crews.map((crew) => crew.frolicId));
    expect(second.crews.every((crew) => crew.taps === 0)).toBe(true);
    expect(second.users.every((user) => user.link === null)).toBe(true);

    const counts = await crewCounts(t);
    expect(counts.groups).toHaveLength(2);
    expect(counts.groups.map((group) => group.name)).toEqual(["Sunset Crew", "Climbing Club"]);
    expect(counts.groups.map((group) => group.members)).toEqual([4, 2]);
    expect(counts.groups.map((group) => group.frolics)).toHaveLength(2);
    for (const group of counts.groups) expect(group.frolics).toHaveLength(1);
    expect(counts.users).toBe(4);
  });

  test("past frolics and their flowers survive, in-flight holds go", async () => {
    const t = makeT();
    const seeded = (await (await post(t, "/e2e/seed", { run: RUN, scenario: "demo" })).json()) as SeedBody;

    const before = await t.run(async (ctx) => {
      const past = await ctx.db
        .query("frolics")
        .withIndex("by_groupId_and_day", (q) => q.eq("groupId", seeded.groupId).lt("day", "2026-11-15"))
        .take(10);
      const storageId = await ctx.storage.store(new Blob(["flower"]));
      for (const frolic of past) {
        await ctx.db.insert("snaps", {
          frolicId: frolic._id,
          groupId: seeded.groupId,
          userId: seeded.users.maya.userId,
          storageId,
          snapAt: frolic.startsAt ?? Date.now(),
          takenAt: Date.now(),
        });
      }
      await ctx.db.insert("fundLedger", {
        groupId: seeded.groupId,
        frolicId: past[0]._id,
        userId: seeded.users.jordan.userId,
        entry: "forfeit",
        amountCents: 300,
        at: Date.now(),
      });
      await ctx.db.insert("shares", {
        frolicId: seeded.frolicId,
        groupId: seeded.groupId,
        userId: seeded.users.maya.userId,
        amountCents: 300,
        kind: "deposit",
        status: "held",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("revealLog", {
        frolicId: past[0]._id,
        groupId: seeded.groupId,
        userId: seeded.users.maya.userId,
        revealAt: Date.now(),
        bloomAt: Date.now(),
        flippedAt: Date.now(),
      });
      return { past: past.map((frolic) => frolic._id), flowers: past.length };
    });
    expect(before.past).toHaveLength(3);

    const body = await rehearse(t);
    expect(body.crews).toHaveLength(2);
    expect(body.kept.pastFrolics).toBe(3);
    expect(body.kept.snaps).toBe(3);
    expect(body.kept.moneyRows).toBe(1);
    expect(body.cleared.frolics).toBe(1);
    expect(body.cleared.revealLog).toBe(1);

    const after = await t.run(async (ctx) => {
      const past = await ctx.db
        .query("frolics")
        .withIndex("by_groupId_and_day", (q) => q.eq("groupId", seeded.groupId).lt("day", "2026-11-15"))
        .take(10);
      let flowers = 0;
      for (const frolic of past) {
        flowers += (await ctx.db.query("snaps").withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id)).take(10))
          .length;
      }
      return {
        past: past.map((frolic) => frolic._id),
        flowers,
        money: (await ctx.db.query("fundLedger").withIndex("by_groupId", (q) => q.eq("groupId", seeded.groupId)).take(10))
          .length,
        shares: (await ctx.db.query("shares").take(10)).length,
        revealLog: (await ctx.db.query("revealLog").take(10)).length,
        today: await ctx.db
          .query("frolics")
          .withIndex("by_groupId_and_day", (q) => q.eq("groupId", seeded.groupId).eq("day", "2026-11-15"))
          .take(10),
      };
    });
    expect(after.past).toEqual(before.past);
    expect(after.flowers).toBe(3);
    expect(after.money).toBe(1);
    expect(after.shares).toBe(0);
    expect(after.revealLog).toBe(0);
    expect(after.today).toHaveLength(1);
    expect(after.today[0].status).toBe("open");
    expect(after.today[0]._id).toBe(body.crews[0].frolicId);

    const garden = await t.query(api.garden.overview, {
      deviceToken: seeded.users.maya.deviceToken,
      groupId: seeded.groupId,
    });
    expect(JSON.stringify(garden)).toContain("Indian Rock");
  });

  test("the mutation is idempotent when called directly", async () => {
    const t = makeT();
    const first = await t.mutation(internal.e2e.rehearse.rehearse, { run: "rehearse-direct" });
    const second = await t.mutation(internal.e2e.rehearse.rehearse, { run: "rehearse-direct" });
    expect(second.crews.map((crew) => crew.groupId)).toEqual(first.crews.map((crew) => crew.groupId));
    expect(second.users.every((user) => user.link === null)).toBe(true);
    const counts = await crewCounts(t, "rehearse-direct");
    expect(counts.groups.map((group) => group.name)).toEqual(["Sunset Crew", "Climbing Club"]);
    expect(counts.groups.every((group) => group.frolics.length === 1 && group.taps === 0)).toBe(true);
  });
});

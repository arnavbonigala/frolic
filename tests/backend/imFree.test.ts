/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { HOUR, NOON, token } from "./setup.helpers";
import { freeCrew, imFree, later, settle } from "./imFree.helpers";
import { DAY } from "@convex-dev/rate-limiter";
import { DAILY_RESET_AT } from "../../convex/lib/rateLimits";
import { PLACE_BY_SLUG } from "../../convex/places/data";
import { freeEarliestStart } from "../../convex/plans/engine";
import { tripTo } from "../../convex/plans/travel";

const MIN = 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function errorOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e instanceof ConvexError ? (e.data as Record<string, unknown>) : { thrown: String(e) };
  }
  return null;
}

describe("I'm free", () => {
  test("generates a plan in the starter's window, taps them down, and reveals on a second tap", async () => {
    const c = await freeCrew(["Maya", "Dev", "Priya"]);
    const started = await imFree(c, "Maya", 120);
    expect(started.started).toBe(true);
    await settle(c.t);

    const row = await c.t.run(async (ctx) => await ctx.db.get("frolics", started.frolicId));
    expect(row?.origin).toBe("free");
    expect(row?.startedBy).toBe(c.ids.Maya);
    expect(row?.planId).toBeDefined();
    expect(Math.abs(row!.window.end - row!._creationTime - 2 * HOUR)).toBeLessThan(MIN);
    expect(row!.deadline).toBeLessThanOrEqual(row!._creationTime + 30 * MIN);
    const plan = await c.t.run(async (ctx) => await ctx.db.get("plans", row!.planId!));
    expect(plan?.kind).toBe("free");
    expect(row!.window.start).toBe(plan!.startsAt);
    expect(plan!.startsAt).toBeGreaterThanOrEqual(NOON + 30 * MIN);
    expect(plan!.startsAt + plan!.durationMinutes * MIN).toBeLessThanOrEqual(row!.window.end);
    expect(row!.durationMinutes).toBe(plan!.durationMinutes);

    const maya = await c.t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: c.groupId });
    expect(maya.phase).toBe("waiting");
    expect(maya.myTap?.kind).toBe("down");
    expect(maya.frolic?.origin).toBe("free");

    const dev = await c.t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: c.groupId });
    expect(dev.phase).toBe("open");
    expect(dev.myTap).toBeNull();
    expect(dev.frolic?.frolicId).toBe(started.frolicId);
    expect(dev.frolic?.notice).toMatch(new RegExp("^Someone in your crew is free\\. " + plan!.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " at \\d{1,2}:\\d{2}\\?$"));
    expect(dev.frolic?.notice).not.toMatch(/[—!]/);

    await c.t.mutation(api.taps.tap, { deviceToken: token("Dev"), frolicId: started.frolicId, kind: "down" });
    await later(c.t, 2500);
    for (const name of ["Maya", "Dev", "Priya"]) {
      const view = await c.t.query(api.frolics.today, { deviceToken: token(name), groupId: c.groupId });
      expect(view.phase).toBe("on");
      expect(view.frolic?.notice).toBeNull();
      expect(view.reveal?.going.map((p) => p.name).sort()).toEqual(["Dev", "Maya"]);
    }
    const priya = await c.t.query(api.frolics.today, { deviceToken: token("Priya"), groupId: c.groupId });
    expect(priya.reveal?.me.canHopIn).toBe(true);
    expect(await c.t.mutation(api.frolics.hopIn, { deviceToken: token("Priya"), frolicId: started.frolicId })).toBe("going");
  });

  test("a second start while one is open returns the open frolic", async () => {
    const c = await freeCrew(["Maya", "Dev", "Priya"]);
    const first = await imFree(c, "Maya");
    await settle(c.t);
    const second = await imFree(c, "Dev", 60);
    expect(second).toEqual({ frolicId: first.frolicId, started: false });
    const again = await imFree(c, "Maya");
    expect(again).toEqual({ frolicId: first.frolicId, started: false });
    const rows = await c.t.run(async (ctx) => await ctx.db.query("frolics").collect());
    expect(rows).toHaveLength(1);
    const dev = await c.t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: c.groupId });
    expect(dev.myTap).toBeNull();
  });

  test("validates the free span and membership", async () => {
    const c = await freeCrew(["Maya", "Dev"]);
    expect((await errorOf(imFree(c, "Maya", 59)))?.code).toBe("BAD_MINUTES");
    expect((await errorOf(imFree(c, "Maya", 241)))?.code).toBe("BAD_MINUTES");
    expect((await errorOf(imFree(c, "Maya", 90.5)))?.code).toBe("BAD_MINUTES");
    const outsider = await errorOf(
      c.t.mutation(api.frolics.imFree, { deviceToken: token("Nobody"), groupId: c.groupId, forMinutes: 60 }),
    );
    expect(outsider?.code).toBe("UNKNOWN_DEVICE");
  });

  test("one person can start at most three a day", async () => {
    const c = await freeCrew(["Maya", "Dev"]);
    for (let i = 0; i < 3; i++) {
      const s = await imFree(c, "Maya", 60);
      expect(s.started).toBe(true);
      await settle(c.t);
      await later(c.t, 31 * MIN);
      const row = await c.t.run(async (ctx) => await ctx.db.get("frolics", s.frolicId));
      expect(row?.status).toBe("faded");
    }
    const fourth = await errorOf(imFree(c, "Maya", 60));
    expect(fourth?.kind).toBe("RateLimited");
    const retryAfter = fourth?.retryAfter as number;
    expect(retryAfter).toBeGreaterThan(0);
    expect((Date.now() + retryAfter - DAILY_RESET_AT) % DAY).toBe(0);
    const dev = await imFree(c, "Dev", 60);
    expect(dev.started).toBe(true);
  });

  test("fades at the short deadline when nobody else taps", async () => {
    const c = await freeCrew(["Maya", "Dev"]);
    const s = await imFree(c, "Maya", 240);
    await settle(c.t);
    const row = await c.t.run(async (ctx) => await ctx.db.get("frolics", s.frolicId));
    expect(row!.deadline).toBeLessThanOrEqual(row!._creationTime + 30 * MIN);
    await later(c.t, row!.deadline - Date.now() - 1000);
    expect((await c.t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: c.groupId })).phase).toBe("open");
    await later(c.t, 2000);
    const dev = await c.t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: c.groupId });
    expect(dev.phase).toBe("faded");
    const taps = await c.t.run(async (ctx) => await ctx.db.query("taps").collect());
    expect(taps).toEqual([]);
    const late = await errorOf(c.t.mutation(api.taps.tap, { deviceToken: token("Dev"), frolicId: s.frolicId, kind: "down" }));
    expect(late?.code).toBe("CLOSED");
  });

  test("the daily drop skips a crew with a started frolic open, and runs once it is gone", async () => {
    const c = await freeCrew(["Maya", "Dev"]);
    const s = await imFree(c, "Maya");
    await settle(c.t);
    expect(await c.t.mutation(internal.plans.drop.dailyDrop, {})).toEqual({ started: 0 });
    const daily = await c.t.mutation(internal.frolics.open, {
      groupId: c.groupId,
      day: "2026-11-15",
      kind: "daily",
      window: { start: Date.now(), end: Date.now() + 4 * HOUR },
      durationMinutes: 60,
      deadline: Date.now() + 3 * HOUR,
    });
    expect(daily).not.toBe(s.frolicId);
    await c.t.run(async (ctx) => {
      await ctx.db.delete("frolics", daily);
    });
    await later(c.t, 31 * MIN);
    expect(await c.t.mutation(internal.plans.drop.dailyDrop, {})).toEqual({ started: 1 });
  });

  test("texts the rest of the crew without naming the starter", async () => {
    const c = await freeCrew(["Maya", "Dev", "Priya"], true);
    const s = await imFree(c, "Maya");
    await settle(c.t);
    const rows = await c.t.run(async (ctx) =>
      await ctx.db.query("keikiOutbox").withIndex("by_frolicId", (q) => q.eq("frolicId", s.frolicId)).collect(),
    );
    expect(rows.map((r) => r.userId).sort()).toEqual([c.ids.Dev, c.ids.Maya, c.ids.Priya].sort());
    const mine = rows.find((r) => r.userId === c.ids.Maya)!;
    expect(mine.text).toMatch(/^You're counted as down\. .+ at \d{1,2}:\d{2} just went to your crew\. Nobody knows it was you\.$/);
    for (const r of rows.filter((x) => x.userId !== c.ids.Maya)) {
      expect(r.kind).toBe("drop");
      expect(r.text.split("\n")[0]).toMatch(/^Someone in your crew is free\. .+ at \d{1,2}:\d{2}\?$/);
      expect(r.text).not.toContain("Maya");
      expect(r.text).not.toMatch(/[—!]/);
    }
  });

  test("attachFreePlan leaves a frolic that already has a plan alone", async () => {
    const c = await freeCrew(["Maya", "Dev"]);
    const s = await imFree(c, "Maya");
    await settle(c.t);
    const row = await c.t.run(async (ctx) => await ctx.db.get("frolics", s.frolicId));
    const plan = await c.t.run(async (ctx) => await ctx.db.get("plans", row!.planId!));
    const place = await c.t.run(async (ctx) => await ctx.db.get("places", plan!.placeId));
    const again = await c.t.mutation(internal.plans.drop.attachFreePlan, {
      groupId: c.groupId,
      day: row!.day,
      frolicId: s.frolicId,
      plan: {
        placeSlug: place!.slug,
        title: "Something else",
        line: plan!.line,
        why: "why",
        whySource: "template",
        whyMemoryId: null,
        whyInputs: { placeName: "x", memory: null, topTags: [], weather: null, tempF: null, sunsetAt: NOON, rainSwap: false },
        chips: [],
        cost: 0,
        costLabel: "Free",
        payUpFront: false,
        startsAt: NOON + HOUR,
        durationMinutes: 60,
        meetingPoint: { lat: 0, lng: 0, label: "x" },
        sunsetAt: NOON,
        weather: null,
        weatherSwap: false,
        favoredUserId: null,
        source: "fallback",
      },
    });
    expect(again).toBe(row!.planId);
    const plans = await c.t.run(async (ctx) => await ctx.db.query("plans").collect());
    expect(plans).toHaveLength(1);
    await c.t.mutation(internal.keiki.outbound.onFree, { frolicId: s.frolicId });
  });

  test("imFreeAs starts the same frolic for a texter and refuses a second while one is open", async () => {
    const c = await freeCrew(["Maya", "Dev"]);
    expect(await c.t.mutation(internal.frolics.imFreeAs, { userId: c.ids.Dev, groupId: c.groupId, forMinutes: 90 })).toEqual({ error: "planning" });
    await settle(c.t);
    const rows = await c.t.run(async (ctx) => await ctx.db.query("frolics").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].startedBy).toBe(c.ids.Dev);
    expect(rows[0].planId).toBeDefined();
    const taps = await c.t.run(async (ctx) => await ctx.db.query("taps").collect());
    expect(taps.map((x) => [x.userId, x.kind, x.source])).toEqual([[c.ids.Dev, "down", "imessage"]]);
    expect(await c.t.mutation(internal.frolics.imFreeAs, { userId: c.ids.Maya, groupId: c.groupId, forMinutes: 90 })).toEqual({ error: "already_open" });
    expect((await errorOf(c.t.mutation(internal.frolics.imFreeAs, { userId: c.ids.Maya, groupId: c.groupId, forMinutes: 30 })))?.code).toBe("BAD_MINUTES");
  });

  async function startedPlan(nowMs: number, forMinutes: number) {
    vi.setSystemTime(nowMs);
    const c = await freeCrew(["Maya", "Dev", "Priya"]);
    const s = await imFree(c, "Maya", forMinutes);
    await settle(c.t);
    const row = (await c.t.run(async (ctx) => await ctx.db.get("frolics", s.frolicId)))!;
    expect(row.status).toBe("open");
    const plan = (await c.t.run(async (ctx) => await ctx.db.get("plans", row.planId!)))!;
    const place = (await c.t.run(async (ctx) => await ctx.db.get("places", plan.placeId)))!;
    const travel = tripTo(null, PLACE_BY_SLUG.get(place.slug)!).minutes;
    return { c, row, plan, travel, startedAt: row._creationTime };
  }

  for (const offset of [0, 7, 52, 3 * 60 + 13]) {
    test("a plan started " + offset + " minutes after noon leaves time to answer and travel", async () => {
      const { c, row, plan, travel, startedAt } = await startedPlan(NOON + offset * MIN, 120);
      expect(plan.startsAt % (15 * MIN)).toBe(0);
      expect(plan.startsAt).toBeGreaterThanOrEqual(startedAt + 30 * MIN);
      expect(plan.startsAt).toBeGreaterThanOrEqual(startedAt + (travel + 10) * MIN);
      expect(plan.startsAt).toBeGreaterThanOrEqual(freeEarliestStart(startedAt, travel));
      expect(plan.startsAt + plan.durationMinutes * MIN).toBeLessThanOrEqual(startedAt + 120 * MIN);
      expect(row.deadline).toBeGreaterThan(startedAt);
      expect(row.deadline).toBeLessThanOrEqual(startedAt + 30 * MIN);
      expect(row.deadline).toBeLessThanOrEqual(plan.startsAt - travel * MIN);
      await c.t.mutation(api.taps.tap, { deviceToken: token("Dev"), frolicId: row._id, kind: "down" });
      await later(c.t, 2500);
      const dev = await c.t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: c.groupId });
      expect(dev.phase).toBe("on");
      expect(dev.reveal?.startsAt).toBe(plan.startsAt);
    });
  }

  test("about an hour free picks something short and close enough to fit", async () => {
    const { row, plan, travel, startedAt } = await startedPlan(NOON - 1000, 61);
    expect(plan.startsAt).toBe(NOON + 30 * MIN);
    expect(plan.durationMinutes).toBeLessThanOrEqual(30);
    expect(travel).toBeLessThanOrEqual(20);
    expect(plan.startsAt + plan.durationMinutes * MIN).toBeLessThanOrEqual(startedAt + 61 * MIN);
    expect(Math.abs(row.window.end - startedAt - 61 * MIN)).toBeLessThan(MIN);
  });

  test("late in the day with nothing that fits, it still starts at the earliest valid time", async () => {
    const { c, row, plan, travel, startedAt } = await startedPlan(NOON + 9 * HOUR + 50 * MIN, 60);
    expect(plan.startsAt).toBe(freeEarliestStart(startedAt, travel));
    expect(row.window.start).toBe(plan.startsAt);
    expect(row.window.end).toBeGreaterThanOrEqual(plan.startsAt + plan.durationMinutes * MIN);
    expect(row.deadline).toBeLessThanOrEqual(plan.startsAt - travel * MIN);
    await c.t.mutation(api.taps.tap, { deviceToken: token("Dev"), frolicId: row._id, kind: "down" });
    await later(c.t, 2500);
    const dev = await c.t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: c.groupId });
    expect(dev.phase).toBe("on");
    expect(dev.reveal?.startsAt).toBe(plan.startsAt);
  });

  test("the plan line only mentions the sunset for sunset, view or golden-hour outdoor plans", async () => {
    const { c, plan } = await startedPlan(NOON, 120);
    const place = (await c.t.run(async (ctx) => await ctx.db.get("places", plan.placeId)))!;
    const sunsety = place.tags.includes("sunsets") || place.tags.includes("views") || !place.indoor;
    if (!sunsety) expect(plan.line).not.toMatch(/Sunset|Golden hour/);
    expect(plan.line).not.toMatch(/[\u2014!]/);
  });
});

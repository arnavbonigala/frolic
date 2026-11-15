/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { HOUR, NOON, token } from "./setup.helpers";
import { freeCrew, imFree, later, settle } from "./imFree.helpers";

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
    expect(row!.window.end - row!.window.start).toBe(2 * HOUR);
    expect(row!.window.start - NOON).toBeLessThan(MIN);
    expect(row!.deadline).toBeLessThanOrEqual(row!.window.start + 30 * MIN);
    const plan = await c.t.run(async (ctx) => await ctx.db.get("plans", row!.planId!));
    expect(plan?.kind).toBe("free");
    expect(plan!.startsAt).toBeGreaterThanOrEqual(NOON);
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
    const dev = await imFree(c, "Dev", 60);
    expect(dev.started).toBe(true);
  });

  test("fades at the short deadline when nobody else taps", async () => {
    const c = await freeCrew(["Maya", "Dev"]);
    const s = await imFree(c, "Maya", 240);
    await settle(c.t);
    const row = await c.t.run(async (ctx) => await ctx.db.get("frolics", s.frolicId));
    expect(row!.deadline).toBeLessThanOrEqual(NOON + 30 * MIN);
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
    expect(rows.map((r) => r.userId).sort()).toEqual([c.ids.Dev, c.ids.Priya].sort());
    for (const r of rows) {
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
});

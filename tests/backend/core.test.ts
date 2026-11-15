import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, today, token } from "./setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function scheduled(t: ReturnType<typeof makeT>, name: string) {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      (s) => s.name.replace(".js", "").includes(name) && s.state.kind === "pending",
    ),
  );
}

describe("tap and synced reveal", () => {
  test("the reveal memory is written after the flip, once per frolic", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await flipDue(t, 10);
    const reveals = async () =>
      (await t.run(async (ctx) => await ctx.db.query("memoryEvents").collect())).filter((e) => e.kind === "reveal");
    expect(await reveals()).toHaveLength(1);
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    await t.mutation(internal.reveal.remember, {
      frolicId: crew.frolicId,
      userIds: [crew.ids.Maya, crew.ids.Dev],
      revealAt: frolic!.revealAt!,
    });
    expect(await reveals()).toHaveLength(1);
  });

  test("two taps match, and nothing about the match is readable before revealAt", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    const mayaBefore = await today(t, crew, "Maya");
    const jordanBefore = await today(t, crew, "Jordan");
    expect(mayaBefore.phase).toBe("waiting");
    expect(jordanBefore.phase).toBe("open");

    await tap(t, crew, "Dev");
    expect(await today(t, crew, "Maya")).toEqual(mayaBefore);
    expect(await today(t, crew, "Jordan")).toEqual(jordanBefore);
    const dev = await today(t, crew, "Dev");
    expect(dev.phase).toBe("waiting");
    expect(dev.reveal).toBeNull();
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    expect(frolic?.status).toBe("open");
    expect(frolic?.revealAt).toBeUndefined();
    expect(await t.run(async (ctx) => await ctx.db.query("attendees").collect())).toHaveLength(0);

    vi.advanceTimersByTime(1400);
    await t.finishInProgressScheduledFunctions();
    expect((await today(t, crew, "Maya")).reveal).toBeNull();

    await flipDue(t, 200);
    const maya = await today(t, crew, "Maya");
    expect(maya.phase).toBe("on");
    expect(maya.reveal?.going.map((p) => p.name).sort()).toEqual(["Dev", "Maya"]);
    const revealAt = maya.reveal!.revealAt;
    expect(revealAt - NOON).toBeGreaterThanOrEqual(1500);
    expect(revealAt - NOON).toBeLessThan(1520);
    expect(maya.reveal!.bloomAt - revealAt).toBe(800);
    expect(maya.reveal?.me.going).toBe(true);

    const jordan = await today(t, crew, "Jordan");
    expect(jordan.phase).toBe("on");
    expect(jordan.reveal?.me).toMatchObject({ going: false, canHopIn: true });
    expect(jordan.reveal?.going.map((p) => p.name).sort()).toEqual(["Dev", "Maya"]);
  });

  test("two taps in the same instant reveal exactly once", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await Promise.all([tap(t, crew, "Maya", { onlyIf: ["Dev"] }), tap(t, crew, "Dev")]);
    expect(await scheduled(t, "reveal:flip")).toHaveLength(1);
    await flipDue(t);
    await flipDue(t);
    const log = await t.run(async (ctx) => await ctx.db.query("revealLog").collect());
    expect(log).toHaveLength(2);
    expect(new Set(log.map((l) => l.revealAt)).size).toBe(1);
    expect(await t.run(async (ctx) => await ctx.db.query("attendees").collect())).toHaveLength(2);
  });

  test("a second flip for the same frolic is a no-op", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    const f = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    await t.mutation(internal.reveal.flip, { frolicId: crew.frolicId, revealAt: f!.revealAt! });
    expect(await t.run(async (ctx) => await ctx.db.query("revealLog").collect())).toHaveLength(2);
  });

  test("a third tap before the reveal joins the same reveal without delaying it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    vi.advanceTimersByTime(500);
    await tap(t, crew, "Jordan");
    expect(await scheduled(t, "reveal:flip")).toHaveLength(1);
    await flipDue(t, 1100);
    const r = await today(t, crew, "Jordan");
    expect(r.reveal?.going).toHaveLength(3);
    expect(r.reveal!.revealAt - NOON).toBeLessThan(1520);
  });

  test("changing to not today before the reveal cancels it with no trace", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Dev", { kind: "notToday" });
    await flipDue(t);
    expect((await today(t, crew, "Maya")).phase).toBe("waiting");
    expect(await t.run(async (ctx) => await ctx.db.query("reveals").collect())).toHaveLength(0);
    expect(await t.run(async (ctx) => await ctx.db.query("revealLog").collect())).toHaveLength(0);
  });

  test("an iMessage tap and an app tap match each other", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    await t.mutation(internal.taps.tapAs, { userId: crew.ids.Dev, frolicId: crew.frolicId, kind: "down", source: "imessage" });
    await flipDue(t);
    expect((await today(t, crew, "Dev")).phase).toBe("on");
  });

  test("windows that do not overlap never reveal", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya", { window: { start: NOON + HOUR, end: NOON + 2 * HOUR } });
    await tap(t, crew, "Dev", { window: { start: NOON + 3 * HOUR, end: NOON + 5 * HOUR } });
    await flipDue(t);
    expect((await today(t, crew, "Maya")).phase).toBe("waiting");
  });

  test("the matched time comes from the windows", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya", { window: { start: NOON + HOUR, end: NOON + 4 * HOUR } });
    await tap(t, crew, "Dev", { window: { start: NOON + 2 * HOUR, end: NOON + 5 * HOUR } });
    await flipDue(t);
    const r = await today(t, crew, "Maya");
    expect(r.reveal?.startsAt).toBe(NOON + 2 * HOUR);
    expect(r.reveal?.endsAt).toBe(NOON + 3 * HOUR);
  });

  test("non members cannot tap", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(tap(t, crew, "Eve")).rejects.toThrow(/not in this crew/);
  });

  test("only if must name crew members", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const other = await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(
      t.mutation(api.taps.tap, { deviceToken: token("Maya"), frolicId: crew.frolicId, kind: "down", onlyIf: [other.userId] }),
    ).rejects.toThrow(/Only if/);
  });

  test("tapping too fast trips the rate limit", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    for (let i = 0; i < 6; i++) await tap(t, crew, "Maya", { kind: i % 2 ? "down" : "notToday" });
    await expect(tap(t, crew, "Maya")).rejects.toThrow(/RateLimited|rate/i);
  });
});

describe("deadline and fade", () => {
  test("a tap after the deadline is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { deadlineIn: HOUR });
    vi.setSystemTime(NOON + HOUR);
    await expect(tap(t, crew, "Maya")).rejects.toThrow(/over/);
  });

  test("fading at the deadline leaves no trace of who said yes", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"], { deadlineIn: HOUR });
    await tap(t, crew, "Maya", { onlyIf: ["Jordan"] });
    await tap(t, crew, "Dev", { onlyIf: ["Jordan"] });
    await flipDue(t, HOUR);
    for (const name of ["Maya", "Dev", "Jordan"]) {
      const r = await today(t, crew, name);
      expect(r.phase).toBe("faded");
      expect(r.myTap).toBeNull();
      expect(r.reveal).toBeNull();
    }
    const rows = await t.run(async (ctx) => ({
      taps: await ctx.db.query("taps").collect(),
      attendees: await ctx.db.query("attendees").collect(),
      reveals: await ctx.db.query("reveals").collect(),
      log: await ctx.db.query("revealLog").collect(),
    }));
    expect(rows).toEqual({ taps: [], attendees: [], reveals: [], log: [] });
    await expect(tap(t, crew, "Jordan")).rejects.toThrow(/over/);
  });

  test("a match that lands just before the deadline still reveals", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { deadlineIn: HOUR });
    vi.setSystemTime(NOON + HOUR - 500);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect((await today(t, crew, "Maya")).phase).toBe("on");
  });

  test("the frolic is done after it ends, and taps are gone", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await flipDue(t, 3 * HOUR);
    expect((await today(t, crew, "Maya")).phase).toBe("done");
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(0);
  });
});

describe("hop in, sit out and refill", () => {
  test("hop in after the reveal shows names and adds you", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await expect(t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).rejects.toThrow();
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe("going");
    const r = await today(t, crew, "Maya");
    expect(r.reveal?.going.map((p) => p.name).sort()).toEqual(["Dev", "Jordan", "Maya"]);
    expect(r.reveal?.going.find((p) => p.name === "Jordan")?.role).toBe("hopIn");
  });

  test("sit out refills from the hop in pool", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan", "Priya"], { capacity: 2 });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe("waiting");
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Priya"), frolicId: crew.frolicId })).toBe("waiting");
    expect((await today(t, crew, "Jordan")).reveal?.me).toMatchObject({ hopInWaiting: true, canHopIn: false });
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    const r = await today(t, crew, "Maya");
    expect(r.reveal?.going.map((p) => p.name).sort()).toEqual(["Jordan", "Maya"]);
    expect(r.reveal?.going.find((p) => p.name === "Jordan")?.role).toBe("refill");
    expect((await today(t, crew, "Dev")).reveal?.me.going).toBe(false);
    expect((await today(t, crew, "Priya")).reveal?.me.hopInWaiting).toBe(true);
  });

  test("sitting out inside the reveal window cancels your seat", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Jordan");
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Jordan"), frolicId: crew.frolicId });
    await flipDue(t);
    const r = await today(t, crew, "Maya");
    expect(r.reveal?.going.map((p) => p.name).sort()).toEqual(["Dev", "Maya"]);
    expect((await today(t, crew, "Jordan")).reveal?.me.going).toBe(false);
  });

  test("a match never seats more than the capacity", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan", "Priya"], { capacity: 2 });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Jordan");
    await tap(t, crew, "Priya");
    await flipDue(t);
    const r = await today(t, crew, "Priya");
    expect(r.reveal?.going.map((p) => p.name).sort()).toEqual(["Dev", "Maya"]);
    expect(r.reveal?.me.canHopIn).toBe(false);
  });

  test("capacity seats the tapper whose only if is met", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan", "Sam"], { capacity: 3 });
    await tap(t, crew, "Maya", { onlyIf: ["Sam"] });
    await tap(t, crew, "Dev");
    await tap(t, crew, "Jordan");
    await tap(t, crew, "Sam");
    await flipDue(t);
    const r = await today(t, crew, "Maya");
    expect(r.reveal?.going.map((p) => p.name).sort()).toEqual(["Dev", "Maya", "Sam"]);
  });

  test("a stale flip for a cancelled reveal does nothing", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Dev", { kind: "notToday" });
    await t.mutation(internal.reveal.flip, { frolicId: crew.frolicId, revealAt: NOON + 1500 });
    expect((await today(t, crew, "Maya")).phase).toBe("waiting");
  });

  test("untap removes the yes before a match and retap matches again", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await t.mutation(api.taps.untap, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    expect((await today(t, crew, "Maya")).phase).toBe("open");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect((await today(t, crew, "Dev")).phase).toBe("waiting");
    await tap(t, crew, "Maya");
    await flipDue(t);
    expect((await today(t, crew, "Dev")).phase).toBe("on");
  });

  test("a late tap that fits the going set joins after the reveal", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await tap(t, crew, "Jordan", { onlyIf: ["Maya"] });
    expect((await today(t, crew, "Jordan")).reveal?.me.going).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import crons from "../../../convex/crons";
import { dayIn } from "../../../convex/daily";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token, type T } from "../setup.helpers";

const MINUTE = 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function jobs(t: T) {
  return (await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).map((s) => ({
    name: s.name.replace(".js", ""),
    state: s.state.kind,
    args: (s.args as Array<Record<string, unknown>>)[0] ?? {},
  }));
}

const named = async (t: T, name: string) => (await jobs(t)).filter((j) => j.name === name);

describe("scheduled work", () => {
  test("opening a frolic arms its fade at the deadline", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { deadlineIn: HOUR });
    const fades = await named(t, "reveal:fade");
    expect(fades).toHaveLength(1);
    expect(fades[0].args).toEqual({ frolicId: crew.frolicId });
    expect(fades[0].state).toBe("pending");

    await flipDue(t, HOUR);
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    expect(frolic?.status).toBe("faded");
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(0);
  });

  test("a reveal arms the leave nudge, the completion and the chat drops", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);

    const nudge = await named(t, "keiki/outbound:onLeaveNudge");
    expect(nudge).toHaveLength(1);
    const reveal = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    expect(nudge[0].args).toEqual({ frolicId: crew.frolicId, leaveAt: reveal!.startsAt! - 8 * MINUTE });

    const complete = await named(t, "reveal:complete");
    expect(complete).toHaveLength(1);
    expect(complete[0].args).toEqual({ frolicId: crew.frolicId });
    expect(reveal?.status).toBe("on");
  });

  test("a frolic starting inside eight minutes gets no leave nudge", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { window: { start: NOON + 5 * MINUTE, end: NOON + 3 * HOUR } });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    expect(frolic?.startsAt).toBe(NOON + 5 * MINUTE);
    expect(await named(t, "keiki/outbound:onLeaveNudge")).toHaveLength(0);
    expect(await named(t, "reveal:complete")).toHaveLength(1);
  });

  test("completion closes the door on the waiting pool and clears the taps", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"], { capacity: 2 });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe(
      "waiting",
    );

    await flipDue(t, 3 * HOUR);
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    expect(frolic?.status).toBe("done");
    const hop = await t.run(async (ctx) => await ctx.db.query("hopIns").collect());
    expect(hop.map((h) => h.status)).toEqual(["left"]);
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(0);
    expect(await named(t, "whop/money:onDone")).toHaveLength(1);
    expect((await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId })).phase).toBe("done");
  });

  test("a second completion for a finished frolic does nothing", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await flipDue(t, 3 * HOUR);
    await t.mutation(internal.reveal.complete, { frolicId: crew.frolicId });
    expect(await named(t, "whop/money:onDone")).toHaveLength(1);
    await t.mutation(internal.frolics.open, {
      groupId: crew.groupId,
      day: "2026-11-15",
      kind: "daily",
      window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
      durationMinutes: 60,
      deadline: NOON + 4 * HOUR,
    });
  });
});

describe("fade", () => {
  test("fade clears the taps of an open frolic that never matched", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya", { onlyIf: ["Jordan"] });
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(1);
    await t.mutation(internal.reveal.fade, { frolicId: crew.frolicId });
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    expect(frolic?.status).toBe("faded");
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(0);
    expect((await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId })).phase).toBe(
      "faded",
    );
  });

  test("fade leaves a frolic that already has a pending reveal or is not open", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await t.mutation(internal.reveal.fade, { frolicId: crew.frolicId });
    const pending = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    expect(pending?.status).toBe("open");
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(2);

    await flipDue(t);
    await t.mutation(internal.reveal.fade, { frolicId: crew.frolicId });
    expect((await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId)))?.status).toBe("on");
  });

  test("fade ignores a frolic that is gone", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.run(async (ctx) => await ctx.db.delete("frolics", crew.frolicId));
    expect(await t.mutation(internal.reveal.fade, { frolicId: crew.frolicId })).toBeNull();
  });

  test("the clock mutation hands back the server time", async () => {
    const t = makeT();
    const now = await t.mutation(api.clock.now, {});
    expect(now).toBe(Date.now());
  });
});

describe("crons", () => {
  test("the registry holds the memory and plan jobs", () => {
    const registered = crons.crons as Record<string, { name: string; schedule: Record<string, unknown>; args: unknown[] }>;
    expect(Object.keys(registered).sort()).toEqual(["daily drop", "garden nudge", "memory close day", "weekend drop"]);
    expect(registered["garden nudge"].name).toBe("garden:nudgeCrews");
    expect(registered["garden nudge"].schedule).toEqual({ cron: "0 * * * *", type: "cron" });
    expect(registered["memory close day"].name).toBe("daily:closeMemoryDay");
    expect(registered["memory close day"].schedule).toEqual({ cron: "15 8 * * *", type: "cron" });
    expect(registered["memory close day"].args).toEqual([{}]);
    expect(registered["daily drop"].name).toBe("plans/drop:dailyDrop");
    expect(registered["daily drop"].schedule).toEqual({ cron: "0 23 * * *", type: "cron" });
    expect(registered["weekend drop"].name).toBe("plans/drop:weekendDrop");
    expect(registered["weekend drop"].schedule).toEqual({ cron: "0 17 * * 4", type: "cron" });
    for (const job of Object.values(registered)) expect(job.args).toEqual([{}]);
  });

  test("the memory sweep runs on demand and reports nothing to flush", async () => {
    const t = makeT();
    expect(await t.action(internal.memory.ingest.flushDue)).toBe(0);
  });

  test("the memory close walks every crew and passes yesterday in its own timezone", async () => {
    const t = makeT();
    vi.setSystemTime(NOON);
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Sunset Crew",
      timezone: "America/New_York",
    });
    await t.mutation(api.users.createGroup, {
      deviceToken: token("Dev"),
      firstName: "Dev",
      groupName: "Late Crew",
      timezone: "Asia/Tokyo",
    });

    await t.mutation(internal.daily.closeMemoryDay, {});
    const closes = await named(t, "memory/stats:closeDay");
    expect(closes).toHaveLength(2);
    const groups = await t.run(async (ctx) => await ctx.db.query("groups").collect());
    const expected = groups.map((g) => ({
      groupId: g._id,
      day: dayIn(g.timezone, NOON - 24 * HOUR),
    }));
    expect(closes.map((c) => c.args).sort((a, b) => String(a.day).localeCompare(String(b.day)))).toEqual(
      expected.sort((a, b) => a.day.localeCompare(b.day)),
    );
    expect(closes.map((c) => c.args.groupId)).toContain(created.groupId);
    expect(closes.map((c) => c.args.day).sort()).toEqual(["2026-11-14", "2026-11-15"]);
    expect(await named(t, "daily:closeMemoryDay")).toHaveLength(0);
  });

  test("the memory close pages past a hundred crews and finishes", async () => {
    const t = makeT();
    const creator = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Sunset Crew",
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 101; i++) {
        await ctx.db.insert("groups", {
          name: `Crew ${i}`,
          createdBy: creator.userId,
          timezone: "America/Los_Angeles",
        });
      }
    });

    await t.mutation(internal.daily.closeMemoryDay, {});
    expect(await named(t, "memory/stats:closeDay")).toHaveLength(100);
    const more = await named(t, "daily:closeMemoryDay");
    expect(more).toHaveLength(1);
    expect(more[0].args.cursor).toEqual(expect.any(String));

    vi.advanceTimersByTime(6000);
    await t.finishInProgressScheduledFunctions();
    expect(await named(t, "memory/stats:closeDay")).toHaveLength(102);
    expect(await named(t, "daily:closeMemoryDay")).toHaveLength(1);
  });

  test("an unknown timezone falls back to Los Angeles when the day is worked out", () => {
    expect(dayIn("America/Los_Angeles", NOON)).toBe("2026-11-15");
    expect(dayIn("Asia/Tokyo", NOON)).toBe("2026-11-16");
    expect(dayIn("Pacific/Kiritimati", NOON)).toBe("2026-11-16");
    expect(dayIn("Mars/Olympus_Mons", NOON)).toBe("2026-11-15");
  });
});

describe("chat and memory stubs", () => {
  test("every outbound chat hook is registered and safe to call", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const photo = await t.run(async (ctx) => await ctx.storage.store(new Blob(["x"])));
    expect(await t.mutation(internal.keiki.outbound.onDrop, { frolicId: crew.frolicId })).toBeNull();
    expect(
      await t.mutation(internal.keiki.outbound.onReveal, {
        frolicId: crew.frolicId,
        userIds: [crew.ids.Maya],
        bloomAt: NOON,
      }),
    ).toBeNull();
    expect(
      await t.mutation(internal.keiki.outbound.onLeaveNudge, { frolicId: crew.frolicId, leaveAt: NOON }),
    ).toBeNull();
    expect(
      await t.mutation(internal.keiki.outbound.onSnapWindow, { frolicId: crew.frolicId, snapAt: NOON }),
    ).toBeNull();
    expect(await t.mutation(internal.keiki.outbound.onFaded, { frolicId: crew.frolicId })).toBeNull();
    expect(
      await t.mutation(internal.keiki.outbound.onCollage, { frolicId: crew.frolicId, storageId: photo }),
    ).toBeNull();
  });

  test("recording a memory event is safe for every kind the app writes", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const kinds = ["tap", "only_if", "skip", "limit", "plan_shown", "reveal", "checkin", "snap", "group_skip"] as const;
    for (const kind of kinds) {
      await t.mutation(internal.memory.events.recordEvent, {
        eventKey: `${kind}:1`,
        kind,
        groupId: crew.groupId,
        userId: crew.ids.Maya,
        frolicId: crew.frolicId,
        revealAt: NOON,
        payload: { day: "2026-11-15", title: "Indian Rock", tags: ["sunset"] },
      });
    }
    expect(await t.run(async (ctx) => await ctx.db.query("memoryEvents").collect())).toHaveLength(kinds.length);
    expect(await t.mutation(internal.memory.stats.closeDay, { groupId: crew.groupId, day: "2026-11-15" })).toEqual({
      counted: [],
    });
  });
});

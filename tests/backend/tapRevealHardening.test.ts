/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { NOON, flipDue, makeT, setupCrew, tap, today, token, type Crew, type T } from "./setup.helpers";

const CREW = ["Maya", "Dev", "Jordan", "Priya"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubEnv("CONVEX_SITE_URL", "https://frolic.convex.site");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function rows(t: T) {
  return await t.run(async (ctx) => ({
    taps: await ctx.db.query("taps").collect(),
    reveals: await ctx.db.query("reveals").collect(),
    attendees: await ctx.db.query("attendees").collect(),
    log: await ctx.db.query("revealLog").collect(),
    frolic: (await ctx.db.query("frolics").collect()).at(-1)!,
  }));
}

async function quiet(t: T, crew: Crew, names: string[]) {
  const snapshot = await rows(t);
  expect(snapshot.frolic.status).toBe("open");
  expect(snapshot.frolic.revealAt).toBeUndefined();
  expect(snapshot.frolic.startsAt).toBeUndefined();
  expect(snapshot.attendees).toHaveLength(0);
  expect(snapshot.log).toHaveLength(0);
  for (const name of names) {
    const view = await today(t, crew, name);
    expect(view.phase).not.toBe("on");
    expect(view.reveal).toBeNull();
    const mine = view.myTap?.onlyIf.map((p) => p.userId) ?? [];
    expect(mine.every((id) => id !== crew.ids[name])).toBe(true);
  }
}

async function pendingRevealAt(t: T, crew: Crew) {
  const pending = await t.run(async (ctx) => await ctx.db.query("reveals").collect());
  expect(pending).toHaveLength(1);
  return pending[0].revealAt;
}

async function revealTimes(t: T, crew: Crew, names: string[]) {
  const out: Record<string, { revealAt: number; going: string[]; bloomAt: number }> = {};
  for (const name of names) {
    const view = await today(t, crew, name);
    expect(view.phase).toBe("on");
    out[name] = {
      revealAt: view.reveal!.revealAt,
      bloomAt: view.reveal!.bloomAt,
      going: view.reveal!.going.map((p) => p.name).sort(),
    };
  }
  return out;
}

describe("the secret I'm down", () => {
  test("a double tap from one phone in the same second leaves one tap and reveals once", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Dev");

    const before = await rows(t);
    expect(before.taps.filter((x) => x.userId === crew.ids.Maya)).toHaveLength(1);
    expect(before.taps.filter((x) => x.userId === crew.ids.Dev)).toHaveLength(1);
    expect(before.reveals).toHaveLength(1);
    expect(before.attendees).toHaveLength(0);

    const at = before.reveals[0].revealAt;
    await flipDue(t, at - Date.now() + 10);

    const after = await rows(t);
    expect(after.reveals).toHaveLength(0);
    expect(after.attendees).toHaveLength(2);
    expect(after.log).toHaveLength(2);
    expect(after.log.every((row) => row.revealAt === at)).toBe(true);
    const seen = await revealTimes(t, crew, ["Maya", "Dev", "Jordan"]);
    expect(seen.Maya.revealAt).toBe(at);
    expect(seen.Dev.revealAt).toBe(at);
    expect(seen.Jordan.revealAt).toBe(at);
    expect(seen.Jordan.going).toEqual(["Dev", "Maya"]);
  });

  test("two phones committing in the same millisecond reveal once at one timestamp", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    const mayaQuiet = await today(t, crew, "Maya");
    const jordanQuiet = await today(t, crew, "Jordan");
    await tap(t, crew, "Dev");

    expect(await today(t, crew, "Maya")).toEqual(mayaQuiet);
    expect(await today(t, crew, "Jordan")).toEqual(jordanQuiet);
    await quiet(t, crew, CREW);

    const at = await pendingRevealAt(t, crew);
    await flipDue(t, at - Date.now() + 10);

    const seen = await revealTimes(t, crew, CREW);
    for (const name of CREW) {
      expect(seen[name].revealAt).toBe(at);
      expect(seen[name].bloomAt).toBe(at + 800);
      expect(seen[name].going).toEqual(["Dev", "Maya"]);
    }
    expect((await rows(t)).log).toHaveLength(2);
  });

  test("a tap at exactly revealAt joins the same reveal instead of delaying it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const at = await pendingRevealAt(t, crew);

    vi.advanceTimersByTime(at - Date.now());
    await tap(t, crew, "Jordan");
    await t.finishInProgressScheduledFunctions();
    await flipDue(t, 20);

    const seen = await revealTimes(t, crew, CREW);
    for (const name of CREW) expect(seen[name].revealAt).toBe(at);
    expect(seen.Priya.going).toEqual(["Dev", "Jordan", "Maya"]);
    expect((await rows(t)).log).toHaveLength(3);
  });

  test("a tap at exactly revealAt whose window does not fit keeps the plan it already had", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const at = await pendingRevealAt(t, crew);

    vi.advanceTimersByTime(at - Date.now());
    await tap(t, crew, "Jordan", { window: { start: NOON + 5 * 24 * 60 * 60 * 1000, end: NOON + 6 * 24 * 60 * 60 * 1000 } });
    await t.finishInProgressScheduledFunctions();
    await flipDue(t, 20);

    const seen = await revealTimes(t, crew, ["Maya", "Dev"]);
    expect(seen.Maya.revealAt).toBe(at);
    expect(seen.Maya.going).toEqual(["Dev", "Maya"]);
    expect((await rows(t)).log).toHaveLength(2);
  });

  test("a hop in after the reveal lands on the timed reveal and cannot move it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const at = await pendingRevealAt(t, crew);
    await flipDue(t, at - Date.now() + 10);
    const before = await (await today(t, crew, "Priya")).reveal!;
    expect(before.me.canHopIn).toBe(true);

    await tap(t, crew, "Priya");

    const after = await today(t, crew, "Priya");
    expect(after.reveal!.revealAt).toBe(at);
    expect(after.reveal!.me).toMatchObject({ going: true, role: "hopIn" });
    expect(after.reveal!.going.map((p) => p.name).sort()).toEqual(["Dev", "Maya", "Priya"]);
    const seen = await revealTimes(t, crew, ["Maya", "Dev", "Jordan"]);
    expect(seen.Jordan.revealAt).toBe(at);
    expect(seen.Jordan.going).toEqual(["Dev", "Maya", "Priya"]);
  });

  test("a hop in is refused once the plan has started", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const at = await pendingRevealAt(t, crew);
    await flipDue(t, at - Date.now() + 10);
    const frolic = (await rows(t)).frolic;
    vi.setSystemTime(frolic.startsAt!);
    await expect(tap(t, crew, "Priya")).rejects.toThrow(/already started/);
    expect((await today(t, crew, "Priya")).reveal!.me.going).toBe(false);
  });
});

describe("the reveal", () => {
  test("a second reveal attempt adds no seat, no log row and no new timestamp", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const at = await pendingRevealAt(t, crew);
    await flipDue(t, at - Date.now() + 10);
    const first = await rows(t);

    await t.mutation(internal.reveal.flip, { frolicId: crew.frolicId, revealAt: at });
    await t.mutation(internal.reveal.flip, { frolicId: crew.frolicId, revealAt: at + 1 });
    await flipDue(t, 10);

    const second = await rows(t);
    expect(second.attendees).toHaveLength(first.attendees.length);
    expect(second.log).toHaveLength(first.log.length);
    expect(second.frolic.status).toBe("on");
    expect(second.frolic.revealAt).toBe(first.frolic.revealAt);
    expect((await revealTimes(t, crew, ["Maya"])).Maya.revealAt).toBe(at);
  });

  test("a flip before revealAt is refused and leaves the phones waiting", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const at = await pendingRevealAt(t, crew);
    await t.mutation(internal.reveal.flip, { frolicId: crew.frolicId, revealAt: at });

    await quiet(t, crew, CREW);
    expect(await pendingRevealAt(t, crew)).toBe(at);
    await flipDue(t, at - Date.now() + 10);
    expect((await rows(t)).log).toHaveLength(2);
  });
});

describe("the daily plan at its deadline", () => {
  test("the deadline with one tap fades the plan and leaves nothing to read", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW, { deadlineIn: 10_000 });
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    vi.advanceTimersByTime(10_000);
    await t.finishInProgressScheduledFunctions();

    const after = await rows(t);
    expect(after.frolic.status).toBe("faded");
    expect(after.taps).toHaveLength(0);
    expect(after.reveals).toHaveLength(0);
    expect(after.log).toHaveLength(0);
    expect(await today(t, crew, "Maya")).toMatchObject({ phase: "faded", myTap: null, reveal: null });
    expect(await today(t, crew, "Dev")).toMatchObject({ phase: "faded", myTap: null, reveal: null });
  });

  test("the deadline with zero taps fades the plan instead of leaving it open", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW, { deadlineIn: 10_000 });
    vi.advanceTimersByTime(10_000);
    await t.finishInProgressScheduledFunctions();

    const after = await rows(t);
    expect(after.frolic.status).toBe("faded");
    expect(after.reveals).toHaveLength(0);
    for (const name of CREW) {
      expect(await today(t, crew, name)).toMatchObject({ phase: "faded", frolic: expect.anything(), reveal: null });
    }
  });

  test("an empty crew never matches itself and fades quietly", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"], { deadlineIn: 10_000 });
    expect((await today(t, crew, "Maya")).phase).toBe("solo");
    await tap(t, crew, "Maya");
    expect((await today(t, crew, "Maya")).phase).toBe("waiting");
    expect((await rows(t)).reveals).toHaveLength(0);
    vi.advanceTimersByTime(10_000);
    await t.finishInProgressScheduledFunctions();
    expect((await rows(t)).frolic.status).toBe("faded");
    expect((await today(t, crew, "Maya")).reveal).toBeNull();
  });

  test("a busy day of free plans never opens a second daily plan", async () => {
    const t = makeT();
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Sunset Crew",
    });
    await t.mutation(api.users.joinGroup, {
      deviceToken: token("Dev"),
      firstName: "Dev",
      inviteCode: created.inviteCode,
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 11; i++) {
        await ctx.db.insert("frolics", {
          groupId: created.groupId,
          day: "2026-11-15",
          kind: "daily",
          status: "faded",
          window: { start: NOON, end: NOON + 60 * 60 * 1000 },
          durationMinutes: 60,
          deadline: NOON,
          origin: "free",
        });
      }
    });
    const args = {
      groupId: created.groupId,
      day: "2026-11-15",
      kind: "daily" as const,
      window: { start: NOON + 60 * 60 * 1000, end: NOON + 6 * 60 * 60 * 1000 },
      durationMinutes: 60,
      deadline: NOON + 4 * 60 * 60 * 1000,
    };
    const first = await t.mutation(internal.frolics.open, args);
    const again = await t.mutation(internal.frolics.open, args);

    expect(again).toBe(first);
    const daily = await t.run(async (ctx) =>
      (await ctx.db.query("frolics").collect()).filter((f) => f.origin !== "free"),
    );
    expect(daily).toHaveLength(1);
    expect(daily[0]._id).toBe(first);
  });

  test("a free plan that faded does not hide the day's plan", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const freeId = await t.run(async (ctx) =>
      ctx.db.insert("frolics", {
        groupId: crew.groupId,
        day: "2026-11-15",
        kind: "daily",
        status: "faded",
        window: { start: NOON, end: NOON + 2 * 60 * 60 * 1000 },
        durationMinutes: 60,
        deadline: NOON + 30 * 60 * 1000,
        origin: "free",
      }),
    );

    const view = await today(t, crew, "Maya");
    expect(view.frolic?.frolicId).toBe(crew.frolicId);
    expect(view.phase).not.toBe("faded");
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const at = await pendingRevealAt(t, crew);
    await flipDue(t, at - Date.now() + 10);
    const seen = await revealTimes(t, crew, ["Maya"]);
    expect(seen.Maya.revealAt).toBe(at);
    expect(seen.Maya.going).toEqual(["Dev", "Maya"]);
    expect(freeId).toBeDefined();
  });
});

describe("a crew that changes under the plan", () => {
  test("a member leaving between tap and match cancels the match with nothing to read", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW, { deadlineIn: 10_000 });
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    await tap(t, crew, "Dev");
    expect(await pendingRevealAt(t, crew)).toBeGreaterThan(NOON);

    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });

    const after = await rows(t);
    expect(after.reveals).toHaveLength(0);
    expect(after.attendees).toHaveLength(0);
    expect(after.log).toHaveLength(0);
    expect(after.frolic.status).toBe("open");
    expect(after.taps.map((x) => x.userId)).toEqual([crew.ids.Maya]);
    expect((await today(t, crew, "Maya")).reveal).toBeNull();

    vi.advanceTimersByTime(10_000);
    await t.finishInProgressScheduledFunctions();
    expect((await rows(t)).frolic.status).toBe("faded");
    expect((await today(t, crew, "Maya")).phase).toBe("faded");
  });

  test("a member removed mid plan gives the seat away and keeps one reveal timestamp", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW, { capacity: 2 });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const at = await pendingRevealAt(t, crew);
    await flipDue(t, at - Date.now() + 10);
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Priya"), frolicId: crew.frolicId })).toBe("waiting");
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe("waiting");

    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });
    await flipDue(t, 10);

    const after = await rows(t);
    expect(after.frolic.status).toBe("on");
    expect(after.frolic.revealAt).toBe(at);
    expect(after.log.map((row) => row.revealAt)).toEqual([at]);
    const seen = await revealTimes(t, crew, ["Maya", "Priya", "Jordan"]);
    for (const name of ["Maya", "Priya", "Jordan"]) expect(seen[name].revealAt).toBe(at);
    expect(seen.Maya.going).toEqual(["Maya", "Priya"]);
    expect(seen.Jordan.going).toEqual(["Maya", "Priya"]);
  });

  test("a hard deleted member leaves the crew of one reading as solo", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.run(async (ctx) => await ctx.db.delete("users", crew.ids.Dev));

    const view = await today(t, crew, "Maya");
    expect(view.memberCount).toBe(1);
    expect(view.phase).toBe("solo");
    expect(view.frolic?.frolicId).toBe(crew.frolicId);
    const crewView = await t.query(api.crew.crew, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      day: "2026-11-15",
    });
    expect(crewView.memberCount).toBe(view.memberCount);

    await tap(t, crew, "Maya");
    expect((await today(t, crew, "Maya")).phase).toBe("waiting");
    expect((await today(t, crew, "Maya")).reveal).toBeNull();
  });

  test("a deleted user's tap cannot match someone else into a party of one", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Dev");
    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });
    expect((await rows(t)).taps.map((x) => x.userId)).toEqual([]);

    await tap(t, crew, "Maya");
    const after = await rows(t);
    expect(after.reveals).toHaveLength(0);
    expect(after.attendees).toHaveLength(0);
    expect((await today(t, crew, "Maya")).phase).toBe("waiting");

    await tap(t, crew, "Jordan");
    const at = await pendingRevealAt(t, crew);
    await flipDue(t, at - Date.now() + 10);
    expect((await revealTimes(t, crew, ["Maya"])).Maya.going).toEqual(["Jordan", "Maya"]);
    expect((await rows(t)).log).toHaveLength(2);
  });
});

describe("a phone cannot learn the outcome early", () => {
  test("every waiting phone reads the identical revealAt and no phone reads it before", async () => {
    const t = makeT();
    const crew = await setupCrew(t, CREW);
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    await tap(t, crew, "Jordan", { onlyIf: ["Priya"] });
    const before = await Promise.all(CREW.map((name) => today(t, crew, name)));
    await tap(t, crew, "Dev");
    const pending = await Promise.all(CREW.map((name) => today(t, crew, name)));

    expect(pending[0]).toEqual(before[0]);
    expect(pending[1].reveal).toBeNull();
    const at = await pendingRevealAt(t, crew);
    vi.advanceTimersByTime(at - NOON - 1);
    await t.finishInProgressScheduledFunctions();
    for (const view of await Promise.all(CREW.map((name) => today(t, crew, name)))) {
      expect(view.reveal).toBeNull();
      expect(view.phase).not.toBe("on");
    }

    await flipDue(t, 2);
    const seen = await revealTimes(t, crew, CREW);
    const times = new Set(CREW.map((name) => seen[name].revealAt));
    expect(times).toEqual(new Set([at]));
    expect(seen.Priya.going).toEqual(["Dev", "Maya"]);
    expect((await rows(t)).log.map((row) => row.revealAt)).toEqual([at, at]);
  });
});

/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { NOON, flipDue, makeT, setupCrew, tap, type Crew, type T } from "./setup.helpers";

const NAMES = ["Maya", "Dev", "Jordan"];
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

const phoneOf = (name: string) => "+1510555" + String(name.charCodeAt(0)).padStart(4, "0");

async function link(t: T, crew: Crew, names: string[]) {
  await t.run(async (ctx) => {
    for (const name of names) {
      await ctx.db.insert("keikiLinks", { phone: phoneOf(name), userId: crew.ids[name], paused: false, linkedAt: NOON });
    }
  });
}

async function flush(t: T) {
  await t.finishInProgressScheduledFunctions();
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
}

async function outbox(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("keikiOutbox").collect());
}

async function plantOld(t: T, crew: Crew, day: string, going: string[] = []) {
  return await t.run(async (ctx) => {
    const frolicId = await ctx.db.insert("frolics", {
      groupId: crew.groupId,
      day,
      kind: "daily",
      status: "done",
      window: { start: NOON, end: NOON + HOUR },
      durationMinutes: 60,
      deadline: NOON,
    });
    for (const name of going) {
      await ctx.db.insert("attendees", {
        frolicId,
        groupId: crew.groupId,
        userId: crew.ids[name],
        role: "matched",
        status: "going",
        revealAt: NOON,
        bloomAt: NOON,
      });
    }
    return frolicId;
  });
}

const pushesTo = (rows: Awaited<ReturnType<typeof outbox>>, userId: Id<"users">) =>
  rows.filter((row) => row.userId === userId).map((row) => row.kind).sort();

describe("the two pushes a day promise", () => {
  test("a crew nobody answers gets the drop and one thirst nudge, never a fade notice", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await link(t, crew, NAMES);
    await plantOld(t, crew, "2026-11-09", ["Maya", "Dev"]);

    vi.setSystemTime(NOON + 3 * HOUR);
    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: crew.frolicId });
    await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId });
    await t.mutation(internal.reveal.fade, { frolicId: crew.frolicId });
    await flush(t);

    const rows = await outbox(t);
    expect(rows.filter((row) => row.kind === "faded")).toHaveLength(0);
    for (const name of NAMES) expect(pushesTo(rows, crew.ids[name])).toEqual(["drop", "nudge"]);
  });

  test("the fade notice reaches the people who said yes and nobody else", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await link(t, crew, NAMES);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev", { kind: "notToday" });
    await t.mutation(internal.reveal.fade, { frolicId: crew.frolicId });
    await flush(t);

    const faded = (await outbox(t)).filter((row) => row.kind === "faded");
    expect(faded.map((row) => row.userId)).toEqual([crew.ids.Maya]);
    expect(faded[0].target).toBe(phoneOf("Maya"));
  });
});

describe("the garden thirst nudge", () => {
  test("lands once a day even when the newest flower changes under it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await link(t, crew, ["Maya"]);
    await plantOld(t, crew, "2026-11-09", ["Maya", "Dev"]);

    vi.setSystemTime(NOON + 5 * HOUR);
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(true);
    await plantOld(t, crew, "2026-11-10", ["Maya", "Dev"]);
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(false);
    vi.setSystemTime(NOON + 6 * HOUR);
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(false);

    const nudges = await t.run(async (ctx) => await ctx.db.query("gardenNudges").collect());
    expect(nudges).toHaveLength(1);
    expect((await outbox(t)).filter((row) => row.kind === "nudge" && row.userId === crew.ids.Maya)).toHaveLength(1);
  });

  test("crosses the November 1 time change without nudging twice, and a new local day is new again", async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 31, 17, 0, 0));
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await link(t, crew, ["Maya"]);
    await plantOld(t, crew, "2026-10-25", ["Maya", "Dev"]);

    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(true);
    vi.setSystemTime(Date.UTC(2026, 9, 31, 20, 0, 0));
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(false);
    vi.setSystemTime(Date.UTC(2026, 10, 1, 8, 30, 0));
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(false);
    vi.setSystemTime(Date.UTC(2026, 10, 1, 9, 30, 0));
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(false);
    await plantOld(t, crew, "2026-10-26", ["Maya", "Dev"]);
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(true);
    vi.setSystemTime(Date.UTC(2026, 10, 2, 1, 0, 0));
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: crew.groupId })).toBe(false);

    const nudges = await t.run(async (ctx) => await ctx.db.query("gardenNudges").collect());
    expect(nudges).toHaveLength(2);
  });

  test("a crew with no frolic at all keeps its one nudge in reserve instead of spending it on nothing", async () => {
    const t = makeT();
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: "device-solo-0123456789abcdefghijklmnop",
      firstName: "Ana",
      groupName: "Quiet Crew",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("keikiLinks", { phone: phoneOf("Ana"), userId: created.userId, paused: false, linkedAt: NOON });
    });
    vi.setSystemTime(NOON + 9 * DAY);
    expect(await t.mutation(internal.garden.nudgeCrew, { groupId: created.groupId })).toBe(false);
    expect(await t.run(async (ctx) => await ctx.db.query("gardenNudges").collect())).toHaveLength(0);
  });
});

describe("every push lands on the person it is about", () => {
  const by = async (t: T, kind: string) => (await outbox(t)).filter((row) => row.kind === kind);

  test("the leave nudge, the snap ask and the collage skip whoever was not in it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await link(t, crew, NAMES);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await t.mutation(internal.keiki.outbound.onLeaveNudge, { frolicId: crew.frolicId, leaveAt: Date.now() });
    await t.run(async (ctx) => {
      await ctx.db.insert("checkins", { frolicId: crew.frolicId, userId: crew.ids.Maya, method: "geofence", at: NOON });
    });
    await t.mutation(internal.keiki.outbound.onSnapWindow, { frolicId: crew.frolicId, snapAt: NOON });
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x01])])));
    await t.run(async (ctx) => {
      await ctx.db.insert("snaps", { frolicId: crew.frolicId, groupId: crew.groupId, userId: crew.ids.Maya, storageId, snapAt: NOON, takenAt: NOON });
    });
    await t.mutation(internal.keiki.outbound.onCollage, { frolicId: crew.frolicId, storageId });

    expect((await by(t, "nudge")).map((row) => row.userId).sort()).toEqual([crew.ids.Dev, crew.ids.Maya].sort());
    expect((await by(t, "snap")).map((row) => row.userId)).toEqual([crew.ids.Maya]);
    expect((await by(t, "collage")).map((row) => row.userId)).toEqual([crew.ids.Maya]);
    const phoneOfUser = new Map(["Maya", "Dev", "Jordan"].map((name) => [crew.ids[name], phoneOf(name)]));
    for (const row of await by(t, "nudge")) expect(row.target).toBe(phoneOfUser.get(row.userId!));
    expect((await outbox(t)).filter((row) => row.userId === crew.ids.Jordan && row.kind !== "hopIn")).toHaveLength(0);
  });

  test("the reveal reaches everyone who is in, and holds until revealAt", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await link(t, crew, NAMES);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await t.mutation(internal.reveal.complete, { frolicId: crew.frolicId });
    await flush(t);
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    const revealAt = frolic?.revealAt ?? 0;
    expect(revealAt).toBeGreaterThan(0);

    const reveal = (await by(t, "reveal")).filter((row) => row.userId);
    expect(reveal.map((row) => row.userId).sort()).toEqual([crew.ids.Dev, crew.ids.Maya].sort());
    expect(reveal.every((row) => row.notBefore === revealAt)).toBe(true);

    const due = await t.query(internal.keiki.outbound.due, { frolicId: crew.frolicId, now: revealAt - 1 });
    expect(due.filter((row) => row.kind === "reveal")).toHaveLength(0);
    const after = await t.query(internal.keiki.outbound.due, { frolicId: crew.frolicId, now: revealAt });
    expect(after.filter((row) => row.kind === "reveal")).toHaveLength(reveal.length);
  });
});

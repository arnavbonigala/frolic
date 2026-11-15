/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token, type T } from "../setup.helpers";

const DAY = "2026-11-15";
const MINUTE = 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function goneFrolic(t: T): Promise<Id<"frolics">> {
  const crew = await setupCrew(t, ["Ada", "Bo"]);
  await t.run(async (ctx) => await ctx.db.delete("frolics", crew.frolicId));
  return crew.frolicId;
}

describe("frolic errors", () => {
  test("every frolic write refuses a frolic that no longer exists", async () => {
    const t = makeT();
    const frolicId = await goneFrolic(t);
    await expect(t.mutation(api.taps.tap, { deviceToken: token("Ada"), frolicId, kind: "down" })).rejects.toThrow(
      /frolic is gone/,
    );
    await expect(t.mutation(api.taps.untap, { deviceToken: token("Ada"), frolicId })).rejects.toThrow(
      /frolic is gone/,
    );
    await expect(t.mutation(api.frolics.hopIn, { deviceToken: token("Ada"), frolicId })).rejects.toThrow(
      /frolic is gone/,
    );
    await expect(t.mutation(api.frolics.sitOut, { deviceToken: token("Ada"), frolicId })).rejects.toThrow(
      /frolic is gone/,
    );
    await expect(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Ada"), frolicId, method: "manual" }),
    ).rejects.toThrow(/frolic is gone/);
    await expect(t.mutation(api.etas.setMine, { deviceToken: token("Ada"), frolicId, minutes: 5, onTheWay: true })).rejects.toThrow(
      /frolic is gone/,
    );
    await expect(t.mutation(api.snaps.start, { deviceToken: token("Ada"), frolicId })).rejects.toThrow(
      /frolic is gone/,
    );
    await expect(
      t.mutation(api.snaps.addMine, {
        deviceToken: token("Ada"),
        frolicId,
        storageId: await t.run(async (ctx) => await ctx.storage.store(new Blob(["x"]))),
        takenAt: NOON,
      }),
    ).rejects.toThrow(/frolic is gone/);
  });

  test("a tap on a frolic that is already on but started is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"], {
      window: { start: NOON + 5 * 60 * 1000, end: NOON + 4 * HOUR },
    });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect((await t.query(api.frolics.today, { deviceToken: token("Jordan"), groupId: crew.groupId })).phase).toBe("on");
    vi.advanceTimersByTime(5 * 60 * 1000);
    await expect(tap(t, crew, "Jordan")).rejects.toThrow(/already started/);
  });

  test("a tap on a done frolic is refused as over", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await flipDue(t, 6 * HOUR);
    await expect(tap(t, crew, "Maya")).rejects.toThrow(/over/);
    await expect(
      t.mutation(api.taps.untap, { deviceToken: token("Maya"), frolicId: crew.frolicId }),
    ).resolves.toBeNull();
  });

  test("only if drops yourself and repeats and refuses more than twelve friends", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya", { onlyIf: ["Dev", "Dev", "Maya"] });
    const stored = await t.run(async (ctx) => await ctx.db.query("taps").collect());
    expect(stored[0].onlyIf).toEqual([crew.ids.Dev]);

    const many = ["Maya", ...Array.from({ length: 13 }, (_, i) => `Friend${i}`)];
    const big = await setupCrew(t, many);
    await expect(tap(t, big, "Maya", { onlyIf: many.slice(1) })).rejects.toThrow(/Too many people in only if/);
  });

  test("a tap window longer than a day or ending before it starts is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await expect(
      tap(t, crew, "Maya", { window: { start: NOON + 2 * HOUR, end: NOON + HOUR } }),
    ).rejects.toThrow(/window does not work/);
    await expect(
      tap(t, crew, "Maya", { window: { start: NOON + HOUR, end: NOON + 25 * HOUR + MINUTE } }),
    ).rejects.toThrow(/window does not work/);
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(0);
  });

  test("hop in and sit out need a crew member and an on frolic", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(
      t.mutation(api.frolics.hopIn, { deviceToken: token("Eve"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/not in this crew/);
    await expect(
      t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/not happening/);
    expect(
      await t.mutation(api.frolics.sitOut, { deviceToken: token("Jordan"), frolicId: crew.frolicId }),
    ).toBeNull();

    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await expect(
      t.mutation(api.frolics.sitOut, { deviceToken: token("Eve"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/not in this crew/);
    expect(
      await t.mutation(api.frolics.sitOut, { deviceToken: token("Jordan"), frolicId: crew.frolicId }),
    ).toBeNull();
    expect(
      await t.mutation(api.frolics.sitOut, { deviceToken: token("Maya"), frolicId: crew.frolicId }),
    ).toBeNull();
    expect((await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId })).reveal?.me.going).toBe(
      false,
    );
  });
});

describe("actor errors", () => {
  test("untapAs removes a tap through the internal path", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(internal.taps.tapAs, {
      userId: crew.ids.Maya,
      frolicId: crew.frolicId,
      kind: "down",
      source: "imessage",
    });
    expect(await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId })).toMatchObject({
      phase: "waiting",
    });
    await t.mutation(internal.taps.untapAs, { userId: crew.ids.Maya, frolicId: crew.frolicId });
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(0);
    expect((await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId })).phase).toBe("open");
    await expect(
      t.mutation(internal.taps.tapAs, {
        userId: crew.ids.Maya,
        frolicId: await goneFrolic(t),
        kind: "down",
        source: "imessage",
      }),
    ).rejects.toThrow(/frolic is gone/);
  });

  test("limits refuse nonsense values and keep the old ones", async () => {
    const t = makeT();
    await setupCrew(t, ["Maya"]);
    await t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: 25, homeBy: 60 });
    await expect(t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: -1 })).rejects.toThrow(
      /out of range/,
    );
    await expect(t.mutation(api.limits.set, { deviceToken: token("Maya"), maxMinutes: 601 })).rejects.toThrow(
      /out of range/,
    );
    await expect(t.mutation(api.limits.set, { deviceToken: token("Maya"), homeBy: -1 })).rejects.toThrow(
      /out of range/,
    );
    expect(await t.query(api.limits.mine, { deviceToken: token("Maya") })).toEqual({
      budgetCap: 25,
      energy: null,
      maxMinutes: null,
      homeBy: 60,
    });
  });

  test("the free status write refuses a bad day, a bad window and bad minutes before writing", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    for (const args of [
      { day: "tomorrow", state: "now" as const },
      { day: DAY, state: "window" as const, window: { start: NOON + HOUR, end: NOON } },
      { day: DAY, state: "now" as const, minutesAway: -1 },
    ]) {
      await expect(
        t.mutation(api.crew.setFree, { deviceToken: token("Maya"), groupId: crew.groupId, ...args }),
      ).rejects.toBeTruthy();
    }
    expect(await t.run(async (ctx) => await ctx.db.query("availability").collect())).toHaveLength(0);
  });

  test("forUsers reports nothing for people without limits", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: 30 });
    const rows = await t.query(internal.limits.forUsers, { userIds: [crew.ids.Maya, crew.ids.Dev] });
    expect(rows).toEqual([
      { userId: crew.ids.Maya, budgetCap: 30, energy: null, maxMinutes: null, homeBy: null },
      { userId: crew.ids.Dev, budgetCap: null, energy: null, maxMinutes: null, homeBy: null },
    ]);
    expect(await t.query(internal.limits.forUsers, { userIds: [] })).toEqual([]);
  });
});

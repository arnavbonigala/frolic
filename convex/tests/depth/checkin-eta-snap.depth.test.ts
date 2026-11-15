/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token, type Crew, type T } from "../setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function revealed(t: T, names: string[] = ["Maya", "Dev", "Jordan"], opts = {}): Promise<Crew> {
  const crew = await setupCrew(t, names, opts);
  await tap(t, crew, names[0]);
  await tap(t, crew, names[1]);
  await flipDue(t);
  return crew;
}

const scheduledNames = async (t: T) =>
  (await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).map((s) => s.name);

describe("check in", () => {
  test("check in is refused before the reveal and after the frolic is done", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await expect(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" }),
    ).rejects.toThrow(/people going/);

    await flipDue(t);
    await flipDue(t, 3 * HOUR);
    await expect(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" }),
    ).rejects.toThrow(/people going/);
    expect(await t.run(async (ctx) => await ctx.db.query("checkins").collect())).toHaveLength(0);
  });

  test("check in schedules the arrival hook once and the check in reads back", async () => {
    const t = makeT();
    const crew = await revealed(t);
    const id = await t.mutation(api.checkins.checkInMe, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      method: "geofence",
    });
    expect(await t.mutation(api.checkins.checkInMe, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      method: "manual",
    })).toBe(id);
    await t.finishInProgressScheduledFunctions();

    const rows = await t.run(async (ctx) => await ctx.db.query("checkins").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ _id: id, userId: crew.ids.Maya, method: "geofence", frolicId: crew.frolicId });
    expect(rows[0].at).toBeGreaterThanOrEqual(NOON);
    expect((await scheduledNames(t)).filter((n) => n === "whop/money:onArrive")).toHaveLength(1);
  });

  test("someone who sat out cannot check in to a frolic that is on", async () => {
    const t = makeT();
    const crew = await revealed(t);
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    await expect(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Dev"), frolicId: crew.frolicId, method: "manual" }),
    ).rejects.toThrow(/people going/);
    expect((await t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: crew.groupId })).reveal?.me.going).toBe(
      false,
    );
  });

  test("a guest who is not in the crew cannot check in", async () => {
    const t = makeT();
    const crew = await revealed(t);
    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Eve"), frolicId: crew.frolicId, method: "manual" }),
    ).rejects.toThrow(/people going/);
    await expect(
      t.mutation(internal.checkins.checkInAs, {
        userId: crew.ids.Dev,
        frolicId: crew.frolicId,
        method: "imessage",
      }),
    ).resolves.toBeNull();
  });
});

describe("on my way", () => {
  test("the edges of the minutes range are legal and just outside them is not", async () => {
    const t = makeT();
    const crew = await revealed(t);
    for (const minutes of [0, 600]) {
      await t.mutation(api.etas.setMine, {
        deviceToken: token("Maya"),
        frolicId: crew.frolicId,
        minutes,
        onTheWay: true,
      });
    }
    for (const minutes of [-1, 601, 600.5]) {
      await expect(
        t.mutation(api.etas.setMine, {
          deviceToken: token("Maya"),
          frolicId: crew.frolicId,
          minutes,
          onTheWay: true,
        }),
      ).rejects.toThrow(/out of range/);
    }
    const view = await t.query(api.etas.forFrolic, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(view).toHaveLength(1);
    expect(view[0].minutes).toBe(600);
  });

  test("an eta reads empty for a frolic that is gone or not on yet, and for a stranger", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    expect(await t.query(api.etas.forFrolic, { deviceToken: token("Maya"), frolicId: crew.frolicId })).toEqual([]);

    const gone = await setupCrew(t, ["Priya", "Sam"]);
    await t.run(async (ctx) => await ctx.db.delete("frolics", gone.frolicId));
    expect(await t.query(api.etas.forFrolic, { deviceToken: token("Priya"), frolicId: gone.frolicId })).toEqual([]);

    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(
      t.query(api.etas.forFrolic, { deviceToken: token("Eve"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/not in this crew/);
    await expect(
      t.mutation(api.etas.setMine, { deviceToken: token("Eve"), frolicId: crew.frolicId, minutes: 5, onTheWay: true }),
    ).rejects.toThrow(/people going/);
  });

  test("an eta on a frolic that is gone is refused", async () => {
    const t = makeT();
    const crew = await revealed(t);
    await t.run(async (ctx) => await ctx.db.delete("frolics", crew.frolicId));
    await expect(
      t.mutation(api.etas.setMine, { deviceToken: token("Maya"), frolicId: crew.frolicId, minutes: 5, onTheWay: true }),
    ).rejects.toThrow(/frolic is gone/);
  });
});

describe("group snap", () => {
  test("the snap row carries its crew and a second window opens a second row", async () => {
    const t = makeT();
    const crew = await revealed(t);
    const first = await t.run(async (ctx) => await ctx.storage.store(new Blob(["one"])));
    const second = await t.run(async (ctx) => await ctx.storage.store(new Blob(["two"])));

    const snapAt = await t.mutation(api.snaps.start, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    await t.mutation(internal.checkins.checkInAs, {
      userId: crew.ids.Maya,
      frolicId: crew.frolicId,
      method: "manual",
    });
    vi.advanceTimersByTime(2500);
    await t.mutation(api.snaps.addMine, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      storageId: first,
      takenAt: Date.now(),
    });
    const row = (await t.run(async (ctx) => await ctx.db.query("snaps").collect()))[0];
    expect(row).toMatchObject({
      frolicId: crew.frolicId,
      groupId: crew.groupId,
      userId: crew.ids.Maya,
      storageId: first,
      snapAt,
    });

    vi.advanceTimersByTime(125000);
    const secondSnapAt = await t.mutation(api.snaps.start, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    expect(secondSnapAt).toBeGreaterThan(snapAt + 120000);
    vi.advanceTimersByTime(2500);
    await t.mutation(internal.snaps.addSnapAs, {
      userId: crew.ids.Maya,
      frolicId: crew.frolicId,
      storageId: second,
      takenAt: Date.now(),
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("snaps").collect());
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.snapAt)).toEqual([snapAt, secondSnapAt]);
    expect(rows[1].storageId).toBe(second);
  });

  test("a snap before the countdown finishes or from someone not going is refused", async () => {
    const t = makeT();
    const crew = await revealed(t);
    const photo = await t.run(async (ctx) => await ctx.storage.store(new Blob(["x"])));
    await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" });
    const snapAt = await t.mutation(api.snaps.start, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    await expect(
      t.mutation(api.snaps.addMine, {
        deviceToken: token("Maya"),
        frolicId: crew.frolicId,
        storageId: photo,
        takenAt: snapAt,
      }),
    ).rejects.toThrow(/window is closed/);
    await expect(
      t.mutation(internal.snaps.addSnapAs, {
        userId: crew.ids.Jordan,
        frolicId: crew.frolicId,
        storageId: photo,
        takenAt: snapAt,
      }),
    ).rejects.toThrow(/Check in first/);
  });

  test("the group snap is refused once the frolic is done", async () => {
    const t = makeT();
    const crew = await revealed(t);
    await flipDue(t, 3 * HOUR);
    await expect(
      t.mutation(api.snaps.start, { deviceToken: token("Maya"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/people going/);
  });
});

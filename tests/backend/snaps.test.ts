/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { NOON, flipDue, makeT, setupCrew, tap, token, type T, type Crew } from "./setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function ready(t: T, crew: Crew) {
  await tap(t, crew, "Maya");
  await tap(t, crew, "Dev");
  await flipDue(t);
  return await t.mutation(api.snaps.start, { deviceToken: token("Maya"), frolicId: crew.frolicId });
}

async function snap(t: T, crew: Crew, name: string, snapAt: number) {
  const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0x01])])));
  await t.run(async (ctx) =>
    ctx.db.insert("snaps", {
      frolicId: crew.frolicId,
      groupId: crew.groupId,
      userId: crew.ids[name],
      storageId,
      snapAt,
      takenAt: snapAt + 100,
    }),
  );
}

describe("snaps.forFrolic", () => {
  test("a person with no snap sees nothing, and adding one unlocks the set", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    const snapAt = await ready(t, crew);
    expect(await t.query(api.snaps.forFrolic, { deviceToken: token("Maya"), frolicId: crew.frolicId })).toEqual([]);
    await snap(t, crew, "Maya", snapAt);
    const maya = await t.query(api.snaps.forFrolic, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    expect(maya).toHaveLength(1);
    expect(maya[0]).toMatchObject({ userId: crew.ids.Maya, mine: true });
    expect(maya[0].url).toContain("http");
    expect(await t.query(api.snaps.forFrolic, { deviceToken: token("Dev"), frolicId: crew.frolicId })).toEqual([]);
    await snap(t, crew, "Dev", snapAt);
    const dev = await t.query(api.snaps.forFrolic, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(dev).toHaveLength(2);
    expect(dev.every((row) => row.url !== null)).toBe(true);
  });

  test("someone outside the crew is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await ready(t, crew);
    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(
      t.query(api.snaps.forFrolic, { deviceToken: token("Eve"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/not in this crew/);
  });

  test("a snap from an older window does not unlock a newer one", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const snapAt = await ready(t, crew);
    await snap(t, crew, "Maya", snapAt);
    await snap(t, crew, "Dev", snapAt + 600_000);
    const dev = await t.query(api.snaps.forFrolic, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(dev).toHaveLength(1);
    expect(dev[0].mine).toBe(true);
  });
});

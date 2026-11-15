import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../../convex/_generated/api";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token } from "../setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

const rateLimited = /RateLimited|rate/i;

describe("rate limits", () => {
  test("the tap bucket is six deep and refills one every five seconds", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    for (let i = 0; i < 6; i++) await tap(t, crew, "Maya", { kind: i % 2 ? "down" : "notToday" });
    await expect(tap(t, crew, "Maya")).rejects.toThrow(rateLimited);

    vi.advanceTimersByTime(5100);
    await tap(t, crew, "Maya");
    await expect(tap(t, crew, "Maya")).rejects.toThrow(rateLimited);
  });

  test("one person tapping too fast never blocks a friend", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    for (let i = 0; i < 6; i++) await tap(t, crew, "Maya", { kind: i % 2 ? "down" : "notToday" });
    await expect(tap(t, crew, "Maya")).rejects.toThrow(rateLimited);
    await expect(tap(t, crew, "Dev")).resolves.toBeNull();
  });

  test("untap draws from the same bucket as tap", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    for (let i = 0; i < 6; i++) await tap(t, crew, "Maya", { kind: i % 2 ? "down" : "notToday" });
    await expect(
      t.mutation(api.taps.untap, { deviceToken: token("Maya"), frolicId: crew.frolicId }),
    ).rejects.toThrow(rateLimited);
  });

  test("hop in has its own bucket and trips at six", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);

    for (let i = 0; i < 6; i++) {
      expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe(
        "going",
      );
    }
    await expect(
      t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId }),
    ).rejects.toThrow(rateLimited);
    await expect(tap(t, crew, "Jordan")).resolves.toBeNull();
  });

  test("one device may join thirty crews an hour", async () => {
    const t = makeT();
    const host = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Sunset Crew",
    });
    for (let i = 0; i < 30; i++) {
      await t.mutation(api.users.joinGroup, {
        deviceToken: token("Sam"),
        firstName: "Sam",
        inviteCode: host.inviteCode,
      });
    }
    await expect(
      t.mutation(api.users.joinGroup, { deviceToken: token("Sam"), firstName: "Sam", inviteCode: host.inviteCode }),
    ).rejects.toThrow(/RateLimited/);
    const byJoiner = await t.run(async (ctx) =>
      await ctx.db.query("memberships").withIndex("by_groupId", (q) => q.eq("groupId", host.groupId)).take(10),
    );
    expect(byJoiner).toHaveLength(2);
  });

  test("one person may create ten crews an hour", async () => {
    const t = makeT();
    for (let i = 0; i < 10; i++) {
      await t.mutation(api.users.createGroup, {
        deviceToken: token("Maya"),
        firstName: "Maya",
        groupName: `Crew ${i}`,
      });
    }
    await expect(
      t.mutation(api.users.createGroup, { deviceToken: token("Maya"), firstName: "Maya", groupName: "Eleven" }),
    ).rejects.toThrow(/RateLimited/);
    expect(await t.run(async (ctx) => await ctx.db.query("groups").collect())).toHaveLength(10);

    await t.mutation(api.users.createGroup, { deviceToken: token("Dev"), firstName: "Dev", groupName: "Dev Crew" });
    vi.advanceTimersByTime(HOUR + 1);
    await t.mutation(api.users.createGroup, { deviceToken: token("Maya"), firstName: "Maya", groupName: "Later" });
  });
});

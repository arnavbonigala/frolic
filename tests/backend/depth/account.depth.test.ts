import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token } from "../setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("account deletion", () => {
  test("two taps delete the account: the person and everything they left behind", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await t.mutation(api.users.deleteAccount, { deviceToken: token("Maya") });

    expect(await t.query(api.users.me, { deviceToken: token("Maya") })).toBeNull();
    const left = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      taps: await ctx.db.query("taps").collect(),
      memberships: await ctx.db.query("memberships").collect(),
      attendees: await ctx.db.query("attendees").collect(),
      etas: await ctx.db.query("etas").collect(),
      checkins: await ctx.db.query("checkins").collect(),
    }));
    expect(left.users.map((u) => u.name)).toEqual(["Dev"]);
    expect(left.taps.map((row) => row.userId)).not.toContain(crew.ids.Maya);
    expect(left.memberships.map((row) => row.userId)).not.toContain(crew.ids.Maya);
    expect(left.attendees.map((row) => row.userId)).not.toContain(crew.ids.Maya);
    expect(left.etas).toHaveLength(0);
    expect(left.checkins).toHaveLength(0);

    expect(await t.query(api.users.me, { deviceToken: token("Dev") })).not.toBeNull();
  });

  test("someone who snapped twice is still deleted, with both photos", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" });
    await t.mutation(api.snaps.start, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    await t.mutation(api.snaps.start, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    const first = await t.run(async (ctx) => await ctx.storage.store(new Blob(["one"])));
    vi.advanceTimersByTime(3000);
    await t.mutation(api.snaps.addMine, { deviceToken: token("Maya"), frolicId: crew.frolicId, storageId: first, takenAt: Date.now() });
    vi.advanceTimersByTime(5 * 60 * 1000);
    await t.mutation(api.snaps.start, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    const second = await t.run(async (ctx) => await ctx.storage.store(new Blob(["two"])));
    vi.advanceTimersByTime(3000);
    await t.mutation(api.snaps.addMine, { deviceToken: token("Maya"), frolicId: crew.frolicId, storageId: second, takenAt: Date.now() });
    expect(await t.run(async (ctx) => await ctx.db.query("snaps").collect())).toHaveLength(2);

    await t.mutation(api.users.deleteAccount, { deviceToken: token("Maya") });
    expect(await t.run(async (ctx) => await ctx.db.query("snaps").collect())).toHaveLength(0);
    const files = await t.run(async (ctx) => ({
      first: await ctx.db.system.get("_storage", first),
      second: await ctx.db.system.get("_storage", second),
    }));
    expect(files).toEqual({ first: null, second: null });
  });

  test("an account larger than one pass finishes on the next, keeping only the nights it went to", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.run(async (ctx) => {
      for (let i = 0; i < 130; i++) {
        const frolicId = await ctx.db.insert("frolics", {
          groupId: crew.groupId,
          day: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
          kind: "daily",
          status: "done",
          window: { start: NOON - HOUR, end: NOON },
          durationMinutes: 60,
          deadline: NOON - HOUR,
        });
        await ctx.db.insert("attendees", {
          frolicId,
          groupId: crew.groupId,
          userId: crew.ids.Maya,
          role: "matched",
          status: "going",
          revealAt: NOON - HOUR,
          bloomAt: NOON - HOUR,
        });
        await ctx.db.insert("taps", {
          frolicId,
          groupId: crew.groupId,
          userId: crew.ids.Maya,
          kind: "down",
          onlyIf: [],
          source: "app",
          updatedAt: NOON - HOUR,
        });
      }
    });

    await t.mutation(api.users.deleteAccount, { deviceToken: token("Maya") });
    expect(await t.query(api.users.me, { deviceToken: token("Maya") })).not.toBeNull();
    await t.mutation(internal.users.purgeAccount, { userId: crew.ids.Maya });
    expect(await t.query(api.users.me, { deviceToken: token("Maya") })).toBeNull();
    const left = await t.run(async (ctx) => ({
      attendees: await ctx.db.query("attendees").collect(),
      taps: await ctx.db.query("taps").collect(),
    }));
    expect(left.attendees.filter((row) => row.userId === crew.ids.Maya)).toHaveLength(130);
    expect(left.taps.filter((row) => row.userId === crew.ids.Maya)).toHaveLength(0);
  });

  test("the memory purge is scheduled with the account", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.users.deleteAccount, { deviceToken: token("Maya") });
    const pending = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (s) => s.name.includes("deleteAccountMemory") && s.state.kind === "pending",
      ),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].args).toEqual([{ userId: crew.ids.Maya }]);
  });

  test("a deleted account cannot delete itself twice and leaves the crew intact", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.users.deleteAccount, { deviceToken: token("Maya") });
    await expect(t.mutation(api.users.deleteAccount, { deviceToken: token("Maya") })).rejects.toThrow(/not signed in/);
    const group = await t.run(async (ctx) => await ctx.db.get("groups", crew.groupId));
    expect(group).not.toBeNull();
    const dev = await t.query(api.users.me, { deviceToken: token("Dev") });
    expect(dev?.groups.map((g) => g.groupId)).toEqual([crew.groupId]);
  });
});

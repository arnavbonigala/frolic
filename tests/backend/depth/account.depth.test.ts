import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../../convex/_generated/api";
import { NOON, makeT, setupCrew, tap, token } from "../setup.helpers";

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

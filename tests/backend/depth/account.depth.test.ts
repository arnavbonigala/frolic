import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../../convex/_generated/api";
import * as users from "../../../convex/users";
import { NOON, makeT, setupCrew, tap, token } from "../setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("account deletion", () => {
  test.skip("BUG-2 two taps delete the account: the person and everything they left behind", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const deleteAccount = (users as unknown as Record<string, unknown>).deleteAccount as FunctionReference<"mutation">;
    await t.mutation(deleteAccount, { deviceToken: token("Maya") });

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
});

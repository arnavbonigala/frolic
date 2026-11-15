/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { NOON, makeT } from "../backend/setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("friends seed", () => {
  test("renames the demo cast into the real crews and joins both", async () => {
    const t = makeT();
    const body = await t.mutation(internal.e2e.friends.seed, { run: "friends-1" });

    const read = await t.run(async (ctx) => {
      const home = await ctx.db.get("groups", body.groupId);
      const peace = await ctx.db.get("groups", body.peaceId);
      const members = async (groupId: typeof body.groupId) =>
        (
          await ctx.db
            .query("memberships")
            .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
            .take(20)
        ).length;
      const frolics = await ctx.db
        .query("frolics")
        .withIndex("by_groupId_and_day", (q) => q.eq("groupId", body.groupId))
        .take(20);
      return {
        home: home?.name,
        peace: peace?.name,
        homeCount: await members(body.groupId),
        peaceCount: await members(body.peaceId),
        names: (await ctx.db.query("users").take(20)).map((user) => user.name).sort(),
        past: frolics.filter((frolic) => frolic.day < "2026-11-15").length,
      };
    });

    expect(read.home).toBe("Delulu Gangalang");
    expect(read.peace).toBe("Peace");
    expect(read.homeCount).toBe(6);
    expect(read.peaceCount).toBe(3);
    expect(read.names).toEqual(["Arnav", "Dan", "Erick", "Hannah", "Meena", "Nhi"]);
    expect(read.past).toBe(3);
    for (const user of Object.values(body.users)) expect(user.deviceToken).toHaveLength(64);
  });
});

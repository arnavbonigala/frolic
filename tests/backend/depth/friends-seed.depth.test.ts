import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { makeT } from "../setup.helpers";

type T = ReturnType<typeof makeT>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T22:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function crewNames(t: T, groupId: string): Promise<string[]> {
  const members = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_groupId", (q) => q.eq("groupId", groupId as never))
      .take(20);
    const names: string[] = [];
    for (const row of rows) {
      const user = await ctx.db.get("users", row.userId);
      if (user) names.push(user.name);
    }
    return names;
  });
  return members.sort();
}

describe("the demo friends seed", () => {
  test("renames the four core friends and keeps every token working", async () => {
    const t = makeT();
    const seeded = await t.mutation(internal.e2e.friends.seed, { run: "friends" });

    expect(await crewNames(t, seeded.groupId)).toEqual(["Arnav", "Dan", "Erick", "Hannah", "Meena", "Nhi"]);

    for (const name of ["arnav", "dan", "nhi", "hannah"] as const) {
      const me = await t.query(api.users.me, { deviceToken: seeded.users[name].deviceToken });
      expect(me?.userId).toBe(seeded.users[name].userId);
      expect(me?.groups.map((group) => group.groupId)).toContain(seeded.groupId);
    }

    const meena = await t.query(api.users.me, { deviceToken: seeded.users.meena.deviceToken });
    expect(meena?.name).toBe("Meena");
    expect(meena?.groups.map((group) => group.name)).toEqual(["Delulu Gangalang"]);
  });

  test("opens the second crew with the first three names and nobody else", async () => {
    const t = makeT();
    const seeded = await t.mutation(internal.e2e.friends.seed, { run: "friends-two" });

    expect(await crewNames(t, seeded.peaceId)).toEqual(["Arnav", "Dan", "Nhi"]);
    const arnav = await t.query(api.users.me, { deviceToken: seeded.users.arnav.deviceToken });
    expect(arnav?.groups.map((group) => group.name).sort()).toEqual(["Delulu Gangalang", "Peace"]);
  });

  test("leaves one friend free right now and rewrites the plan lines", async () => {
    const t = makeT();
    const seeded = await t.mutation(internal.e2e.friends.seed, { run: "friends-free" });

    const today = await t.query(api.crew.crew, {
      deviceToken: seeded.users.arnav.deviceToken,
      groupId: seeded.groupId,
      day: "2026-11-15",
    });
    const erick = today.members.find((member) => member.name === "Erick");
    expect(erick?.free?.state).toBe("now");
    expect(erick?.free?.minutesAway).toBe(9);

    const plans = await t.run(async (ctx) =>
      await ctx.db
        .query("plans")
        .withIndex("by_groupId_and_day", (q) => q.eq("groupId", seeded.groupId))
        .take(20)
    );
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(`${plan.title} ${plan.line} ${plan.why ?? ""}`).not.toMatch(/\b(Maya|Dev|Jordan|Priya)\b/);
    }
  });
});

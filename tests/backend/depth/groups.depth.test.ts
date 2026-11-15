import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { HOUR, NOON, makeT, token, type T } from "../setup.helpers";

const DAY = "2026-11-15";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function joinAll(t: T, inviteCode: string, names: string[]) {
  const ids: Record<string, Id<"users">> = {};
  for (const name of names) {
    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token(name),
      firstName: name,
      inviteCode,
    });
    ids[name] = joined.userId;
  }
  return ids;
}

describe("groups", () => {
  test("createGroup names the crew, picks a timezone and hands back one group invite", async () => {
    const t = makeT();
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "  Sunset   Crew ",
      timezone: "America/New_York",
    });
    const group = await t.run(async (ctx) => await ctx.db.get("groups", created.groupId));
    expect(group?.name).toBe("Sunset Crew");
    expect(group?.timezone).toBe("America/New_York");
    expect(group?.createdBy).toBe(created.userId);
    expect(group?.e2eRun).toBeUndefined();

    const invites = await t.run(async (ctx) => await ctx.db.query("invites").collect());
    expect(invites).toHaveLength(1);
    expect(invites[0].code).toBe(created.inviteCode);
    expect(invites[0].kind).toBe("group");
    expect(invites[0].revoked).toBe(false);
    expect(invites[0].expiresAt).toBeUndefined();
    expect(created.inviteCode).toMatch(/^[A-Z2-9]{8}$/);

    const memberships = await t.run(async (ctx) => await ctx.db.query("memberships").collect());
    expect(memberships).toHaveLength(1);
    expect(memberships[0].joinedVia).toBe("creator");
  });

  test("the timezone defaults to Los Angeles and a made up one is refused", async () => {
    const t = makeT();
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Crew",
    });
    const group = await t.run(async (ctx) => await ctx.db.get("groups", created.groupId));
    expect(group?.timezone).toBe("America/Los_Angeles");

    await expect(
      t.mutation(api.users.createGroup, {
        deviceToken: token("Dev"),
        firstName: "Dev",
        groupName: "Crew",
        timezone: "Mars/Olympus_Mons",
      }),
    ).rejects.toThrow(/Unknown time zone/);
    expect(await t.run(async (ctx) => await ctx.db.query("groups").collect())).toHaveLength(1);
  });

  test("every member up to six gets a flower of their own and the seventh shares", async () => {
    const t = makeT();
    const names = ["Maya", "Dev", "Jordan", "Priya", "Sam", "Noor"];
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Crew",
    });
    await joinAll(t, created.inviteCode, names.slice(1));
    const six = await t.run(
      async (ctx) =>
        await ctx.db.query("memberships").withIndex("by_groupId", (q) => q.eq("groupId", created.groupId)).take(20),
    );
    expect(six.map((m) => m.color)).toEqual(["pink", "cobalt", "moss", "marigold", "tomato", "lilac"]);

    const seventh = await t.mutation(api.users.joinGroup, {
      deviceToken: token("Ada"),
      firstName: "Ada",
      inviteCode: created.inviteCode,
    });
    const seven = await t.run(
      async (ctx) =>
        await ctx.db.query("memberships").withIndex("by_groupId", (q) => q.eq("groupId", created.groupId)).take(20),
    );
    expect(seven).toHaveLength(7);
    expect(seven[6].userId).toBe(seventh.userId);
    expect(seven[6].color).toBe("pink");
    expect(new Set(seven.map((m) => m.color)).size).toBe(6);
  });

  test("a group invite needs membership, and a frolic invite needs a frolic in that crew", async () => {
    const t = makeT();
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Crew",
    });
    await t.mutation(api.users.createGroup, {
      deviceToken: token("Eve"),
      firstName: "Eve",
      groupName: "Other",
    });
    await expect(
      t.mutation(api.users.createInvite, { deviceToken: token("Eve"), groupId: created.groupId }),
    ).rejects.toThrow(/not in this crew/);
    await expect(
      t.mutation(api.users.createInvite, {
        deviceToken: token("Maya"),
        groupId: created.groupId,
        frolicId: await anyFrolic(t),
      }),
    ).rejects.toThrow(/frolic is gone/);
  });

  test("the crew read needs membership and a crew that still exists", async () => {
    const t = makeT();
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Crew",
    });
    await t.mutation(api.users.createGroup, {
      deviceToken: token("Eve"),
      firstName: "Eve",
      groupName: "Other",
    });
    await expect(
      t.query(api.crew.crew, { deviceToken: token("Eve"), groupId: created.groupId, day: DAY }),
    ).rejects.toThrow(/not in this crew/);

    await t.run(async (ctx) => await ctx.db.delete("groups", created.groupId));
    await expect(
      t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: created.groupId, day: DAY }),
    ).rejects.toThrow(/crew is gone/);
  });

  test("today reads only the crew you asked about", async () => {
    const t = makeT();
    const one = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "One",
    });
    const two = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Two",
    });
    const first = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: one.groupId });
    const second = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: two.groupId });
    expect(first.groupName).toBe("One");
    expect(second.groupName).toBe("Two");
    expect(first.phase).toBe("solo");
    expect(second.phase).toBe("solo");

    await t.run(async (ctx) => await ctx.db.delete("groups", two.groupId));
    await expect(
      t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: two.groupId }),
    ).rejects.toThrow(/crew is gone/);
  });
});

async function anyFrolic(t: T): Promise<Id<"frolics">> {
  const other = await t.mutation(api.users.createGroup, {
    deviceToken: token("Priya"),
    firstName: "Priya",
    groupName: "Elsewhere",
  });
  return await t.mutation(internal.frolics.open, {
    groupId: other.groupId,
    day: DAY,
    kind: "daily",
    window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
    durationMinutes: 60,
    deadline: NOON + 4 * HOUR,
  });
}

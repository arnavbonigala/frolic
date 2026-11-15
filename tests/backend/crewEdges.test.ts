import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { HOUR, NOON, makeT, setupCrew, tap, today, token, type T } from "./setup.helpers";

const DAY = "2026-11-15";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

const membersOf = async (t: T, groupId: Id<"groups">) =>
  await t.run(
    async (ctx) =>
      await ctx.db.query("memberships").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).collect(),
  );

const join = (t: T, name: string, inviteCode: string) =>
  t.mutation(api.users.joinGroup, { deviceToken: token(name), firstName: name, inviteCode });

describe("joining a crew", () => {
  test("a friend who taps the same invite twice lands in the crew once, with one flower and their newest name", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);

    const first = await join(t, "Dev", crew.inviteCode);
    const again = await t.mutation(api.users.joinGroup, {
      deviceToken: token("Dev"),
      firstName: "  Dev  R ",
      inviteCode: crew.inviteCode.toLowerCase(),
    });

    expect(again.userId).toBe(first.userId);
    expect(again.groupId).toBe(crew.groupId);
    expect(await membersOf(t, crew.groupId)).toHaveLength(2);

    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(view.memberCount).toBe(2);
    expect(view.members.map((m) => m.name).sort()).toEqual(["Dev R", "Maya"]);
    expect(new Set(view.members.map((m) => m.color)).size).toBe(2);
  });

  test("an invite to a crew that is gone says the link expired and leaves no person behind", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.run(async (ctx) => await ctx.db.delete("groups", crew.groupId));

    await expect(join(t, "Jordan", crew.inviteCode)).rejects.toThrow(/expired/);
    await expect(
      t.mutation(internal.users.joinAs, {
        userId: crew.ids.Maya,
        inviteCode: crew.inviteCode,
        via: "imessage",
      }),
    ).rejects.toThrow(/expired/);

    expect(await t.query(api.users.me, { deviceToken: token("Jordan") })).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.query("users").collect())).toHaveLength(2);
    expect(await membersOf(t, crew.groupId)).toHaveLength(2);
  });

  test("two invites that share one code still preview and join the same crew", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    await t.run(
      async (ctx) =>
        await ctx.db.insert("invites", {
          code: crew.inviteCode,
          groupId: crew.groupId,
          createdBy: crew.ids.Maya,
          kind: "group",
          revoked: false,
        }),
    );

    const preview = await t.query(api.users.invitePreview, { inviteCode: crew.inviteCode });
    expect(preview?.groupName).toBe("Sunset Crew");
    const joined = await join(t, "Dev", crew.inviteCode);
    expect(joined.groupId).toBe(crew.groupId);

    const fresh = await t.mutation(api.users.createInvite, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
    });
    const codes = await t.run(async (ctx) => (await ctx.db.query("invites").collect()).map((i) => i.code));
    expect(codes.filter((code) => code === fresh)).toHaveLength(1);
  });

  test("a crew invite whose frolic is gone still hands the friend the crew and no dead plan", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const code = await t.mutation(api.users.createInvite, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      frolicId: crew.frolicId,
    });
    await t.run(async (ctx) => await ctx.db.delete("frolics", crew.frolicId));

    const joined = await join(t, "Dev", code);
    expect(joined.groupId).toBe(crew.groupId);
    expect(joined.frolicId).toBeNull();
  });
});

describe("coming and going", () => {
  test("a friend who leaves and rejoins the same day comes back with one flower and no stale answer", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.crew.setFree, {
      deviceToken: token("Dev"),
      groupId: crew.groupId,
      day: DAY,
      state: "now",
    });
    await tap(t, crew, "Dev");

    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });
    await t.finishInProgressScheduledFunctions();
    const back = await join(t, "Dev", crew.inviteCode);
    expect(back.userId).not.toBe(crew.ids.Dev);

    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(view.memberCount).toBe(2);
    expect(view.members.map((m) => m.name).sort()).toEqual(["Dev", "Maya"]);
    expect(view.members.find((m) => m.name === "Dev")?.free).toBeNull();
    expect(new Set(view.members.map((m) => m.color)).size).toBe(2);

    const mine = await today(t, crew, "Dev");
    expect(mine.myTap).toBeNull();
  });

  test("a crew that drops to one member reads as solo with no ghost seat", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");

    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });
    await t.finishInProgressScheduledFunctions();

    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(view.memberCount).toBe(1);
    expect(view.members.map((m) => m.name)).toEqual(["Maya"]);

    const mine = await today(t, crew, "Maya");
    expect(mine.memberCount).toBe(1);
    expect(mine.phase).toBe("waiting");
    expect(mine.reveal).toBeNull();
  });

  test("a crew of two that grows to four mid week gives each new friend a flower and keeps every answer private", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await join(t, "Priya", crew.inviteCode);
    await join(t, "Sam", crew.inviteCode);

    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(view.memberCount).toBe(4);
    expect(view.members).toHaveLength(4);
    expect(new Set(view.members.map((m) => m.color)).size).toBe(4);
    expect(view.members.every((m) => m.free === null)).toBe(true);

    const priya = await today(t, crew, "Priya");
    expect(priya.memberCount).toBe(4);
    expect(priya.myTap).toBeNull();
    expect(JSON.stringify(priya)).not.toContain("Maya");
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(1);
  });
});

describe("people without a face or a device", () => {
  test("a friend who joined from a text message reads by name with no photo and no device token", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const dev = await t.mutation(internal.users.createAs, { name: "  Dev  ", phone: "+15105550001" });
    await t.mutation(internal.users.joinAs, { userId: dev, inviteCode: crew.inviteCode, via: "imessage" });

    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(view.memberCount).toBe(2);
    const row = view.members.find((m) => m.userId === dev);
    expect(row?.name).toBe("Dev");
    expect(row?.photoUrl).toBeNull();
    expect(row?.isMe).toBe(false);
    expect(row?.free).toBeNull();

    const preview = await t.query(api.users.invitePreview, { inviteCode: crew.inviteCode });
    expect(preview?.members.map((m) => m.name)).toEqual(["Maya", "Dev"]);

    await expect(t.mutation(internal.users.createAs, { name: "   ", phone: "+15105550002" })).rejects.toThrow(
      /1 to 40/,
    );
  });

  test("a portrait gives every phone an absolute photo url and a removed photo reads as null", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.users.updateProfile, { deviceToken: token("Dev"), avatarKey: "dev" });

    const withPortrait = await t.query(api.crew.crew, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      day: DAY,
    });
    const url = withPortrait.members.find((m) => m.name === "Dev")?.photoUrl;
    expect(url).toContain("/p/avatar/dev.jpg");

    await t.run(async (ctx) => {
      const dev = await ctx.db.query("users").withIndex("by_tokenHash").collect();
      const row = dev.find((u) => u.name === "Dev");
      await ctx.db.patch("users", row!._id, { avatarUrl: undefined });
    });
    const plain = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(plain.members.find((m) => m.name === "Dev")?.photoUrl).toBeNull();
  });

  test("a person whose row is gone stops counting as a seat while their tap is still on the frolic", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Dev");
    await t.run(async (ctx) => await ctx.db.delete("users", crew.ids.Dev));

    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(view.memberCount).toBe(view.members.length);
    expect(view.memberCount).toBe(2);
    expect(view.members.map((m) => m.name).sort()).toEqual(["Jordan", "Maya"]);

    const mine = await today(t, crew, "Maya");
    expect(mine.reveal).toBeNull();
    expect(JSON.stringify(mine)).not.toContain("Dev");
  });

  test("a snap from a deleted account leaves the garden and the crew clean", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["snap"])));
    await t.run(
      async (ctx) =>
        await ctx.db.insert("snaps", {
          frolicId: crew.frolicId,
          groupId: crew.groupId,
          userId: crew.ids.Dev,
          storageId,
          snapAt: NOON,
          takenAt: NOON,
        }),
    );

    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });
    await t.finishInProgressScheduledFunctions();

    expect(await t.run(async (ctx) => await ctx.db.query("snaps").collect())).toHaveLength(0);
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(0);
    const garden = await t.query(api.garden.overview, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(garden.count).toBe(0);
    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(view.memberCount).toBe(1);
  });
});

describe("limits", () => {
  test("a limit that is not a real number is refused before it is saved", async () => {
    const t = makeT();
    await setupCrew(t, ["Maya"]);
    await t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: 25, energy: "chill" });

    await expect(t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: NaN })).rejects.toThrow(
      /out of range/,
    );
    await expect(t.mutation(api.limits.set, { deviceToken: token("Maya"), maxMinutes: Infinity })).rejects.toThrow(
      /out of range/,
    );
    expect(await t.query(api.limits.mine, { deviceToken: token("Maya") })).toMatchObject({
      budgetCap: 25,
      energy: "chill",
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("limits").collect());
    expect(rows).toHaveLength(1);
    expect(Number.isFinite(rows[0].budgetCap!)).toBe(true);
  });

  test("a second limits row for one person never hides their limits from the crew", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    await t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: 20 });
    await t.run(
      async (ctx) => await ctx.db.insert("limits", { userId: crew.ids.Maya, budgetCap: 5, updatedAt: NOON + 1 }),
    );

    expect((await t.query(api.limits.mine, { deviceToken: token("Maya") })).budgetCap).toBe(5);
    const forUsers = await t.query(api.limits.forUsers, { userIds: [crew.ids.Maya, crew.ids.Maya] });
    expect(forUsers).toHaveLength(2);
    expect(forUsers.map((l) => l.budgetCap)).toEqual([5, 5]);

    await t.mutation(api.limits.set, { deviceToken: token("Maya"), energy: "anything" });
    const rows = await t.run(async (ctx) => await ctx.db.query("limits").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].budgetCap).toBe(5);
    expect(rows[0].energy).toBe("anything");
  });
});

describe("the drop", () => {
  test("a fourth I'm free in one day is refused with a retry hint and starts nothing", async () => {
    const t = makeT();
    vi.setSystemTime(Date.UTC(2026, 10, 15, 0, 30, 0));
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Sunset Crew",
    });
    await join(t, "Dev", created.inviteCode);
    const groupId = created.groupId;

    let started = 0;
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(100 * 60 * 1000);
      await t.finishInProgressScheduledFunctions();
      const out = await t.mutation(api.frolics.imFree, {
        deviceToken: token("Maya"),
        groupId,
        forMinutes: 90,
      });
      if (out.started) started += 1;
    }
    expect(started).toBe(3);

    vi.advanceTimersByTime(100 * 60 * 1000);
    await t.finishInProgressScheduledFunctions();
    const before = await t.run(async (ctx) => (await ctx.db.query("frolics").collect()).length);
    const refused = await t
      .mutation(api.frolics.imFree, { deviceToken: token("Maya"), groupId, forMinutes: 90 })
      .catch((error: { data?: { kind?: string; retryAfter?: number } }) => error);
    expect(refused).toMatchObject({ data: { kind: "RateLimited" } });
    expect(typeof (refused as { data?: { retryAfter?: number } }).data?.retryAfter).toBe("number");
    expect(await t.run(async (ctx) => (await ctx.db.query("frolics").collect()).length)).toBe(before);

    const friend = await t.mutation(api.frolics.imFree, {
      deviceToken: token("Dev"),
      groupId,
      forMinutes: 90,
    });
    expect(friend.started).toBe(true);
  });
});

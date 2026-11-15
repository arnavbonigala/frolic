/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token, type T } from "./setup.helpers";

const DAY = "2026-11-15";
const BAD_CODE = "00000000";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

type BareCrew = { groupId: Id<"groups">; inviteCode: string; ids: Record<string, Id<"users">> };

async function bareCrew(t: T, names: string[]): Promise<BareCrew> {
  const [first, ...rest] = names;
  const created = await t.mutation(api.users.createGroup, {
    deviceToken: token(first),
    firstName: first,
    groupName: "Sunset Crew",
  });
  const ids: Record<string, Id<"users">> = { [first]: created.userId };
  for (const name of rest) {
    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token(name),
      firstName: name,
      inviteCode: created.inviteCode,
    });
    ids[name] = joined.userId;
  }
  return { groupId: created.groupId, inviteCode: created.inviteCode, ids };
}

const mine = async (t: T, name: string) => await t.query(api.limits.mine, { deviceToken: token(name) });

describe("users", () => {
  test("one device keeps one identity across groups and invites", async () => {
    const t = makeT();
    const first = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Sunset Crew",
    });
    const second = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Second Crew",
    });
    expect(second.userId).toBe(first.userId);
    expect(second.groupId).not.toBe(first.groupId);
    expect(second.inviteCode).not.toBe(first.inviteCode);

    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      inviteCode: first.inviteCode.toLowerCase(),
    });
    expect(joined.userId).toBe(first.userId);
    expect(joined.groupId).toBe(first.groupId);
    expect(joined.frolicId).toBeNull();

    const memberships = await t.run(
      async (ctx) =>
        await ctx.db
          .query("memberships")
          .withIndex("by_userId", (q) => q.eq("userId", first.userId))
          .take(10),
    );
    expect(memberships).toHaveLength(2);

    const view = await t.query(api.users.me, { deviceToken: token("Maya") });
    expect(view?.name).toBe("Maya");
    expect(view?.userId).toBe(first.userId);
    expect(view?.photoUrl).toBeNull();
    expect(view?.groups.map((g) => g.name).sort()).toEqual(["Second Crew", "Sunset Crew"]);
    expect(await t.query(api.users.me, { deviceToken: token("Nobody") })).toBeNull();
  });

  test("a bad, revoked or expired invite is refused", async () => {
    const t = makeT();
    const crew = await bareCrew(t, ["Maya"]);

    await expect(
      t.mutation(api.users.joinGroup, { deviceToken: token("Dev"), firstName: "Dev", inviteCode: BAD_CODE }),
    ).rejects.toThrow(/expired/);
    expect(await t.query(api.users.invitePreview, { inviteCode: BAD_CODE })).toBeNull();

    const fresh = await t.mutation(api.users.createInvite, { deviceToken: token("Maya"), groupId: crew.groupId });
    const ok = await t.mutation(api.users.joinGroup, {
      deviceToken: token("Dev"),
      firstName: "Dev",
      inviteCode: ` ${fresh.toLowerCase()} `,
    });
    expect(ok.groupId).toBe(crew.groupId);
    expect(ok.userId).not.toBe(crew.ids.Maya);
    expect(await t.query(api.users.invitePreview, { inviteCode: fresh })).toMatchObject({
      groupName: "Sunset Crew",
      invitedBy: "Maya",
      memberCount: 2,
    });

    const revoked = await t.mutation(api.users.createInvite, { deviceToken: token("Maya"), groupId: crew.groupId });
    const expired = await t.mutation(api.users.createInvite, { deviceToken: token("Maya"), groupId: crew.groupId });
    await t.run(async (ctx) => {
      const revokedRow = await ctx.db.query("invites").withIndex("by_code", (q) => q.eq("code", revoked)).unique();
      await ctx.db.patch("invites", revokedRow!._id, { revoked: true });
      const expiredRow = await ctx.db.query("invites").withIndex("by_code", (q) => q.eq("code", expired)).unique();
      await ctx.db.patch("invites", expiredRow!._id, { expiresAt: NOON - 1 });
    });
    await expect(
      t.mutation(api.users.joinGroup, { deviceToken: token("Jordan"), firstName: "Jordan", inviteCode: revoked }),
    ).rejects.toThrow(/expired/);
    await expect(
      t.mutation(api.users.joinGroup, { deviceToken: token("Jordan"), firstName: "Jordan", inviteCode: expired }),
    ).rejects.toThrow(/expired/);
    expect(await t.query(api.users.invitePreview, { inviteCode: revoked })).toBeNull();

    const outsider = await t.mutation(api.users.createGroup, {
      deviceToken: token("Eve"),
      firstName: "Eve",
      groupName: "Other Crew",
    });
    await expect(
      t.mutation(api.users.createInvite, { deviceToken: token("Eve"), groupId: crew.groupId }),
    ).rejects.toThrow(/not in this crew/);
    expect(outsider.groupId).not.toBe(crew.groupId);
  });

  test("invitePreview hides an expired invite that joinGroup refuses", async () => {
    const t = makeT();
    const crew = await bareCrew(t, ["Maya"]);
    const code = await t.mutation(api.users.createInvite, { deviceToken: token("Maya"), groupId: crew.groupId });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("invites").withIndex("by_code", (q) => q.eq("code", code)).unique();
      await ctx.db.patch("invites", row!._id, { expiresAt: NOON - 1 });
    });
    await expect(
      t.mutation(api.users.joinGroup, { deviceToken: token("Dev"), firstName: "Dev", inviteCode: code }),
    ).rejects.toThrow(/expired/);
    expect(await t.query(api.users.invitePreview, { inviteCode: code })).toBeNull();
  });

  test("every member gets a distinct flower color", async () => {
    const t = makeT();
    const crew = await bareCrew(t, ["Maya", "Dev", "Jordan", "Priya", "Sam", "Noor"]);
    const memberships = await t.run(
      async (ctx) =>
        await ctx.db
          .query("memberships")
          .withIndex("by_groupId", (q) => q.eq("groupId", crew.groupId))
          .take(20),
    );
    expect(memberships).toHaveLength(6);
    const colors = memberships.map((m) => m.color);
    expect(new Set(colors).size).toBe(6);
    expect(memberships.every((m) => m.joinedVia === (m.userId === crew.ids.Maya ? "creator" : "invite"))).toBe(true);

    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(new Set(view.members.map((m) => m.color)).size).toBe(6);
  });

  test("createAs keeps one user per phone number", async () => {
    const t = makeT();
    const first = await t.mutation(internal.users.createAs, { name: "  Dev   Kumar ", phone: "+15550001111" });
    const again = await t.mutation(internal.users.createAs, { name: "Devon", phone: "+15550001111" });
    const other = await t.mutation(internal.users.createAs, { name: "Priya", phone: "+15550002222" });
    expect(again).toBe(first);
    expect(other).not.toBe(first);

    const doc = await t.run(async (ctx) => await ctx.db.get("users", first));
    expect(doc?.name).toBe("Dev Kumar");
    expect(doc?.phone).toBe("+15550001111");
    expect(doc?.source).toBe("imessage");
    expect(await t.query(internal.users.userByPhone, { phone: "+15550001111" })).toMatchObject({ _id: first });

    const crew = await bareCrew(t, ["Maya"]);
    const groupId = await t.mutation(internal.users.joinAs, { userId: first, inviteCode: crew.inviteCode, via: "imessage" });
    expect(groupId).toBe(crew.groupId);
    await t.mutation(internal.users.joinAs, { userId: first, inviteCode: crew.inviteCode, via: "imessage" });
    const memberships = await t.run(
      async (ctx) =>
        await ctx.db
          .query("memberships")
          .withIndex("by_userId", (q) => q.eq("userId", first))
          .take(10),
    );
    expect(memberships).toHaveLength(1);
    await expect(
      t.mutation(internal.users.joinAs, { userId: first, inviteCode: BAD_CODE, via: "imessage" }),
    ).rejects.toThrow(/expired/);
  });
});

describe("availability", () => {
  test("setFree records what crew.crew shows, and a second write replaces the first", async () => {
    const t = makeT();
    const crew = await bareCrew(t, ["Maya", "Dev", "Jordan"]);
    const window = { start: NOON + HOUR, end: NOON + 3 * HOUR };

    await t.mutation(api.crew.setFree, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      day: DAY,
      state: "now",
    });
    await t.mutation(api.crew.setFree, {
      deviceToken: token("Dev"),
      groupId: crew.groupId,
      day: DAY,
      state: "window",
      window,
      minutesAway: 12.5,
    });

    const view = await t.query(api.crew.crew, { deviceToken: token("Jordan"), groupId: crew.groupId, day: DAY });
    expect(view.groupName).toBe("Sunset Crew");
    expect(view.members.map((m) => m.name).sort()).toEqual(["Dev", "Jordan", "Maya"]);
    expect(view.members.filter((m) => m.isMe).map((m) => m.name)).toEqual(["Jordan"]);
    expect(view.members.find((m) => m.name === "Maya")!.free).toMatchObject({
      state: "now",
      window: null,
      minutesAway: null,
    });
    expect(view.members.find((m) => m.name === "Maya")!.free!.updatedAt).toBeGreaterThanOrEqual(NOON);
    expect(view.members.find((m) => m.name === "Maya")!.free!.updatedAt).toBeLessThan(NOON + 500);
    expect(view.members.find((m) => m.name === "Dev")!.free).toMatchObject({
      state: "window",
      window,
      minutesAway: 13,
    });
    expect(view.members.find((m) => m.name === "Dev")!.free!.updatedAt).toBeGreaterThanOrEqual(NOON);
    expect(view.members.find((m) => m.name === "Dev")!.free!.updatedAt).toBeLessThan(NOON + 500);
    expect(view.members.find((m) => m.name === "Jordan")!.free).toBeNull();

    await t.mutation(api.crew.setFree, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      day: DAY,
      state: "busy",
      minutesAway: 30,
    });
    const after = await t.query(api.crew.crew, { deviceToken: token("Jordan"), groupId: crew.groupId, day: DAY });
    expect(after.members.find((m) => m.name === "Maya")!.free).toMatchObject({
      state: "busy",
      window: null,
      minutesAway: 30,
    });
    expect(await t.run(async (ctx) => await ctx.db.query("availability").collect())).toHaveLength(2);

    await expect(
      t.mutation(api.crew.setFree, {
        deviceToken: token("Maya"),
        groupId: crew.groupId,
        day: "15/11/2026",
        state: "now",
      }),
    ).rejects.toThrow(/YYYY-MM-DD/);
    await expect(
      t.mutation(api.crew.setFree, {
        deviceToken: token("Maya"),
        groupId: crew.groupId,
        day: DAY,
        state: "window",
      }),
    ).rejects.toThrow(/window does not work/);
    await expect(
      t.mutation(api.crew.setFree, {
        deviceToken: token("Maya"),
        groupId: crew.groupId,
        day: DAY,
        state: "now",
        minutesAway: 601,
      }),
    ).rejects.toThrow(/out of range/);

    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other Crew" });
    await expect(
      t.mutation(api.crew.setFree, { deviceToken: token("Eve"), groupId: crew.groupId, day: DAY, state: "now" }),
    ).rejects.toThrow(/not in this crew/);
    await expect(
      t.query(api.crew.crew, { deviceToken: token("Eve"), groupId: crew.groupId, day: DAY }),
    ).rejects.toThrow(/not in this crew/);
  });
});

describe("limits", () => {
  test("set writes only my limits and partial writes keep the rest", async () => {
    const t = makeT();
    const crew = await bareCrew(t, ["Maya", "Dev"]);

    expect(await mine(t, "Maya")).toEqual({ budgetCap: null, energy: null, maxMinutes: null, homeBy: null });
    await t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: 40, energy: "chill" });
    await t.mutation(api.limits.set, { deviceToken: token("Maya"), maxMinutes: 90, energy: null });
    expect(await mine(t, "Maya")).toEqual({ budgetCap: 40, energy: null, maxMinutes: 90, homeBy: null });
    expect(await mine(t, "Dev")).toEqual({ budgetCap: null, energy: null, maxMinutes: null, homeBy: null });

    await t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: null, maxMinutes: null });
    expect(await mine(t, "Maya")).toEqual({ budgetCap: null, energy: null, maxMinutes: null, homeBy: null });

    await expect(t.mutation(api.limits.set, { deviceToken: token("Dev"), budgetCap: 10001 })).rejects.toThrow(
      /out of range/,
    );
    await expect(t.mutation(api.limits.set, { deviceToken: token("Dev"), maxMinutes: -1 })).rejects.toThrow(
      /out of range/,
    );
    await expect(t.mutation(api.limits.set, { deviceToken: token("Dev"), homeBy: 36 * 60 + 1 })).rejects.toThrow(
      /out of range/,
    );

    const rows = await t.run(async (ctx) => await ctx.db.query("limits").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(crew.ids.Maya);
  });
});

describe("check ins", () => {
  test("check in needs a going attendee and lands once", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");

    await expect(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" }),
    ).rejects.toThrow(/people going/);

    await flipDue(t);

    const first = await t.mutation(api.checkins.checkInMe, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      method: "geofence",
    });
    const again = await t.mutation(api.checkins.checkInMe, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      method: "manual",
    });
    expect(again).toBe(first);

    await expect(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Jordan"), frolicId: crew.frolicId, method: "manual" }),
    ).rejects.toThrow(/people going/);
    await expect(
      t.mutation(internal.checkins.checkInAs, {
        userId: crew.ids.Jordan,
        frolicId: crew.frolicId,
        method: "imessage",
      }),
    ).rejects.toThrow(/people going/);

    await t.mutation(internal.checkins.checkInAs, {
      userId: crew.ids.Dev,
      frolicId: crew.frolicId,
      method: "imessage",
    });
    await t.mutation(internal.checkins.checkInAs, {
      userId: crew.ids.Dev,
      frolicId: crew.frolicId,
      method: "imessage",
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("checkins").collect());
    expect(rows.map((r) => [r.userId, r.method])).toEqual([
      [crew.ids.Maya, "geofence"],
      [crew.ids.Dev, "imessage"],
    ]);
  });
});

describe("on my way", () => {
  test("an eta is only for people going and each person keeps one row", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");

    await expect(
      t.mutation(api.etas.setMine, { deviceToken: token("Maya"), frolicId: crew.frolicId, minutes: 10, onTheWay: true }),
    ).rejects.toThrow(/people going/);
    expect(await t.query(api.etas.forFrolic, { deviceToken: token("Maya"), frolicId: crew.frolicId })).toEqual([]);

    await flipDue(t);

    await t.mutation(api.etas.setMine, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      minutes: 12.4,
      onTheWay: true,
    });
    await t.mutation(api.etas.setMine, { deviceToken: token("Maya"), frolicId: crew.frolicId, minutes: 7, onTheWay: false });
    await t.mutation(internal.etas.setEtaAs, {
      userId: crew.ids.Dev,
      frolicId: crew.frolicId,
      minutes: 20,
      onTheWay: true,
    });
    await expect(
      t.mutation(api.etas.setMine, { deviceToken: token("Maya"), frolicId: crew.frolicId, minutes: 601, onTheWay: true }),
    ).rejects.toThrow(/out of range/);
    await expect(
      t.mutation(api.etas.setMine, { deviceToken: token("Jordan"), frolicId: crew.frolicId, minutes: 5, onTheWay: true }),
    ).rejects.toThrow(/people going/);

    const view = await t.query(api.etas.forFrolic, { deviceToken: token("Jordan"), frolicId: crew.frolicId });
    expect(view.map((r) => ({ userId: r.userId, minutes: r.minutes, onTheWay: r.onTheWay }))).toEqual([
      { userId: crew.ids.Maya, minutes: 7, onTheWay: false },
      { userId: crew.ids.Dev, minutes: 20, onTheWay: true },
    ]);
    expect(await t.run(async (ctx) => await ctx.db.query("etas").collect())).toHaveLength(2);

    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other Crew" });
    await expect(
      t.query(api.etas.forFrolic, { deviceToken: token("Eve"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/not in this crew/);
  });
});

describe("snaps", () => {
  test("the group snap opens after the countdown and closes after its window", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    const photo = await t.run(async (ctx) => await ctx.storage.store(new Blob(["x"])));
    const photo2 = await t.run(async (ctx) => await ctx.storage.store(new Blob(["y"])));

    await expect(
      t.mutation(api.snaps.start, { deviceToken: token("Maya"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/people going/);

    await flipDue(t);

    const startedAt = Date.now();
    const snapAt = await t.mutation(api.snaps.start, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    expect(snapAt - startedAt).toBeGreaterThanOrEqual(3000);
    expect(snapAt - startedAt).toBeLessThan(3100);
    expect(await t.mutation(api.snaps.start, { deviceToken: token("Dev"), frolicId: crew.frolicId })).toBe(snapAt);
    await expect(
      t.mutation(api.snaps.start, { deviceToken: token("Jordan"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/people going/);

    await expect(
      t.mutation(api.snaps.addMine, {
        deviceToken: token("Maya"),
        frolicId: crew.frolicId,
        storageId: photo,
        takenAt: snapAt,
      }),
    ).rejects.toThrow(/Check in first/);

    await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" });
    await expect(
      t.mutation(api.snaps.addMine, {
        deviceToken: token("Maya"),
        frolicId: crew.frolicId,
        storageId: photo,
        takenAt: snapAt,
      }),
    ).rejects.toThrow(/window is closed/);
    expect(await t.run(async (ctx) => await ctx.db.query("snaps").collect())).toHaveLength(0);

    vi.advanceTimersByTime(2500);
    await t.mutation(api.snaps.addMine, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      storageId: photo,
      takenAt: Date.now(),
    });
    await t.mutation(api.snaps.addMine, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      storageId: photo2,
      takenAt: Date.now(),
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("snaps").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].storageId).toBe(photo2);
    expect(rows[0].snapAt).toBe(snapAt);

    vi.advanceTimersByTime(125000);
    await expect(
      t.mutation(api.snaps.addMine, {
        deviceToken: token("Maya"),
        frolicId: crew.frolicId,
        storageId: photo,
        takenAt: Date.now(),
      }),
    ).rejects.toThrow(/window is closed/);

    const nextSnapAt = await t.mutation(api.snaps.start, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(nextSnapAt - snapAt).toBeGreaterThan(120000);
  });
});

describe("frolics", () => {
  test("open is idempotent per crew, day and kind", async () => {
    const t = makeT();
    const crew = await bareCrew(t, ["Maya", "Dev"]);
    const window = { start: NOON + HOUR, end: NOON + 5 * HOUR };
    const args = {
      groupId: crew.groupId,
      day: DAY,
      kind: "daily" as const,
      window,
      durationMinutes: 60,
      deadline: NOON + 4 * HOUR,
    };

    const first = await t.mutation(internal.frolics.open, args);
    expect(await t.mutation(internal.frolics.open, args)).toBe(first);
    const solo = await t.mutation(internal.frolics.open, { ...args, kind: "solo" });
    expect(solo).not.toBe(first);
    const tomorrow = await t.mutation(internal.frolics.open, { ...args, day: "2026-11-16" });
    expect(tomorrow).not.toBe(first);
    expect(await t.mutation(internal.frolics.open, { ...args, kind: "solo" })).toBe(solo);

    const reopened = await t.mutation(internal.frolics.open, {
      ...args,
      window: { start: NOON, end: NOON + HOUR },
      deadline: NOON + 2 * HOUR,
    });
    expect(reopened).toBe(first);

    const rows = await t.run(async (ctx) => await ctx.db.query("frolics").collect());
    expect(rows).toHaveLength(3);
    const daily = rows.find((r) => r._id === first)!;
    expect(daily.status).toBe("open");
    expect(daily.window).toEqual(window);
    expect(daily.deadline).toBe(NOON + 4 * HOUR);
    expect(daily.durationMinutes).toBe(60);
    expect(rows.find((r) => r._id === solo)!.kind).toBe("solo");
    expect(rows.find((r) => r._id === tomorrow)!.day).toBe("2026-11-16");
  });

  test("today says solo for a crew of one and none when nothing is open", async () => {
    const t = makeT();
    const single = await bareCrew(t, ["Maya"]);
    expect(await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: single.groupId })).toEqual({
      phase: "solo",
      groupName: "Sunset Crew",
      memberCount: 1,
      frolic: null,
      myTap: null,
      reveal: null,
    });

    const pair = await bareCrew(t, ["Dev", "Jordan"]);
    expect(await t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: pair.groupId })).toEqual({
      phase: "none",
      groupName: "Sunset Crew",
      memberCount: 2,
      frolic: null,
      myTap: null,
      reveal: null,
    });
  });
});

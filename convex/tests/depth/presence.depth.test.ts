/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../_generated/api";
import { HOUR, NOON, makeT, token, type T } from "../setup.helpers";

const DAY = "2026-11-15";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function crew(t: T, names: string[]) {
  const [first, ...rest] = names;
  const created = await t.mutation(api.users.createGroup, {
    deviceToken: token(first),
    firstName: first,
    groupName: "Sunset Crew",
  });
  for (const name of rest) {
    await t.mutation(api.users.joinGroup, {
      deviceToken: token(name),
      firstName: name,
      inviteCode: created.inviteCode,
    });
  }
  return created;
}

describe("free status", () => {
  test("a window state keeps the window, and any other state drops it", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    const window = { start: NOON + HOUR, end: NOON + 4 * HOUR };

    await t.mutation(api.crew.setFree, {
      deviceToken: token("Maya"),
      groupId: c.groupId,
      day: DAY,
      state: "window",
      window,
      minutesAway: 9.6,
    });
    const withWindow = await t.query(api.crew.crew, { deviceToken: token("Dev"), groupId: c.groupId, day: DAY });
    expect(withWindow.members.find((m) => m.name === "Maya")!.free).toMatchObject({
      state: "window",
      window,
      minutesAway: 10,
    });

    await t.mutation(api.crew.setFree, {
      deviceToken: token("Maya"),
      groupId: c.groupId,
      day: DAY,
      state: "now",
    });
    const cleared = await t.query(api.crew.crew, { deviceToken: token("Dev"), groupId: c.groupId, day: DAY });
    expect(cleared.members.find((m) => m.name === "Maya")!.free).toMatchObject({
      state: "now",
      window: null,
      minutesAway: null,
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("availability").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].window).toBeUndefined();
  });

  test("free status is kept per day and per crew", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    const other = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Second Crew",
    });

    await t.mutation(api.crew.setFree, { deviceToken: token("Maya"), groupId: c.groupId, day: DAY, state: "now" });
    await t.mutation(api.crew.setFree, {
      deviceToken: token("Maya"),
      groupId: c.groupId,
      day: "2026-11-16",
      state: "busy",
    });
    await t.mutation(api.crew.setFree, {
      deviceToken: token("Maya"),
      groupId: other.groupId,
      day: DAY,
      state: "window",
      window: { start: NOON, end: NOON + HOUR },
    });

    const today = await t.query(api.crew.crew, { deviceToken: token("Dev"), groupId: c.groupId, day: DAY });
    expect(today.members.find((m) => m.name === "Maya")!.free?.state).toBe("now");
    const tomorrow = await t.query(api.crew.crew, { deviceToken: token("Dev"), groupId: c.groupId, day: "2026-11-16" });
    expect(tomorrow.members.find((m) => m.name === "Maya")!.free?.state).toBe("busy");
    const second = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: other.groupId, day: DAY });
    expect(second.members.find((m) => m.isMe)!.free?.state).toBe("window");
    expect(await t.run(async (ctx) => await ctx.db.query("availability").collect())).toHaveLength(3);
  });

  test("an empty crew read designs the empty and busy states instead of failing", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya"]);
    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: c.groupId, day: DAY });
    expect(view.members).toHaveLength(1);
    expect(view.members[0].free).toBeNull();

    await t.mutation(api.crew.setFree, { deviceToken: token("Maya"), groupId: c.groupId, day: DAY, state: "busy" });
    const busy = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: c.groupId, day: DAY });
    expect(busy.members[0].free?.state).toBe("busy");
  });
});

describe("presence", () => {
  test("a heartbeat puts a member online and a graceful disconnect takes them offline", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    const beat = await t.mutation(api.crew.heartbeat, {
      deviceToken: token("Maya"),
      groupId: c.groupId,
      sessionId: "phone-a",
      interval: 10000,
    });
    expect(beat.roomToken).toEqual(expect.any(String));
    expect(beat.sessionToken).toEqual(expect.any(String));
    expect(beat.roomToken).not.toBe(beat.sessionToken);

    const seen = await t.query(api.crew.looking, { roomToken: beat.roomToken });
    expect(seen).toEqual([{ userId: c.userId, online: true, lastDisconnected: 0 }]);

    await t.mutation(api.crew.disconnect, { sessionToken: beat.sessionToken });
    const gone = await t.query(api.crew.looking, { roomToken: beat.roomToken });
    expect(gone).toHaveLength(1);
    expect(gone[0].userId).toBe(c.userId);
    expect(gone[0].online).toBe(false);
    expect(gone[0].lastDisconnected).toBeGreaterThanOrEqual(NOON);
    expect(gone[0].lastDisconnected).toBeLessThan(NOON + 5000);
  });

  test("two sessions from one person read as one friend until both close", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    const phone = await t.mutation(api.crew.heartbeat, {
      deviceToken: token("Maya"),
      groupId: c.groupId,
      sessionId: "phone",
      interval: 10000,
    });
    const tablet = await t.mutation(api.crew.heartbeat, {
      deviceToken: token("Maya"),
      groupId: c.groupId,
      sessionId: "tablet",
      interval: 10000,
    });
    expect(tablet.roomToken).toBe(phone.roomToken);
    expect(tablet.sessionToken).not.toBe(phone.sessionToken);
    expect(await t.query(api.crew.looking, { roomToken: phone.roomToken })).toHaveLength(1);

    await t.mutation(api.crew.disconnect, { sessionToken: phone.sessionToken });
    expect(await t.query(api.crew.looking, { roomToken: phone.roomToken })).toEqual([
      { userId: c.userId, online: true, lastDisconnected: 0 },
    ]);
    await t.mutation(api.crew.disconnect, { sessionToken: tablet.sessionToken });
    expect((await t.query(api.crew.looking, { roomToken: phone.roomToken }))[0].online).toBe(false);
  });

  test("two phones looking at one crew show each other", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    const maya = await t.mutation(api.crew.heartbeat, {
      deviceToken: token("Maya"),
      groupId: c.groupId,
      sessionId: "maya",
      interval: 5000,
    });
    const dev = await t.mutation(api.crew.heartbeat, {
      deviceToken: token("Dev"),
      groupId: c.groupId,
      sessionId: "dev",
      interval: 600000,
    });
    const seen = await t.query(api.crew.looking, { roomToken: dev.roomToken });
    expect(seen.map((p) => p.online)).toEqual([true, true]);
    expect(new Set(seen.map((p) => p.userId)).size).toBe(2);
    expect(maya.roomToken).toBe(dev.roomToken);
  });

  test("a heartbeat needs membership, and a made up room reads empty", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya"]);
    await t.mutation(api.users.createGroup, {
      deviceToken: token("Eve"),
      firstName: "Eve",
      groupName: "Other",
    });
    await expect(
      t.mutation(api.crew.heartbeat, {
        deviceToken: token("Eve"),
        groupId: c.groupId,
        sessionId: "eve",
        interval: 10000,
      }),
    ).rejects.toThrow(/not in this crew/);
    await expect(
      t.mutation(api.crew.heartbeat, {
        deviceToken: token("Ghost"),
        groupId: c.groupId,
        sessionId: "ghost",
        interval: 10000,
      }),
    ).rejects.toThrow(/not signed in/);
    expect(await t.query(api.crew.looking, { roomToken: "not-a-room" })).toEqual([]);
    await t.mutation(api.crew.disconnect, { sessionToken: "not-a-session" });
  });
});

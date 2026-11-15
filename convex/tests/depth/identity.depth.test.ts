/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { HOUR, NOON, makeT, setupCrew, token, type T } from "../setup.helpers";

const DAY = "2026-11-15";
const BAD_CODE = "00000000";

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

const membershipsOf = async (t: T, userId: Id<"users">) =>
  await t.run(async (ctx) =>
    await ctx.db.query("memberships").withIndex("by_userId", (q) => q.eq("userId", userId)).take(20),
  );

describe("device identity", () => {
  test("a device token outside 32 to 256 characters is refused before anything is written", async () => {
    const t = makeT();
    await expect(
      t.mutation(api.users.createGroup, { deviceToken: "a".repeat(31), firstName: "Maya", groupName: "Crew" }),
    ).rejects.toThrow(/32 to 256/);
    await expect(
      t.mutation(api.users.createGroup, { deviceToken: "a".repeat(257), firstName: "Maya", groupName: "Crew" }),
    ).rejects.toThrow(/32 to 256/);
    await expect(
      t.mutation(api.users.joinGroup, {
        deviceToken: "a".repeat(31),
        firstName: "Maya",
        inviteCode: "ABCD2345",
      }),
    ).rejects.toThrow(/32 to 256/);
    expect(await t.run(async (ctx) => await ctx.db.query("users").collect())).toHaveLength(0);
    expect(await t.run(async (ctx) => await ctx.db.query("groups").collect())).toHaveLength(0);
  });

  test("the shortest and longest legal tokens work", async () => {
    const t = makeT();
    const short = "b".repeat(32);
    const long = "c".repeat(256);
    const one = await t.mutation(api.users.createGroup, { deviceToken: short, firstName: "Maya", groupName: "Crew" });
    const two = await t.mutation(api.users.createGroup, { deviceToken: long, firstName: "Dev", groupName: "Crew" });
    expect(one.userId).not.toBe(two.userId);
    expect((await t.query(api.users.me, { deviceToken: short }))?.name).toBe("Maya");
    expect((await t.query(api.users.me, { deviceToken: long }))?.name).toBe("Dev");
  });

  test("an unknown device is refused by every write and reads as signed out", async () => {
    const t = makeT();
    const crewRow = await crew(t, ["Maya"]);
    const ghost = token("Ghost");
    expect(await t.query(api.users.me, { deviceToken: ghost })).toBeNull();
    await expect(t.query(api.limits.mine, { deviceToken: ghost })).rejects.toThrow(/not signed in/);
    await expect(t.query(api.crew.crew, { deviceToken: ghost, groupId: crewRow.groupId, day: DAY })).rejects.toThrow(
      /not signed in/,
    );
    await expect(
      t.mutation(api.taps.tap, { deviceToken: ghost, frolicId: await oneFrolic(t, crewRow.groupId), kind: "down" }),
    ).rejects.toThrow(/not signed in/);
    await expect(t.mutation(api.users.generateUploadUrl, { deviceToken: ghost })).rejects.toThrow(/not signed in/);
    await expect(t.mutation(api.users.updateProfile, { deviceToken: ghost, firstName: "Ghost" })).rejects.toThrow(
      /not signed in/,
    );
  });

  test("a first name is trimmed, collapsed and bounded", async () => {
    const t = makeT();
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "  Maya   Chen ",
      groupName: "Crew",
    });
    expect((await t.query(api.users.me, { deviceToken: token("Maya") }))?.name).toBe("Maya Chen");
    await expect(
      t.mutation(api.users.createGroup, { deviceToken: token("Dev"), firstName: "   ", groupName: "Crew" }),
    ).rejects.toThrow(/1 to 40/);
    await expect(
      t.mutation(api.users.createGroup, { deviceToken: token("Dev"), firstName: "x".repeat(41), groupName: "Crew" }),
    ).rejects.toThrow(/1 to 40/);
    expect(await t.run(async (ctx) => await ctx.db.query("users").collect())).toHaveLength(1);
    expect(created.userId).toBe((await t.query(api.users.me, { deviceToken: token("Maya") }))!.userId);
  });

  test("creating a group again from the same device renames the same person and leaves one user row", async () => {
    const t = makeT();
    const first = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Crew",
    });
    const second = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya Chen",
      groupName: "Crew Two",
    });
    expect(second.userId).toBe(first.userId);
    expect(await t.run(async (ctx) => await ctx.db.query("users").collect())).toHaveLength(1);
    const view = await t.query(api.users.me, { deviceToken: token("Maya") });
    expect(view?.name).toBe("Maya Chen");
    expect(view?.groups.map((g) => g.name).sort()).toEqual(["Crew", "Crew Two"]);
  });

  test("updateProfile writes a new name and photo, and me and crew surface both", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya"]);
    const photo = await t.run(async (ctx) => await ctx.storage.store(new Blob(["photo"])));

    await t.mutation(api.users.updateProfile, { deviceToken: token("Maya"), firstName: "  Maya  C " });
    const named = await t.query(api.users.me, { deviceToken: token("Maya") });
    expect(named?.name).toBe("Maya C");
    expect(named?.photoUrl).toBeNull();

    await t.mutation(api.users.updateProfile, { deviceToken: token("Maya"), photoId: photo });
    const withPhoto = await t.query(api.users.me, { deviceToken: token("Maya") });
    expect(withPhoto?.photoUrl).toEqual(expect.any(String));
    expect(withPhoto?.name).toBe("Maya C");

    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: c.groupId, day: DAY });
    expect(view.members[0].photoUrl).toEqual(expect.any(String));

    await t.mutation(api.users.updateProfile, { deviceToken: token("Maya") });
    expect((await t.query(api.users.me, { deviceToken: token("Maya") }))?.name).toBe("Maya C");
    await expect(
      t.mutation(api.users.updateProfile, { deviceToken: token("Maya"), firstName: "" }),
    ).rejects.toThrow(/1 to 40/);
  });

  test("generateUploadUrl hands back a URL for a signed in device", async () => {
    const t = makeT();
    await crew(t, ["Maya"]);
    const url = await t.mutation(api.users.generateUploadUrl, { deviceToken: token("Maya") });
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain("upload");
  });
});

describe("invites", () => {
  test("an invite lands the joiner in the code's crew and nowhere else", async () => {
    const t = makeT();
    const first = await crew(t, ["Maya"]);
    const other = await crew(t, ["Priya", "Sam"]);

    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token("Dev"),
      firstName: "Dev",
      inviteCode: other.inviteCode,
    });
    expect(joined.groupId).toBe(other.groupId);
    expect(joined.groupId).not.toBe(first.groupId);
    const rows = await membershipsOf(t, joined.userId);
    expect(rows.map((r) => r.groupId)).toEqual([other.groupId]);
    expect(rows[0].joinedVia).toBe("invite");

    const again = await t.mutation(api.users.joinGroup, {
      deviceToken: token("Dev"),
      firstName: "Dev",
      inviteCode: other.inviteCode,
    });
    expect(again.userId).toBe(joined.userId);
    expect(await membershipsOf(t, joined.userId)).toHaveLength(1);
  });

  test("a web join records the web source and the web memberships", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya"]);
    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token("Web"),
      firstName: "Sam",
      inviteCode: c.inviteCode,
      via: "web",
    });
    const user = await t.run(async (ctx) => await ctx.db.get("users", joined.userId));
    expect(user?.source).toBe("web");
    const rows = await membershipsOf(t, joined.userId);
    expect(rows[0].joinedVia).toBe("web");
  });

  test("a frolic invite carries its frolic back to the joiner and is refused across crews", async () => {
    const t = makeT();
    const mine = await crew(t, ["Maya", "Dev"]);
    const theirs = await crew(t, ["Priya", "Sam"]);
    const frolic = await oneFrolic(t, mine.groupId);
    const otherFrolic = await oneFrolic(t, theirs.groupId);

    const code = await t.mutation(api.users.createInvite, {
      deviceToken: token("Maya"),
      groupId: mine.groupId,
      frolicId: frolic,
    });
    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token("Jordan"),
      firstName: "Jordan",
      inviteCode: code,
    });
    expect(joined.groupId).toBe(mine.groupId);
    expect(joined.frolicId).toBe(frolic);

    const kind = await t.run(
      async (ctx) => (await ctx.db.query("invites").withIndex("by_code", (q) => q.eq("code", code)).unique())?.kind,
    );
    expect(kind).toBe("frolic");

    await expect(
      t.mutation(api.users.createInvite, {
        deviceToken: token("Maya"),
        groupId: mine.groupId,
        frolicId: otherFrolic,
      }),
    ).rejects.toThrow(/frolic is gone/);
  });

  test("a revoked invite is refused on both the preview and the join", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya"]);
    const code = await t.mutation(api.users.createInvite, { deviceToken: token("Maya"), groupId: c.groupId });
    expect(await t.query(api.users.invitePreview, { inviteCode: code })).toMatchObject({ memberCount: 1 });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("invites").withIndex("by_code", (q) => q.eq("code", code)).unique();
      await ctx.db.patch("invites", row!._id, { revoked: true });
    });
    await expect(
      t.mutation(api.users.joinGroup, { deviceToken: token("Dev"), firstName: "Dev", inviteCode: code }),
    ).rejects.toThrow(/expired/);
    expect(await t.query(api.users.invitePreview, { inviteCode: code })).toBeNull();
    await expect(
      t.mutation(internal.users.joinAs, {
        userId: c.ids.Maya,
        inviteCode: code,
        via: "imessage",
      }),
    ).rejects.toThrow(/expired/);
  });

  test("the preview hides a code whose crew or inviter is gone", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya"]);
    const code = await t.mutation(api.users.createInvite, { deviceToken: token("Maya"), groupId: c.groupId });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("invites").withIndex("by_code", (q) => q.eq("code", code)).unique();
      await ctx.db.delete("groups", row!.groupId);
    });
    expect(await t.query(api.users.invitePreview, { inviteCode: code })).toBeNull();
    await expect(
      t.query(api.users.invitePreview, { inviteCode: BAD_CODE }),
    ).resolves.toBeNull();
  });

  test("the preview lists at most six faces but counts everyone", async () => {
    const t = makeT();
    const names = ["Maya", "Dev", "Jordan", "Priya", "Sam", "Noor", "Ada", "Bo"];
    const c = await crew(t, names);
    const preview = await t.query(api.users.invitePreview, { inviteCode: c.inviteCode });
    expect(preview?.memberCount).toBe(8);
    expect(preview?.members).toHaveLength(6);
    expect(preview?.members.map((m) => m.name)).toEqual(names.slice(0, 6));
    expect(new Set(preview?.members.map((m) => m.color)).size).toBe(6);
  });

  test.skip("BUG-1 an iMessage join refuses an expired invite like every other join", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya"]);
    const code = await t.mutation(api.users.createInvite, { deviceToken: token("Maya"), groupId: c.groupId });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("invites").withIndex("by_code", (q) => q.eq("code", code)).unique();
      await ctx.db.patch("invites", row!._id, { expiresAt: NOON - 1 });
    });
    const dev = await t.mutation(internal.users.createAs, { name: "Dev", phone: "+15550001111" });
    await expect(
      t.mutation(internal.users.joinAs, { userId: dev, inviteCode: code, via: "imessage" }),
    ).rejects.toThrow(/expired/);
    expect(await membershipsOf(t, dev)).toHaveLength(0);
  });
});

async function oneFrolic(t: T, groupId: Id<"groups">): Promise<Id<"frolics">> {
  return await t.mutation(internal.frolics.open, {
    groupId,
    day: "2026-11-15",
    kind: "daily",
    window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
    durationMinutes: 60,
    deadline: NOON + 4 * HOUR,
  });
}

describe("group scope", () => {
  test("a frolic id from another crew is not readable through today", async () => {
    const t = makeT();
    const mine = await crew(t, ["Maya"]);
    const theirs = await crew(t, ["Priya", "Sam"]);
    const otherFrolic = await oneFrolic(t, theirs.groupId);
    await expect(
      t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: mine.groupId, frolicId: otherFrolic }),
    ).rejects.toThrow(/frolic is gone/);
  });

  test("setupCrew keeps every member in one crew with the right ids", async () => {
    const t = makeT();
    const c = await setupCrew(t, ["Maya", "Dev"]);
    const view = await t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: c.groupId });
    expect(view.memberCount).toBe(2);
    const dev = await t.query(api.users.me, { deviceToken: token("Dev") });
    expect(dev?.userId).toBe(c.ids.Dev);
  });
});

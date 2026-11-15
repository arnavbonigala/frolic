import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import { SNAP_WINDOW_MS } from "../../convex/snaps";
import { ANA_PHONE, INVITE_CODE, SAM_PHONE, linkChat, seat, seedCrew } from "../../keiki/test/seed";
import { attendeesOf, makeT, patchFrolic, storeBlob } from "../../keiki/test/harness";
import type { Seed, SeedOptions, T } from "../../keiki/test/seed";

async function seeded(options: SeedOptions = {}): Promise<{ t: T; seed: Seed }> {
  const t = makeT();
  const seed = await seedCrew(t, options);
  return { t, seed };
}

async function onScreen(t: T, seed: Seed, userIds: Seed["samId"][]) {
  const revealAt = seed.now - 1000;
  await patchFrolic(t, seed.frolicId, { status: "on", revealAt, bloomAt: revealAt });
  await seat(t, seed.frolicId, seed.groupId, userIds, revealAt);
  return revealAt;
}

describe("keiki onMyWay", () => {
  it("refuses a phone that is not in a crew", async () => {
    const { t } = await seeded();
    const answer = await t.mutation(internal.keiki.tools.onMyWay, { phone: "+15105550999", minutes: 10, now: Date.now() });
    expect(answer).toEqual({ ok: false, error: "not_in_a_crew", say: expect.stringContaining("join_crew") });
  });

  it("refuses an eta when the plan is not on yet", async () => {
    const { t, seed } = await seeded();
    const answer = await t.mutation(internal.keiki.tools.onMyWay, { phone: SAM_PHONE, minutes: 10, now: seed.now });
    expect(answer).toEqual({ ok: false, error: "not_on", say: expect.any(String) });
  });

  it("writes the eta for someone going and clamps it to a sane window", async () => {
    const { t, seed } = await seeded();
    await onScreen(t, seed, [seed.samId]);
    const far = await t.mutation(internal.keiki.tools.onMyWay, { phone: SAM_PHONE, minutes: 900, now: seed.now });
    expect(far).toEqual({ ok: true, minutes: 240, say: expect.stringContaining("240") });
    const negative = await t.mutation(internal.keiki.tools.onMyWay, { phone: SAM_PHONE, minutes: -30, now: seed.now });
    expect(negative).toEqual({ ok: true, minutes: 0, say: expect.any(String) });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("etas")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", seed.frolicId).eq("userId", seed.samId))
        .unique(),
    );
    expect(row?.minutes).toBe(0);
    expect(row?.onTheWay).toBe(true);
  });
});

describe("keiki checkIn", () => {
  it("refuses a check in from someone who is not going", async () => {
    const { t, seed } = await seeded();
    await onScreen(t, seed, []);
    const answer = await t.mutation(internal.keiki.tools.checkIn, { phone: SAM_PHONE, now: seed.now });
    expect(answer).toEqual({ ok: false, error: "not_on", say: expect.any(String) });
  });

  it("keeps a check in out when the shared location is far from the meeting point", async () => {
    const { t, seed } = await seeded();
    await onScreen(t, seed, [seed.samId]);
    const answer = await t.mutation(internal.keiki.tools.checkIn, {
      phone: SAM_PHONE,
      coords: { lat: seed.coords.lat + 0.2, lng: seed.coords.lng },
      now: seed.now,
    });
    expect(answer).toMatchObject({ ok: false, error: "too_far", place: expect.any(String) });
    expect((answer as { meters: number }).meters).toBeGreaterThan(400);
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("checkins")
        .withIndex("by_frolicId", (q) => q.eq("frolicId", seed.frolicId))
        .take(10),
    );
    expect(rows).toEqual([]);
  });

  it("checks someone in at the meeting point and records the iMessage method", async () => {
    const { t, seed } = await seeded();
    await onScreen(t, seed, [seed.samId]);
    const answer = await t.mutation(internal.keiki.tools.checkIn, { phone: SAM_PHONE, coords: seed.coords, now: seed.now });
    expect(answer).toEqual({ ok: true, checkedIn: true, viaLocation: true });
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("checkins")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", seed.frolicId).eq("userId", seed.samId))
        .unique(),
    );
    expect(rows?.method).toBe("imessage");
  });
});

describe("keiki snapTarget", () => {
  it("closes the snap window until snapAt opens it", async () => {
    const { t, seed } = await seeded();
    await onScreen(t, seed, [seed.samId]);
    const answer = await t.query(internal.keiki.tools.snapTarget, { phone: SAM_PHONE, now: seed.now });
    expect(answer).toEqual({ ok: false, body: { ok: false, error: "snap_not_open", say: expect.any(String) } });
  });

  it("wants a check in before a photo", async () => {
    const { t, seed } = await seeded();
    await onScreen(t, seed, [seed.samId]);
    await patchFrolic(t, seed.frolicId, { snapAt: seed.now });
    const answer = await t.query(internal.keiki.tools.snapTarget, { phone: SAM_PHONE, now: seed.now });
    expect(answer).toEqual({ ok: false, body: { ok: false, error: "not_checked_in", say: expect.any(String) } });
  });

  it("hands back the user and frolic once the window is open and they are there", async () => {
    const { t, seed } = await seeded();
    await onScreen(t, seed, [seed.samId]);
    await patchFrolic(t, seed.frolicId, { snapAt: seed.now });
    await t.mutation(internal.keiki.tools.checkIn, { phone: SAM_PHONE, now: seed.now });
    const answer = await t.query(internal.keiki.tools.snapTarget, { phone: SAM_PHONE, now: seed.now });
    expect(answer).toEqual({ ok: true, userId: seed.samId, frolicId: seed.frolicId });
    const late = await t.query(internal.keiki.tools.snapTarget, { phone: SAM_PHONE, now: seed.now + SNAP_WINDOW_MS + 1 });
    expect(late).toEqual({ ok: false, body: { ok: false, error: "snap_not_open", say: expect.any(String) } });
  });
});

describe("keiki submitSnap", () => {
  it("refuses a photo from someone who never checked in", async () => {
    const { t, seed } = await seeded();
    await onScreen(t, seed, [seed.samId]);
    const storageId = await storeBlob(t, [255, 216, 255, 224], "image/jpeg");
    await expect(
      t.mutation(internal.keiki.tools.submitSnap, { userId: seed.samId, frolicId: seed.frolicId, storageId, now: seed.now }),
    ).rejects.toThrow(/NOT_CHECKED_IN/);
  });

  it("adds the photo to the frolic and reports the collage state honestly", async () => {
    const { t, seed } = await seeded();
    const wall = Date.now();
    await onScreen(t, seed, [seed.samId]);
    await patchFrolic(t, seed.frolicId, { snapAt: wall });
    await t.mutation(internal.keiki.tools.checkIn, { phone: SAM_PHONE, now: seed.now });
    const storageId = await storeBlob(t, [255, 216, 255, 224], "image/jpeg");
    const first = await t.mutation(internal.keiki.tools.submitSnap, {
      userId: seed.samId,
      frolicId: seed.frolicId,
      storageId,
      now: wall,
    });
    expect(first).toEqual({ ok: true, added: true, collageUrl: null, say: expect.stringContaining("collage") });
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("snaps")
        .withIndex("by_frolicId", (q) => q.eq("frolicId", seed.frolicId))
        .take(10),
    );
    expect(rows.map((row) => row.userId)).toEqual([seed.samId]);
  });
});

describe("keiki depositTarget", () => {
  it("says the deposit is already in when a share is held", async () => {
    const { t, seed } = await seeded({ variant: "kayaks" });
    await onScreen(t, seed, [seed.samId]);
    await t.run(async (ctx) => {
      await ctx.db.insert("shares", {
        frolicId: seed.frolicId,
        groupId: seed.groupId,
        userId: seed.samId,
        amountCents: 500,
        kind: "deposit",
        status: "held",
        updatedAt: seed.now,
      });
    });
    const answer = await t.query(internal.keiki.tools.depositTarget, { phone: SAM_PHONE, now: seed.now });
    expect(answer).toEqual({ ok: false, body: { ok: false, error: "already_paid", say: expect.any(String) } });
  });

  it("hands back the amount owed from the frolic's whop plan", async () => {
    const { t, seed } = await seeded({ variant: "kayaks" });
    await onScreen(t, seed, [seed.samId]);
    const answer = await t.query(internal.keiki.tools.depositTarget, { phone: SAM_PHONE, now: seed.now });
    expect(answer).toEqual({ ok: true, userId: seed.samId, frolicId: seed.frolicId, amountCents: 500 });
  });
});

describe("keiki remember", () => {
  it("rejects a blank note", async () => {
    const { t, seed } = await seeded();
    const answer = await t.mutation(internal.keiki.tools.remember, { phone: SAM_PHONE, text: "   ", now: seed.now });
    expect(answer).toEqual({ ok: false, error: "empty", say: expect.any(String) });
  });

  it("records the trimmed note on the crew memory and trims it to 500 chars", async () => {
    const { t, seed } = await seeded();
    const long = "x".repeat(600);
    const answer = await t.mutation(internal.keiki.tools.remember, { phone: SAM_PHONE, text: "  " + long + "  ", now: seed.now });
    expect(answer).toEqual({ ok: true, remembered: "x".repeat(500) });
    const rows = await t.run(async (ctx) => ctx.db.query("memoryEvents").take(5));
    expect(rows).toHaveLength(1);
    expect(rows[0].groupId).toBe(seed.groupId);
    expect(rows[0].userId).toBe(seed.samId);
    expect((rows[0].payload as { text: string }).text).toBe("x".repeat(500));
  });
});

describe("keiki pause", () => {
  it("refuses a phone with no link", async () => {
    const { t } = await seeded();
    const answer = await t.mutation(internal.keiki.tools.pause, { phone: ANA_PHONE.replace("4", "9"), paused: true });
    expect(answer).toEqual({ ok: false, error: "not_in_a_crew", say: expect.any(String) });
  });

  it("pauses and unpauses texts for a linked phone", async () => {
    const { t, seed } = await seeded();
    expect(await t.mutation(internal.keiki.tools.pause, { phone: SAM_PHONE, paused: true })).toEqual({ ok: true, paused: true });
    const paused = await t.run(async (ctx) =>
      ctx.db
        .query("keikiLinks")
        .withIndex("by_userId", (q) => q.eq("userId", seed.samId))
        .first(),
    );
    expect(paused?.paused).toBe(true);
    expect(await t.mutation(internal.keiki.tools.pause, { phone: SAM_PHONE, paused: false })).toEqual({ ok: true, paused: false });
  });
});

describe("keiki joinCrew", () => {
  it("turns down a bad invite code", async () => {
    const { t, seed } = await seeded();
    const answer = await t.mutation(internal.keiki.tools.joinCrew, { phone: "+15105550988", code: "NOPE", name: "Rae", now: seed.now });
    expect(answer).toEqual({ ok: false, error: "bad_invite", say: expect.any(String) });
  });

  it("turns down an invite that has expired", async () => {
    const { t, seed } = await seeded();
    await t.run(async (ctx) => {
      const invite = await ctx.db
        .query("invites")
        .withIndex("by_code", (q) => q.eq("code", INVITE_CODE))
        .unique();
      await ctx.db.patch("invites", invite!._id, { expiresAt: seed.now - 1 });
    });
    const answer = await t.mutation(internal.keiki.tools.joinCrew, { phone: "+15105550988", code: INVITE_CODE, name: "Rae", now: seed.now });
    expect(answer).toEqual({ ok: false, error: "bad_invite", say: expect.any(String) });
  });

  it("asks for a name before it joins anyone", async () => {
    const { t, seed } = await seeded();
    const answer = await t.mutation(internal.keiki.tools.joinCrew, { phone: "+15105550988", code: INVITE_CODE.toLowerCase(), name: "   ", now: seed.now });
    expect(answer).toEqual({ ok: false, error: "no_name", say: expect.any(String) });
  });

  it("creates the person, joins them and links their phone", async () => {
    const { t, seed } = await seeded();
    const phone = "+15105550988";
    const answer = await t.mutation(internal.keiki.tools.joinCrew, { phone, code: INVITE_CODE.toLowerCase(), name: "  Rae Kim  ", now: seed.now });
    expect(answer).toMatchObject({ ok: true, crew: "Sunset Crew", name: "Rae", welcome: expect.any(String) });
    expect((answer as { friends: string[] }).friends).toEqual(["Maya", "Dev", "Sam", "Ana"]);
    const member = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .unique();
      const link = await ctx.db
        .query("keikiLinks")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .unique();
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", seed.groupId).eq("userId", user!._id))
        .unique();
      return { user, link, membership };
    });
    expect(member.user?.name).toBe("Rae Kim");
    expect(member.link?.userId).toBe(member.user?._id);
    expect(member.membership).not.toBeNull();
  });

  it("reuses the existing person on a second join instead of making a duplicate", async () => {
    const { t, seed } = await seeded();
    const phone = "+15105550988";
    await t.mutation(internal.keiki.tools.joinCrew, { phone, code: INVITE_CODE, name: "Rae", now: seed.now });
    await t.mutation(internal.keiki.tools.joinCrew, { phone, code: INVITE_CODE, name: "Rae", now: seed.now + 1 });
    const users = await t.run(async (ctx) => ctx.db.query("users").take(20));
    expect(users.filter((user) => user.phone === phone)).toHaveLength(1);
    const memberships = await t.run(async (ctx) => ctx.db.query("memberships").take(40));
    expect(memberships.filter((row) => row.groupId === seed.groupId)).toHaveLength(5);
  });
});

describe("keiki linkGroupChat", () => {
  it("turns down a bad invite code", async () => {
    const { t, seed } = await seeded();
    const answer = await t.mutation(internal.keiki.tools.linkGroupChat, { chatId: "imsg:chat:new", code: "NOPE", now: seed.now });
    expect(answer).toEqual({ ok: false, error: "bad_invite", say: expect.any(String) });
  });

  it("links a chat to the crew and refuses to move it to another crew", async () => {
    const { t, seed } = await seeded();
    const chatId = "imsg:chat:new";
    const linked = await t.mutation(internal.keiki.tools.linkGroupChat, { chatId, code: INVITE_CODE, now: seed.now });
    expect(linked).toMatchObject({ ok: true, crew: "Sunset Crew" });
    const again = await t.mutation(internal.keiki.tools.linkGroupChat, { chatId, code: INVITE_CODE, now: seed.now });
    expect(again).toMatchObject({ ok: true, crew: "Sunset Crew" });
    const otherGroup = await t.run(async (ctx) =>
      ctx.db.insert("groups", { name: "Other Crew", createdBy: seed.mayaId, timezone: "America/Los_Angeles" }),
    );
    await t.run(async (ctx) => {
      const invite = await ctx.db
        .query("invites")
        .withIndex("by_code", (q) => q.eq("code", INVITE_CODE))
        .unique();
      await ctx.db.insert("invites", { code: "OTHER1", groupId: otherGroup, createdBy: invite!.createdBy, kind: "group", revoked: false });
    });
    const conflict = await t.mutation(internal.keiki.tools.linkGroupChat, { chatId, code: "OTHER1", now: seed.now });
    expect(conflict).toEqual({ ok: false, error: "already_linked", say: expect.any(String) });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("keikiGroupChats")
        .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
        .unique(),
    );
    expect(row?.groupId).toBe(seed.groupId);
  });

  it("keeps a chat that was already linked to this crew", async () => {
    const { t, seed } = await seeded();
    const chatId = "imsg:chat:known";
    await linkChat(t, seed.groupId, chatId);
    const answer = await t.mutation(internal.keiki.tools.linkGroupChat, { chatId, code: INVITE_CODE, now: seed.now });
    expect(answer).toMatchObject({ ok: true, crew: "Sunset Crew" });
  });
});

describe("keiki requests", () => {
  it("returns nothing for a request it has never seen", async () => {
    const { t } = await seeded();
    expect(await t.query(internal.keiki.tools.findRequest, { requestKey: "req-1" })).toBeNull();
  });

  it("stores the first answer and hands it back on a retry", async () => {
    const { t, seed } = await seeded();
    expect(
      await t.mutation(internal.keiki.tools.saveRequest, { requestKey: "req-1", tool: "tap_down", status: 200, response: "Got it.", now: seed.now }),
    ).toBeNull();
    expect(await t.query(internal.keiki.tools.findRequest, { requestKey: "req-1" })).toEqual({ status: 200, response: "Got it." });
  });

  it("never overwrites the stored answer, so a retried text cannot answer twice", async () => {
    const { t, seed } = await seeded();
    await t.mutation(internal.keiki.tools.saveRequest, { requestKey: "req-2", tool: "tap_down", status: 200, response: "Got it.", now: seed.now });
    await t.mutation(internal.keiki.tools.saveRequest, { requestKey: "req-2", tool: "tap_down", status: 500, response: "Second answer.", now: seed.now + 1 });
    expect(await t.query(internal.keiki.tools.findRequest, { requestKey: "req-2" })).toEqual({ status: 200, response: "Got it." });
  });
});

describe("keiki tools keep the match secret", () => {
  it("tells a passer nothing about who is going or how many", async () => {
    const { t, seed } = await seeded();
    await onScreen(t, seed, [seed.anaId]);
    const answer = await t.mutation(internal.keiki.tools.tap, { phone: SAM_PHONE, kind: "pass", onlyWith: [], now: seed.now });
    const said = JSON.stringify(answer);
    expect(said).not.toContain("Ana");
    expect(said).not.toContain("1");
    expect((await attendeesOf(t, seed.frolicId)).map((row) => row.userId)).toEqual([seed.anaId]);
  });

  it("answers only_if with names but never a count of everyone in", async () => {
    const { t, seed } = await seeded();
    const answer = await t.mutation(internal.keiki.tools.tap, { phone: SAM_PHONE, kind: "down", onlyWith: ["Ana"], now: seed.now });
    expect(answer).toMatchObject({ ok: true, answer: "only_if", onlyWith: ["Ana"] });
    expect(JSON.stringify(answer)).not.toContain("Maya");
  });
});

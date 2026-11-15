/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token, type Crew, type T } from "./setup.helpers";

const DAY = "2026-11-15";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubEnv("CONVEX_SITE_URL", "https://frolic.convex.site");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function secondCrew(t: T, owner: string, name: string, members: string[] = []): Promise<Crew> {
  const created = await t.mutation(api.users.createGroup, {
    deviceToken: token(owner),
    firstName: owner,
    groupName: name,
  });
  const ids: Record<string, Id<"users">> = { [owner]: created.userId };
  for (const member of members) {
    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token(member),
      firstName: member,
      inviteCode: created.inviteCode,
    });
    ids[member] = joined.userId;
  }
  const now = Date.now();
  const frolicId = await t.mutation(internal.frolics.open, {
    groupId: created.groupId,
    day: DAY,
    kind: "daily",
    window: { start: now + HOUR, end: now + 6 * HOUR },
    durationMinutes: 60,
    deadline: now + 4 * HOUR,
  });
  return { groupId: created.groupId, frolicId, ids, inviteCode: created.inviteCode };
}

async function plantNight(
  t: T,
  crew: Crew,
  day: string,
  going: string[],
  opts: { tags?: string[]; status?: "done" | "on" | "faded" } = {},
): Promise<Id<"frolics">> {
  return await t.run(async (ctx) => {
    const placeId = await ctx.db.insert("places", {
      slug: `multi-${crew.groupId}-${day}-${Math.round(Math.random() * 1e9)}`,
      name: "A spot",
      lat: 37.87,
      lng: -122.27,
      cost: 5,
      tags: opts.tags ?? [],
      hours: [],
      indoor: false,
      sober: true,
      title: "A spot",
      address: "Berkeley",
      costPerPersonCents: 500,
      costLabel: "$5",
      payUpFront: false,
      priceVerified: true,
      energy: "chill",
      needsDaylight: false,
      durationMinutes: 60,
      meetSpot: "Front",
      source: "seed",
    });
    const planId = await ctx.db.insert("plans", {
      groupId: crew.groupId,
      day,
      kind: "daily",
      placeId,
      title: `Plan ${day}`,
      line: "A line",
      why: "A why",
      cost: 5,
      startsAt: NOON,
      durationMinutes: 60,
      source: "model",
      generatedAt: NOON,
      costLabel: "$5",
      payUpFront: false,
      chips: [],
      whySource: "template",
      whyInputs: { placeName: "A spot", topTags: [], rainSwap: false },
      weatherSwap: false,
    });
    const frolicId = await ctx.db.insert("frolics", {
      groupId: crew.groupId,
      day,
      kind: "daily",
      planId,
      status: opts.status ?? "done",
      window: { start: NOON, end: NOON + HOUR },
      durationMinutes: 60,
      deadline: NOON,
      origin: "daily",
      matchedAt: NOON,
      revealAt: NOON,
      bloomAt: NOON,
      startsAt: NOON,
      endsAt: NOON + HOUR,
    });
    for (const name of going) {
      await ctx.db.insert("attendees", {
        frolicId,
        groupId: crew.groupId,
        userId: crew.ids[name],
        role: "matched",
        status: "going",
        revealAt: NOON,
        bloomAt: NOON,
      });
    }
    return frolicId;
  });
}

async function membershipsOf(t: T, userId: Id<"users">) {
  return await t.run(
    async (ctx) => await ctx.db.query("memberships").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
  );
}

const names = (people: { name: string }[]) => people.map((person) => person.name).sort();

describe("joining adds a crew", () => {
  test("a second invite link adds a crew and leaves the first one whole", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends", ["Dev"]);

    expect(await membershipsOf(t, first.ids.Dev)).toHaveLength(2);

    const inFirst = await t.query(api.crew.crew, { deviceToken: token("Dev"), groupId: first.groupId, day: DAY });
    const inSecond = await t.query(api.crew.crew, { deviceToken: token("Dev"), groupId: second.groupId, day: DAY });
    expect(names(inFirst.members)).toEqual(["Dev", "Maya"]);
    expect(names(inSecond.members)).toEqual(["Dev", "Jordan"]);
    expect((await t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: first.groupId })).phase).toBe("open");
  });

  test("the web join page adds a crew instead of replacing the one they are in", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends");

    const { code } = await t.mutation(api.web.share.create, {
      frolicId: second.frolicId,
      deviceToken: token("Jordan"),
    });
    const joined = await t.mutation(api.web.share.join, { code, deviceToken: token("Dev"), name: "Dev" });
    expect(joined).toEqual({ ok: true, phase: "planted" });

    expect(await membershipsOf(t, first.ids.Dev)).toHaveLength(2);
    const planted = await t.run(async (ctx) => {
      const members = await ctx.db
        .query("memberships")
        .withIndex("by_groupId", (q) => q.eq("groupId", second.groupId))
        .collect();
      const row = await ctx.db
        .query("taps")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", second.frolicId).eq("userId", first.ids.Dev))
        .unique();
      return { members: members.map((m) => m.userId), source: row?.source };
    });
    expect(planted.members).toContain(first.ids.Dev);
    expect(planted.source).toBe("web");
  });

  test("an iMessage join adds a crew to someone already in one", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends");
    const phone = "+15105550123";

    const dev = await t.mutation(internal.users.createAs, { name: "Dev", phone });
    await t.mutation(internal.users.joinAs, { userId: dev, inviteCode: first.inviteCode, via: "imessage" });
    expect(await membershipsOf(t, dev)).toHaveLength(1);

    const joined = await t.mutation(internal.keiki.tools.joinCrew, {
      phone,
      code: second.inviteCode,
      name: "Dev",
      now: Date.now(),
    });
    expect(joined.ok).toBe(true);
    expect(await membershipsOf(t, dev)).toHaveLength(2);

    const crews = await t.run(async (ctx) => {
      const rows = await ctx.db.query("memberships").withIndex("by_userId", (q) => q.eq("userId", dev)).collect();
      return await Promise.all(rows.map((row) => ctx.db.get("groups", row.groupId)));
    });
    expect(crews.map((group) => group?.name).sort()).toEqual(["Sunset Crew", "Work Friends"]);
  });
});

describe("iMessage with two crews", () => {
  test("names every crew instead of quietly talking to the newest one", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends");
    const phone = "+15105550177";
    const dev = await t.mutation(internal.users.createAs, { name: "Dev", phone });
    await t.mutation(internal.users.joinAs, { userId: dev, inviteCode: first.inviteCode, via: "imessage" });
    await t.run(async (ctx) => ctx.db.insert("keikiLinks", { phone, userId: dev, paused: false, linkedAt: NOON }));

    const solo = await t.query(internal.keiki.tools.getMember, { phone });
    expect(solo).toMatchObject({ member: true, crew: "Sunset Crew" });
    expect(solo).not.toHaveProperty("crews");

    await t.mutation(internal.keiki.tools.joinCrew, { phone, code: second.inviteCode, name: "Dev", now: Date.now() });
    const both = await t.query(internal.keiki.tools.getMember, { phone });
    expect(both).toMatchObject({ member: true, crew: "Work Friends", crews: ["Sunset Crew", "Work Friends"] });

    const today = await t.query(internal.keiki.tools.getToday, { phone, now: Date.now() });
    expect(today).toMatchObject({ ok: true, crew: "Work Friends" });
  });
});

describe("crews:mine", () => {
  test("lists every crew with its own faces and whether today waits on me", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    await secondCrew(t, "Jordan", "Work Friends", ["Dev"]);

    const before = await t.query(api.crews.mine, { deviceToken: token("Dev") });
    expect(before.map((crew) => crew.name)).toEqual(["Sunset Crew", "Work Friends"]);
    expect(before.map((crew) => crew.memberCount)).toEqual([2, 2]);
    expect(before.map((crew) => crew.planOpen)).toEqual([true, true]);
    for (const crew of before) {
      expect(crew.members.filter((face) => face.isMe)).toHaveLength(1);
      expect(crew.members.every((face) => face.photoUrl === null)).toBe(true);
      expect(new Set(crew.members.map((face) => face.color)).size).toBe(2);
    }

    await tap(t, first, "Dev");
    const after = await t.query(api.crews.mine, { deviceToken: token("Dev") });
    expect(after.map((crew) => crew.planOpen)).toEqual([false, true]);
  });

  test("stays a bounded read per crew instead of walking every member of every crew", async () => {
    const t = makeT();
    await setupCrew(t, ["Maya", "Dev", "Jordan", "Priya"]);
    await secondCrew(t, "Sam", "Work Friends", ["Dev", "Ana"]);

    const reads = await t.run(async (ctx) => {
      const before = await ctx.meta.getTransactionMetrics();
      await ctx.runQuery(api.crews.mine, { deviceToken: token("Dev") });
      const after = await ctx.meta.getTransactionMetrics();
      return after.documentsRead.used - before.documentsRead.used;
    });
    expect(reads).toBeLessThan(40);
  });
});

describe("users:me join times", () => {
  test("dates each crew so a cold launch can pick the newest one instead of the first listed", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends", ["Dev"]);

    const crews = (await t.query(api.users.me, { deviceToken: token("Dev") }))!.groups;

    const newest = crews.reduce((best, crew) => (crew.joinedAt >= best.joinedAt ? crew : best));
    const oldest = crews.reduce((best, crew) => (crew.joinedAt <= best.joinedAt ? crew : best));
    expect(newest.groupId).toBe(second.groupId);
    expect(oldest.groupId).toBe(first.groupId);
    expect(newest.joinedAt).toBeGreaterThan(1_700_000_000_000);
  });

  test("keeps a join time fixed once the crew is joined", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const before = await t.query(api.users.me, { deviceToken: token("Dev") });

    await t.mutation(api.users.updateProfile, { deviceToken: token("Dev"), firstName: "Dev Patel" });

    const after = await t.query(api.users.me, { deviceToken: token("Dev") });
    expect(after!.groups.map((crew) => [crew.groupId, crew.joinedAt])).toEqual(
      before!.groups.map((crew) => [crew.groupId, crew.joinedAt]),
    );
    expect(after!.groups.map((crew) => crew.groupId)).toEqual([first.groupId]);
  });
});

describe("two crews stay apart", () => {
  test("a secret tap in one crew says nothing in the other", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends", ["Dev"]);

    await tap(t, first, "Maya");
    await tap(t, second, "Jordan");

    expect((await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: first.groupId })).phase).toBe("waiting");
    expect((await t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: first.groupId })).phase).toBe("open");
    expect((await t.query(api.frolics.today, { deviceToken: token("Jordan"), groupId: second.groupId })).phase).toBe("waiting");
    expect((await t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: second.groupId })).phase).toBe("open");
  });

  test("each crew reveals at its own revealAt with only its own people", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends", ["Dev", "Priya"]);

    await tap(t, first, "Maya");
    await tap(t, first, "Dev");
    await flipDue(t);
    const revealed = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: first.groupId });
    expect(revealed.phase).toBe("on");
    expect(names(revealed.reveal!.going)).toEqual(["Dev", "Maya"]);

    const stillOpen = await t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: second.groupId });
    expect(stillOpen.phase).toBe("open");
    expect(stillOpen.reveal).toBeNull();

    vi.advanceTimersByTime(60 * 1000);
    await tap(t, second, "Jordan");
    await tap(t, second, "Priya");
    await flipDue(t);
    const later = await t.query(api.frolics.today, { deviceToken: token("Jordan"), groupId: second.groupId });
    expect(later.phase).toBe("on");
    expect(names(later.reveal!.going)).toEqual(["Jordan", "Priya"]);
    expect(later.reveal!.revealAt).toBeGreaterThan(revealed.reveal!.revealAt);
  });

  test("each garden counts only its own nights and its own thirst", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends", ["Dev"]);

    for (const day of ["2026-11-12", "2026-11-13", "2026-11-14"]) await plantNight(t, first, day, ["Maya", "Dev"]);
    for (const day of ["2026-11-13", "2026-11-14"]) await plantNight(t, second, day, ["Jordan", "Dev"]);

    const one = await t.query(api.garden.overview, { deviceToken: token("Dev"), groupId: first.groupId, day: DAY });
    const two = await t.query(api.garden.overview, { deviceToken: token("Dev"), groupId: second.groupId, day: DAY });

    expect(one.count).toBe(3);
    expect(two.count).toBe(2);
    expect(one.yourCount).toBe(3);
    expect(two.yourCount).toBe(2);
    expect(one.memories.every((memory) => memory.going.every((face) => ["Dev", "Maya"].includes(face.name)))).toBe(true);
    expect(two.memories.every((memory) => memory.going.every((face) => ["Dev", "Jordan"].includes(face.name)))).toBe(true);
    expect(one.health).toMatchObject({ state: "thriving", daysSince: 1 });
    expect(two.health).toMatchObject({ state: "thriving", daysSince: 1 });
    const oneIds = one.memories.map((memory) => memory.frolicId);
    const twoIds = two.memories.map((memory) => memory.frolicId);
    expect(oneIds.filter((id) => twoIds.includes(id))).toEqual([]);
  });

  test("the Fund holds only its own crew's shares", async () => {
    const t = makeT();
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends", ["Dev"]);

    await t.run(async (ctx) => {
      await ctx.db.insert("fundLedger", {
        groupId: first.groupId,
        frolicId: first.frolicId,
        userId: first.ids.Maya,
        entry: "forfeit",
        amountCents: 1500,
        at: NOON,
      });
      await ctx.db.insert("fundLedger", {
        groupId: second.groupId,
        frolicId: second.frolicId,
        userId: second.ids.Jordan,
        entry: "forfeit",
        amountCents: 200,
        at: NOON,
      });
    });

    const one = await t.query(api.whop.pay.fund, { deviceToken: token("Dev"), groupId: first.groupId });
    const two = await t.query(api.whop.pay.fund, { deviceToken: token("Dev"), groupId: second.groupId });
    expect(one.balanceCents).toBe(1500);
    expect(two.balanceCents).toBe(200);
    expect(one.entries.map((entry) => entry.amountCents)).toEqual([1500]);
    expect(two.entries.map((entry) => entry.amountCents)).toEqual([200]);
  });
});

describe("you:totals", () => {
  async function twoCrews(t: T) {
    const first = await setupCrew(t, ["Maya", "Dev"]);
    const second = await secondCrew(t, "Jordan", "Work Friends", ["Dev"]);
    await plantNight(t, first, "2026-11-11", ["Maya", "Dev"], { tags: ["sunsets"] });
    await plantNight(t, first, "2026-11-12", ["Maya", "Dev"]);
    await plantNight(t, first, "2026-11-14", ["Maya", "Dev"]);
    await plantNight(t, first, "2026-11-13", ["Maya", "Dev"], { status: "faded" });
    await plantNight(t, second, "2026-11-13", ["Jordan", "Dev"]);
    await plantNight(t, second, "2026-11-14", ["Jordan", "Dev"]);
    await plantNight(t, second, "2026-11-12", ["Jordan"]);
    return { first, second };
  }

  test("counts the frolics that happened for me across every crew I belong to", async () => {
    const t = makeT();
    const { first, second } = await twoCrews(t);

    const totals = await t.query(api.you.totals, { deviceToken: token("Dev") });
    expect(totals.frolics).toBe(5);
    expect(totals.crews).toBe(2);
    expect(totals.varieties).toEqual([{ key: "goldenPoppy", name: "Golden poppy", count: 1 }]);

    const alone = await t.query(api.you.totals, { deviceToken: token("Jordan") });
    expect(alone.frolics).toBe(3);
    expect(alone.crews).toBe(1);

    const other = await t.query(api.you.totals, { deviceToken: token("Maya") });
    expect(other.frolics).toBe(3);
    expect(other.varieties).toEqual([{ key: "goldenPoppy", name: "Golden poppy", count: 1 }]);
    expect((await t.query(api.garden.overview, { deviceToken: token("Dev"), groupId: first.groupId, day: DAY })).count).toBe(3);
    expect((await t.query(api.garden.overview, { deviceToken: token("Dev"), groupId: second.groupId, day: DAY })).count).toBe(2);
  });

  test("a frolic that never happened and one only my crewmates went to are left out", async () => {
    const t = makeT();
    const { second } = await twoCrews(t);
    const onlyOthers = await t.run(async (ctx) =>
      await ctx.db.query("frolics").withIndex("by_groupId_and_day", (q) => q.eq("groupId", second.groupId).eq("day", "2026-11-12")).unique(),
    );
    expect(onlyOthers).not.toBeNull();

    const totals = await t.query(api.you.totals, { deviceToken: token("Dev") });
    const faded = await t.run(async (ctx) =>
      await ctx.db.query("frolics").withIndex("by_groupId_and_day", (q) => q.eq("groupId", second.groupId).eq("day", "2026-11-11")).collect(),
    );
    expect(faded).toEqual([]);
    expect(totals.frolics).toBe(5);
  });

  test("leaves each crew's garden nights and thirst exactly as they were", async () => {
    const t = makeT();
    const { first, second } = await twoCrews(t);
    const before = {
      one: await t.query(api.garden.overview, { deviceToken: token("Dev"), groupId: first.groupId, day: DAY }),
      two: await t.query(api.garden.overview, { deviceToken: token("Dev"), groupId: second.groupId, day: DAY }),
    };

    await t.query(api.you.totals, { deviceToken: token("Dev") });

    const after = {
      one: await t.query(api.garden.overview, { deviceToken: token("Dev"), groupId: first.groupId, day: DAY }),
      two: await t.query(api.garden.overview, { deviceToken: token("Dev"), groupId: second.groupId, day: DAY }),
    };
    expect(after.one.count).toBe(before.one.count);
    expect(after.two.count).toBe(before.two.count);
    expect(after.one.health).toEqual(before.one.health);
    expect(after.two.health).toEqual(before.two.health);
    expect(after.one.memories.map((memory) => memory.frolicId)).toEqual(before.one.memories.map((memory) => memory.frolicId));
    expect(after.two.memories.map((memory) => memory.frolicId)).toEqual(before.two.memories.map((memory) => memory.frolicId));
  });
});

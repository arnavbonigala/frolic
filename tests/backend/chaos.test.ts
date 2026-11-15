import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, today, token, type Crew, type T } from "./setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const frolicOf = (t: T, crew: Crew) => t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
const rows = <N extends "taps" | "reveals" | "attendees" | "shares" | "hopIns">(t: T, table: N) =>
  t.run(async (ctx) => await ctx.db.query(table).collect());
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? String(e);
  }
};

async function goOn(t: T, crew: Crew, names: string[]) {
  for (const n of names) await tap(t, crew, n);
  await flipDue(t);
}

async function drain(t: T, rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

describe("people tapping in ways nobody planned", () => {
  test("down, pass, down in a burst leaves one tap and one clean reveal", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Dev", { kind: "notToday" });
    expect(await rows(t, "reveals")).toHaveLength(0);
    await tap(t, crew, "Dev");
    expect(await rows(t, "taps")).toHaveLength(2);
    expect(await rows(t, "reveals")).toHaveLength(1);
    await flipDue(t);
    expect((await frolicOf(t, crew))?.status).toBe("on");
    expect(await rows(t, "attendees")).toHaveLength(2);
  });

  test("a pass between two downs never reveals early to the other phone", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    const before = await today(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Dev", { kind: "notToday" });
    await flipDue(t);
    expect(await today(t, crew, "Maya")).toEqual(before);
  });

  test("tapping a faded frolic is closed", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { deadlineIn: 1000 });
    await flipDue(t, 2000);
    expect((await frolicOf(t, crew))?.status).toBe("faded");
    expect(await codeOf(tap(t, crew, "Maya"))).toBe("CLOSED");
  });

  test("tapping a frolic of a crew you are not in is refused and writes nothing", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const other = await t.mutation(api.users.createGroup, { deviceToken: token("Zed"), firstName: "Zed", groupName: "Other" });
    expect(other.groupId).not.toBe(crew.groupId);
    const code = await codeOf(
      t.mutation(api.taps.tap, { deviceToken: token("Zed"), frolicId: crew.frolicId, kind: "down" }),
    );
    expect(code).toBe("NOT_A_MEMBER");
    expect(await rows(t, "taps")).toHaveLength(0);
  });

  test("untapping after the reveal keeps you going and keeps the reveal readable", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await goOn(t, crew, ["Maya", "Dev"]);
    await t.mutation(api.taps.untap, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    const dev = await today(t, crew, "Dev");
    expect(dev.phase).toBe("on");
    expect(dev.reveal?.me.going).toBe(true);
  });
});

describe("only if, used strangely", () => {
  test("naming yourself is ignored", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya", { onlyIf: ["Maya"] });
    expect((await today(t, crew, "Maya")).myTap?.onlyIf).toEqual([]);
  });

  test("naming someone outside the crew is a clear error and saves nothing", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const stranger = await t.mutation(api.users.createGroup, { deviceToken: token("Zed"), firstName: "Zed", groupName: "Other" });
    const code = await codeOf(
      t.mutation(api.taps.tap, { deviceToken: token("Maya"), frolicId: crew.frolicId, kind: "down", onlyIf: [stranger.userId] }),
    );
    expect(code).toBe("BAD_ONLY_IF");
    expect(await rows(t, "taps")).toHaveLength(0);
  });

  test("naming everyone matches only when everyone is down", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya", { onlyIf: ["Dev", "Jordan"] });
    await tap(t, crew, "Dev");
    expect(await rows(t, "reveals")).toHaveLength(0);
    await tap(t, crew, "Jordan");
    await flipDue(t);
    expect((await today(t, crew, "Maya")).reveal?.going).toHaveLength(3);
  });

  test("a cycle where each names the other still matches", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    await tap(t, crew, "Dev", { onlyIf: ["Maya"] });
    await flipDue(t);
    expect((await frolicOf(t, crew))?.status).toBe("on");
  });

  test("only if someone who passed holds you out, and the others still match", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Jordan", { kind: "notToday" });
    await tap(t, crew, "Maya", { onlyIf: ["Jordan"] });
    await tap(t, crew, "Dev");
    expect(await rows(t, "reveals")).toHaveLength(0);
    await tap(t, crew, "Jordan");
    await flipDue(t);
    const going = (await today(t, crew, "Dev")).reveal?.going.map((p) => p.name).sort();
    expect(going).toEqual(["Dev", "Jordan", "Maya"]);
  });
});

describe("I'm free, twice and at once", () => {
  test("two people starting at once share one plan, and the second start is not counted", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"], { window: { start: Date.now() + 5 * HOUR, end: Date.now() + 8 * HOUR } });
    const a = await t.mutation(api.frolics.imFree, { deviceToken: token("Maya"), groupId: crew.groupId, forMinutes: 120 });
    const b = await t.mutation(api.frolics.imFree, { deviceToken: token("Dev"), groupId: crew.groupId, forMinutes: 120 });
    const again = await t.mutation(api.frolics.imFree, { deviceToken: token("Maya"), groupId: crew.groupId, forMinutes: 120 });
    expect(a.started).toBe(true);
    expect(b).toEqual({ frolicId: a.frolicId, started: false });
    expect(again).toEqual({ frolicId: a.frolicId, started: false });
  });

  test("the starter can pass on their own plan without breaking it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const { frolicId } = await t.mutation(api.frolics.imFree, { deviceToken: token("Maya"), groupId: crew.groupId, forMinutes: 120 });
    await t.mutation(api.taps.tap, { deviceToken: token("Maya"), frolicId, kind: "notToday" });
    const maya = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId, frolicId });
    expect(maya.phase).toBe("open");
    expect(maya.myTap?.kind).toBe("notToday");
  });

  test("starting I'm free never hides a plan that is already on", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await goOn(t, crew, ["Maya", "Dev"]);
    const started = await t.mutation(api.frolics.imFree, { deviceToken: token("Jordan"), groupId: crew.groupId, forMinutes: 120 });
    expect(started).toEqual({ frolicId: crew.frolicId, started: false });
    expect((await today(t, crew, "Maya")).phase).toBe("on");
  });
});

describe("leaving mid frolic", () => {
  test("deleting your account while a match is pending cancels it instead of revealing a party of one", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });
    await flipDue(t);
    expect((await frolicOf(t, crew))?.status).toBe("open");
    expect((await today(t, crew, "Maya")).phase).toBe("waiting");
    expect(await rows(t, "reveals")).toHaveLength(0);
  });

  test("deleting your account while going refills your spot from the hop in pool", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"], { capacity: 2 });
    await goOn(t, crew, ["Maya", "Dev"]);
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe("waiting");
    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });
    const going = (await today(t, crew, "Maya")).reveal?.going.map((p) => p.name).sort();
    expect(going).toEqual(["Jordan", "Maya"]);
  });

  test("deleting your account with a $3 hold placed releases the hold instead of orphaning it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"], { window: { start: NOON + 3 * HOUR, end: NOON + 6 * HOUR } });
    await t.mutation(api.crew.setHold, { deviceToken: token("Maya"), groupId: crew.groupId, enabled: true });
    await goOn(t, crew, ["Maya", "Dev", "Jordan"]);
    await drain(t);
    const shares = await rows(t, "shares");
    expect(shares).toHaveLength(3);
    const devShare = shares.find((s) => s.userId === crew.ids.Dev)!;
    await t.run(async (ctx) => await ctx.db.patch("shares", devShare._id, { status: "held", whopPaymentId: "pay_dev" }));
    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });
    await t.run(async (ctx) => {
      const share = await ctx.db.get("shares", devShare._id);
      expect(share?.status).toBe("held");
    });
    await drain(t);
    const after = await t.run(async (ctx) => await ctx.db.get("shares", devShare._id));
    expect(after).not.toBeNull();
    expect(["releasing", "released", "needsAttention"]).toContain(after!.status);
  });

  test("deleting your account with an unpaid share waives it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await t.mutation(api.crew.setHold, { deviceToken: token("Maya"), groupId: crew.groupId, enabled: true });
    await goOn(t, crew, ["Maya", "Dev", "Jordan"]);
    await drain(t);
    await t.mutation(api.users.deleteAccount, { deviceToken: token("Dev") });
    await drain(t);
    const left = await rows(t, "shares");
    expect(left.filter((s) => s.userId === crew.ids.Dev && s.status === "due")).toHaveLength(0);
  });

  test("rejoining the same crew keeps one membership and one flower", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.users.joinGroup, { deviceToken: token("Dev"), firstName: "Dev", inviteCode: crew.inviteCode });
    const memberships = await t.run(async (ctx) => await ctx.db.query("memberships").collect());
    expect(memberships).toHaveLength(2);
    expect(new Set(memberships.map((m) => m.color)).size).toBe(2);
  });

  test("someone in two crews taps each one separately", async () => {
    const t = makeT();
    const one = await setupCrew(t, ["Maya", "Dev"]);
    const two = await t.mutation(api.users.createGroup, { deviceToken: token("Dev"), firstName: "Dev", groupName: "Climbing" });
    const me = await t.query(api.users.me, { deviceToken: token("Dev") });
    expect(me?.groups.map((g) => g.groupId).sort()).toEqual([one.groupId, two.groupId].sort());
    await tap(t, one, "Dev");
    const solo = await t.query(api.frolics.today, { deviceToken: token("Dev"), groupId: two.groupId });
    expect(solo.phase).toBe("solo");
  });
});

describe("check in and hop in at the wrong time", () => {
  test("checking in without ever tapping is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await goOn(t, crew, ["Maya", "Dev"]);
    const code = await codeOf(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Jordan"), frolicId: crew.frolicId, method: "manual" }),
    );
    expect(code).toBe("NOT_GOING");
  });

  test("checking in twice returns the same check in", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await goOn(t, crew, ["Maya", "Dev"]);
    const a = await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" });
    const b = await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "geofence" });
    expect(a).toBe(b);
  });

  test("checking in to another crew's frolic is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await goOn(t, crew, ["Maya", "Dev"]);
    await t.mutation(api.users.createGroup, { deviceToken: token("Zed"), firstName: "Zed", groupName: "Other" });
    const code = await codeOf(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Zed"), frolicId: crew.frolicId, method: "manual" }),
    );
    expect(code).toBe("NOT_GOING");
  });

  test("arriving after it ended says it wrapped", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await goOn(t, crew, ["Maya", "Dev"]);
    vi.advanceTimersByTime(8 * HOUR);
    await t.finishInProgressScheduledFunctions();
    expect((await frolicOf(t, crew))?.status).toBe("done");
    await expect(
      t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" }),
    ).rejects.toThrow(/wrapped/);
    expect(await codeOf(t.mutation(api.frolics.hopIn, { deviceToken: token("Dev"), frolicId: crew.frolicId }))).toBe("CLOSED");
  });
});

describe("paying in odd orders", () => {
  async function heldCrew(t: T) {
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await t.mutation(api.crew.setHold, { deviceToken: token("Maya"), groupId: crew.groupId, enabled: true });
    await goOn(t, crew, ["Maya", "Dev", "Jordan"]);
    await drain(t);
    return crew;
  }

  test("paying twice starts one charge", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    const share = (await rows(t, "shares")).find((s) => s.userId === crew.ids.Maya)!;
    const first = await t.mutation(internal.whop.money.beginCharge, { token: share.token! });
    const second = await t.mutation(internal.whop.money.beginCharge, { token: share.token! });
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, message: "You're already set for this one." });
  });

  test("paying after your spot was let go says so instead of saying you're set", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    const share = (await rows(t, "shares")).find((s) => s.userId === crew.ids.Dev)!;
    await t.mutation(internal.whop.money.confirmExpired, { shareId: share._id });
    vi.advanceTimersByTime(HOUR);
    await t.mutation(internal.whop.money.confirmExpired, { shareId: share._id });
    const dev = await today(t, crew, "Dev");
    expect(dev.reveal?.me.going).toBe(false);
    const view = await t.query(internal.whop.money.payView, { token: share.token! });
    expect(view.ok).toBe(false);
    expect(view).not.toEqual({ ok: false, message: "You're already set for this one." });
    const begun = await t.mutation(internal.whop.money.beginCharge, { token: share.token! });
    expect(begun.ok).toBe(false);
  });

  test("turning the hold off after the reveal leaves the agreed shares as they were", async () => {
    const t = makeT();
    const crew = await heldCrew(t);
    await t.mutation(api.crew.setHold, { deviceToken: token("Dev"), groupId: crew.groupId, enabled: false });
    expect((await rows(t, "shares")).map((s) => s.status)).toEqual(["due", "due", "due"]);
  });
});

describe("keiki with nobody to talk to", () => {
  test("an unknown phone gets the join prompt from every tool", async () => {
    const t = makeT();
    await setupCrew(t, ["Maya", "Dev"]);
    const phone = "+15550000000";
    const member = await t.query(internal.keiki.tools.getMember, { phone });
    expect(member).toMatchObject({ ok: true, member: false });
    expect(await t.query(internal.keiki.tools.getToday, { phone, now: Date.now() })).toMatchObject({ ok: false, error: "not_in_a_crew" });
    expect(await t.mutation(internal.keiki.tools.tap, { phone, kind: "down", onlyWith: [], now: Date.now() })).toMatchObject({ ok: false, error: "not_in_a_crew" });
    expect(await t.query(internal.keiki.tools.getReveal, { phone, now: Date.now() })).toMatchObject({ ok: false, error: "not_in_a_crew" });
  });
});

describe("keiki with a crew but odd timing", () => {
  async function linked(t: T, names: string[], open = true) {
    const crew = open
      ? await setupCrew(t, names)
      : await (async () => {
          const created = await t.mutation(api.users.createGroup, { deviceToken: token(names[0]), firstName: names[0], groupName: "Crew" });
          const ids: Record<string, Id<"users">> = { [names[0]]: created.userId };
          for (const n of names.slice(1)) {
            ids[n] = (await t.mutation(api.users.joinGroup, { deviceToken: token(n), firstName: n, inviteCode: created.inviteCode })).userId;
          }
          return { ids };
        })();
    await t.run(async (ctx) => {
      for (const [i, n] of names.entries()) {
        await ctx.db.insert("keikiLinks", { phone: `+1510555010${i}`, userId: crew.ids[n], paused: false, linkedAt: Date.now() });
      }
    });
    return crew;
  }

  test("down with no plan yet is a clear no plan answer, and nothing is saved", async () => {
    const t = makeT();
    await linked(t, ["Maya", "Dev"], false);
    const out = await t.mutation(internal.keiki.tools.tap, { phone: "+15105550100", kind: "down", onlyWith: [], now: Date.now() });
    expect(out).toMatchObject({ ok: false, error: "no_plan" });
    expect(await rows(t, "taps")).toHaveLength(0);
  });

  test("asking who else is going before the reveal gets the same answer for everyone", async () => {
    const t = makeT();
    await linked(t, ["Maya", "Dev", "Jordan"]);
    await t.mutation(internal.keiki.tools.tap, { phone: "+15105550100", kind: "down", onlyWith: [], now: Date.now() });
    await t.mutation(internal.keiki.tools.tap, { phone: "+15105550101", kind: "down", onlyWith: [], now: Date.now() });
    const answers = [];
    for (const i of [0, 1, 2]) answers.push(await t.query(internal.keiki.tools.getReveal, { phone: `+1510555010${i}`, now: Date.now() }));
    expect(answers[0]).toEqual(answers[2]);
    expect(answers[1]).toEqual(answers[2]);
    expect(answers[0]).toMatchObject({ state: "not_yet" });
  });

  test("only if a name nobody has saves nothing and asks who they meant", async () => {
    const t = makeT();
    await linked(t, ["Maya", "Dev"]);
    const out = await t.mutation(internal.keiki.tools.tap, { phone: "+15105550100", kind: "down", onlyWith: ["Zed"], now: Date.now() });
    expect(out).toMatchObject({ ok: false, error: "names_unclear" });
    expect(await rows(t, "taps")).toHaveLength(0);
  });

  test("a linked phone whose account was deleted is treated as new", async () => {
    const t = makeT();
    await linked(t, ["Maya", "Dev"]);
    await t.mutation(api.users.deleteAccount, { deviceToken: token("Maya") });
    expect(await t.query(internal.keiki.tools.getMember, { phone: "+15105550100" })).toMatchObject({ member: false });
  });
});

describe("left open", () => {
  test.skip("keiki answers for the crew whose plan is open when you are in two crews (skipped: Keiki resolves one crew per phone, needs a crew picker)", async () => {
    const t = makeT();
    const one = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.users.createGroup, { deviceToken: token("Dev"), firstName: "Dev", groupName: "Climbing" });
    await t.run(async (ctx) => await ctx.db.insert("keikiLinks", { phone: "+15105550199", userId: one.ids.Dev, paused: false, linkedAt: 0 }));
    const out = await t.mutation(internal.keiki.tools.tap, { phone: "+15105550199", kind: "down", onlyWith: [], now: Date.now() });
    expect(out).toMatchObject({ ok: true });
  });

  test("I'm free while the daily drop is open returns the open plan and keeps your daily answer visible", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    const result = await t.mutation(api.frolics.imFree, { deviceToken: token("Dev"), groupId: crew.groupId, forMinutes: 120 });
    expect(result).toEqual({ frolicId: crew.frolicId, started: false });
    expect((await today(t, crew, "Maya")).phase).toBe("waiting");
  });
});

describe("plans that cross midnight", () => {
  test("a late plan matches and reveals across the day boundary", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { window: { start: NOON + 3 * HOUR, end: NOON + 7 * HOUR } });
    await goOn(t, crew, ["Maya", "Dev"]);
    const view = await today(t, crew, "Maya");
    expect(view.phase).toBe("on");
    expect(view.reveal!.endsAt - view.reveal!.startsAt).toBe(HOUR);
    vi.advanceTimersByTime(8 * HOUR);
    await t.finishInProgressScheduledFunctions();
    expect((await today(t, crew, "Maya")).phase).toBe("done");
  });

  test("a crew of two where one passes fades at the deadline and clears every tap", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { deadlineIn: 5000 });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev", { kind: "notToday" });
    await flipDue(t, 6000);
    expect((await today(t, crew, "Maya")).phase).toBe("faded");
    expect(await rows(t, "taps")).toHaveLength(0);
    expect(await codeOf(t.mutation(api.frolics.hopIn, { deviceToken: token("Dev"), frolicId: crew.frolicId }))).toBe("CLOSED");
  });
});

describe("time zones", () => {
  test("a crew in another time zone opens and reveals on its own day", async () => {
    const t = makeT();
    const created = await t.mutation(api.users.createGroup, {
      deviceToken: token("Aiko"),
      firstName: "Aiko",
      groupName: "Tokyo",
      timezone: "Asia/Tokyo",
    });
    await t.mutation(api.users.joinGroup, { deviceToken: token("Ken"), firstName: "Ken", inviteCode: created.inviteCode });
    const now = Date.now();
    const frolicId = await t.mutation(internal.frolics.open, {
      groupId: created.groupId,
      day: "2026-11-16",
      kind: "daily",
      window: { start: now + HOUR, end: now + 5 * HOUR },
      durationMinutes: 60,
      deadline: now + 3 * HOUR,
    });
    for (const n of ["Aiko", "Ken"]) await t.mutation(api.taps.tap, { deviceToken: token(n), frolicId, kind: "down" });
    await flipDue(t);
    const view = await t.query(api.frolics.today, { deviceToken: token("Ken"), groupId: created.groupId, day: "2026-11-16" });
    expect(view.phase).toBe("on");
  });

  test("a bad time zone is a clear error", async () => {
    const t = makeT();
    const code = await codeOf(
      t.mutation(api.users.createGroup, { deviceToken: token("Aiko"), firstName: "Aiko", groupName: "X", timezone: "Mars/Olympus" }),
    );
    expect(code).toBe("BAD_TIMEZONE");
  });
});


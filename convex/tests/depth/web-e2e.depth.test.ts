import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { NOON, flipDue, makeT, setupCrew, token } from "../setup.helpers";

type T = ReturnType<typeof makeT>;
type Crew = Awaited<ReturnType<typeof setupCrew>>;

const DAY = "2026-11-15";
const SITE = "https://frolic.convex.site";
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubEnv("CONVEX_SITE_URL", SITE);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function withPlan(t: T, crew: Crew): Promise<Id<"plans">> {
  const planId = await t.run(async (ctx) => {
    const placeId = await ctx.db.insert("places", {
      slug: `indian-rock-${crypto.randomUUID()}`,
      name: "Indian Rock",
      neighborhood: "Berkeley",
      lat: 37.8925,
      lng: -122.2727,
      cost: 0,
      tags: ["sunset"],
      hours: [],
      indoor: false,
      sober: true,
      photoUrl: "https://images.example/hills_sunset.jpg",
      blurb: "Golden hour 4:28",
      title: "Sunset at Indian Rock",
      address: "Indian Rock Path, Berkeley",
      costPerPersonCents: 0,
      costLabel: "Free",
      payUpFront: false,
      priceVerified: true,
      energy: "chill" as const,
      needsDaylight: true,
      durationMinutes: 120,
      meetSpot: "Top of Indian Rock",
      source: "seed",
    });
    return await ctx.db.insert("plans", {
      groupId: crew.groupId,
      day: DAY,
      kind: "daily" as const,
      placeId,
      title: "Sunset at Indian Rock",
      line: "Clear and 64. Golden hour starts at 4:28",
      why: "you're into sunsets, it's free, and the sky's clear until dark.",
      cost: 0,
      startsAt: NOON + 3 * HOUR,
      durationMinutes: 120,
      meetingPoint: { lat: 37.8925, lng: -122.2727, label: "Top of Indian Rock" },
      source: "model" as const,
      generatedAt: NOON,
      costLabel: "Free",
      payUpFront: false,
      chips: ["Free", "2 hours", "Golden hour 4:28"],
      whySource: "template" as const,
      whyInputs: { placeName: "Indian Rock", topTags: ["sunset"], rainSwap: false },
      weatherSwap: false,
    });
  });
  const frolicId = await t.mutation(internal.frolics.open, {
    groupId: crew.groupId,
    day: DAY,
    kind: "daily",
    planId,
    window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
    durationMinutes: 120,
    deadline: NOON + 4 * HOUR,
  });
  expect(frolicId).toBe(crew.frolicId);
  return planId;
}

async function digest(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function census(t: T) {
  return await t.run(async (ctx) => ({
    groups: await ctx.db.query("groups").take(50),
    users: await ctx.db.query("users").take(50),
    memberships: await ctx.db.query("memberships").take(50),
    invites: await ctx.db.query("invites").take(50),
    plans: await ctx.db.query("plans").take(50),
    availability: await ctx.db.query("availability").take(50),
    frolics: await ctx.db.query("frolics").take(50),
    places: await ctx.db.query("places").take(50),
  }));
}

async function inviteByCode(t: T, code: string) {
  return await t.run(
    async (ctx) => await ctx.db.query("invites").withIndex("by_code", (q) => q.eq("code", code)).unique(),
  );
}

describe("a share link resolves to one frolic", () => {
  test("create mints a frolic invite and the url the page is served at", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await withPlan(t, crew);
    const link = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    expect(link.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(link.url).toBe(`${SITE}/p/${link.code}`);
    const invite = await inviteByCode(t, link.code);
    expect({
      groupId: invite?.groupId,
      frolicId: invite?.frolicId,
      kind: invite?.kind,
      revoked: invite?.revoked,
      createdBy: invite?.createdBy,
    }).toEqual({
      groupId: crew.groupId,
      frolicId: crew.frolicId,
      kind: "frolic",
      revoked: false,
      createdBy: crew.ids.Maya,
    });
  });

  test("two links minted for one frolic both land on that frolic", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await withPlan(t, crew);
    const first = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    const second = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Dev"),
    });
    expect(second.code).not.toBe(first.code);
    const peeked = await t.query(internal.web.share.peek, { code: first.code });
    const other = await t.query(internal.web.share.peek, { code: second.code });
    expect({ group: peeked?.group, phase: peeked?.phase, host: peeked?.host, title: peeked?.card?.title }).toEqual({
      group: "Sunset Crew",
      phase: "open",
      host: "Maya",
      title: "Sunset at Indian Rock",
    });
    expect(other?.card).toEqual(peeked?.card);
    expect(other?.host).toBe("Dev");
    const invites = await t.run(
      async (ctx) =>
        await ctx.db
          .query("invites")
          .withIndex("by_frolicId", (q) => q.eq("frolicId", crew.frolicId))
          .take(10),
    );
    expect(invites.map((row) => row.code).sort()).toEqual([first.code, second.code].sort());
    expect(new Set(invites.map((row) => row.frolicId)).size).toBe(1);
  });

  test("a frolic that is gone cannot be shared", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const orphan = await t.run(async (ctx) => {
      const group = await ctx.db.insert("groups", {
        name: "Ghosts",
        createdBy: crew.ids.Maya,
        timezone: "America/Los_Angeles",
      });
      return await ctx.db.insert("frolics", {
        groupId: group,
        day: DAY,
        kind: "daily" as const,
        status: "open" as const,
        window: { start: NOON, end: NOON + HOUR },
        durationMinutes: 60,
        deadline: NOON + HOUR,
      });
    });
    await t.run(async (ctx) => await ctx.db.delete("frolics", orphan));
    await expect(
      t.mutation(api.web.share.create, { frolicId: orphan, deviceToken: token("Maya") }),
    ).rejects.toThrow(/gone/);
  });
});

describe("what peek shows before anyone joins", () => {
  test("peek carries the card and the crew, and names nobody who tapped", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await withPlan(t, crew);
    const link = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    await t.mutation(api.taps.tap, {
      deviceToken: token("Dev"),
      frolicId: crew.frolicId,
      kind: "down",
    });
    const peeked = await t.query(internal.web.share.peek, { code: link.code });
    expect({
      phase: peeked?.phase,
      host: peeked?.host,
      group: peeked?.group,
      label: peeked?.card?.label,
      no: peeked?.card?.no,
      title: peeked?.card?.title,
      chips: peeked?.card?.chips,
      why: peeked?.card?.why,
    }).toEqual({
      phase: "open",
      host: "Maya",
      group: "Sunset Crew",
      label: "TODAY · SUNDAY",
      no: "Frolic",
      title: "Sunset at Indian Rock",
      chips: ["Free", "2 hours", "Golden hour 4:28"],
      why: "you're into sunsets, it's free, and the sky's clear until dark.",
    });
    expect([
      "https://images.example/hills_sunset.jpg",
      "/p/hero/plan-sunsets.png",
    ]).toContain(peeked?.card?.imageUrl);
    expect(JSON.stringify(peeked)).not.toContain("Dev");
    expect(JSON.stringify(peeked)).not.toContain("Jordan");
  });

  test("peek is null for a code nobody minted and for a revoked one", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    await withPlan(t, crew);
    expect(await t.query(internal.web.share.peek, { code: "nosuchcod" })).toBeNull();
    const link = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    await t.run(async (ctx) => {
      const invite = await ctx.db
        .query("invites")
        .withIndex("by_code", (q) => q.eq("code", link.code))
        .unique();
      await ctx.db.patch(invite!._id, { revoked: true });
    });
    expect(await t.query(internal.web.share.peek, { code: link.code })).toBeNull();
  });
});

describe("joining a frolic from the page", () => {
  test("one device token becomes one identity, one membership and one web yes", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await withPlan(t, crew);
    const link = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    const guest = token("Priya");
    const result = await t.mutation(api.web.share.join, {
      code: link.code,
      deviceToken: guest,
      name: "  Priya  ",
    });
    expect(result).toEqual({ ok: true, phase: "planted" });
    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").take(20),
      memberships: await ctx.db.query("memberships").take(20),
      taps: await ctx.db.query("taps").take(20),
    }));
    expect(state.users.map((row) => row.name).sort()).toEqual(["Dev", "Maya", "Priya"]);
    const priya = state.users.find((row) => row.name === "Priya")!;
    expect(priya.source).toBe("web");
    expect(priya.tokenHash).toBe(await digest(guest));
    const mine = state.memberships.filter((row) => row.userId === priya._id);
    expect(mine).toHaveLength(1);
    expect({ group: mine[0].groupId, via: mine[0].joinedVia, color: mine[0].color }).toEqual({
      group: crew.groupId,
      via: "web",
      color: "moss",
    });
    const taps = state.taps.filter((row) => row.frolicId === crew.frolicId);
    expect(taps).toHaveLength(1);
    expect({ user: taps[0].userId, kind: taps[0].kind, source: taps[0].source, onlyIf: taps[0].onlyIf }).toEqual({
      user: priya._id,
      kind: "down",
      source: "web",
      onlyIf: [],
    });
  });

  test("a second visit from the same phone keeps one identity and one yes", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await withPlan(t, crew);
    const link = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    const guest = token("Priya");
    const first = await t.mutation(api.web.share.join, {
      code: link.code,
      deviceToken: guest,
      name: "Priya",
    });
    const guestHash = await digest(guest);
    const firstUser = await t.run(
      async (ctx) =>
        await ctx.db.query("users").withIndex("by_tokenHash", (q) => q.eq("tokenHash", guestHash)).unique(),
    );
    const second = await t.mutation(api.web.share.join, {
      code: link.code,
      deviceToken: guest,
      name: "Priya",
    });
    expect(second).toEqual(first);
    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").take(20),
      memberships: await ctx.db.query("memberships").take(20),
      taps: await ctx.db.query("taps").take(20),
    }));
    expect(state.users).toHaveLength(3);
    expect(state.memberships).toHaveLength(3);
    expect(state.taps.filter((row) => row.frolicId === crew.frolicId)).toHaveLength(1);
    expect(state.users.find((row) => row.name === "Priya")?._id).toBe(firstUser?._id);
  });

  test("a phone already in the crew joins under its own identity, not a second one", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await withPlan(t, crew);
    const link = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    const joined = await t.mutation(api.web.share.join, {
      code: link.code,
      deviceToken: token("Dev"),
      name: "Devon",
    });
    expect(joined).toEqual({ ok: true, phase: "planted" });
    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").take(20),
      memberships: await ctx.db.query("memberships").take(20),
      taps: await ctx.db.query("taps").take(20),
    }));
    expect(state.users.map((row) => row.name).sort()).toEqual(["Devon", "Maya"]);
    expect(state.users.map((row) => row._id).sort()).toEqual([crew.ids.Dev, crew.ids.Maya].sort());
    expect(state.memberships).toHaveLength(2);
    const taps = state.taps.filter((row) => row.frolicId === crew.frolicId);
    expect(taps).toHaveLength(1);
    expect({ user: taps[0].userId, source: taps[0].source }).toEqual({ user: crew.ids.Dev, source: "web" });
  });

  test("a web yes and an app yes reveal together, and the app learns nothing early", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await withPlan(t, crew);
    const link = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    await t.mutation(api.web.share.join, { code: link.code, deviceToken: token("Priya"), name: "Priya" });
    await t.mutation(api.taps.tap, { deviceToken: token("Dev"), frolicId: crew.frolicId, kind: "down" });

    const early = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Jordan") });
    expect({ phase: early.phase, mates: early.mates, revealAt: early.revealAt }).toEqual({
      phase: "open",
      mates: [],
      revealAt: null,
    });
    const primed = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect({ phase: primed.phase, me: primed.me, mates: primed.mates, revealAt: primed.revealAt }).toEqual({
      phase: "planted",
      me: "Priya",
      mates: [],
      revealAt: null,
    });

    await flipDue(t);

    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));
    expect(frolic?.status).toBe("on");
    if (!frolic) throw new Error("the frolic is missing");
    expect(frolic.revealAt! - frolic.matchedAt!).toBe(1500);
    expect(frolic.bloomAt).toBe(frolic.revealAt! + 800);
    const guest = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect({
      phase: guest.phase,
      me: guest.me,
      mates: guest.mates,
      meet: guest.meet,
      time: guest.time,
    }).toEqual({
      phase: "on",
      me: "Priya",
      mates: ["Dev"],
      meet: "Top of Indian Rock",
      time: "3:00 pm",
    });
    expect(guest.revealAt).toBe(frolic.revealAt);
    expect(guest.card?.title).toBe("Sunset at Indian Rock");
    const app = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Dev") });
    expect({ phase: app.phase, me: app.me, mates: app.mates }).toEqual({
      phase: "on",
      me: "Dev",
      mates: ["Priya"],
    });
    const onlooker = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Jordan") });
    expect({ phase: onlooker.phase, me: onlooker.me, mates: [...onlooker.mates].sort() }).toEqual({
      phase: "on",
      me: null,
      mates: ["Dev", "Priya"],
    });
  });

  test("a guest who never joined gets the card and no guest list", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await withPlan(t, crew);
    const link = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    await t.mutation(api.web.share.join, { code: link.code, deviceToken: token("Priya"), name: "Priya" });
    await t.mutation(api.taps.tap, { deviceToken: token("Dev"), frolicId: crew.frolicId, kind: "down" });
    await flipDue(t);
    const outsider = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Sam") });
    expect({
      phase: outsider.phase,
      me: outsider.me,
      mates: outsider.mates,
      revealAt: outsider.revealAt,
      title: outsider.card?.title,
    }).toEqual({
      phase: "open",
      me: null,
      mates: [],
      revealAt: null,
      title: "Sunset at Indian Rock",
    });
    expect(JSON.stringify(outsider)).not.toContain("Dev");
    expect(JSON.stringify(outsider)).not.toContain("Priya");
  });
});

describe("the dev scene seed", () => {
  test("seed builds a crew and a frolic the share page renders", async () => {
    const t = makeT();
    const seeded = await t.mutation(internal.web.devSeed.seed, {});
    const invite = await inviteByCode(t, seeded.inviteCode);
    expect({ frolic: invite?.frolicId, kind: invite?.kind, group: invite?.groupId }).toEqual({
      frolic: seeded.frolicId,
      kind: "frolic",
      group: invite?.groupId,
    });
    const peeked = await t.query(internal.web.share.peek, { code: seeded.inviteCode });
    expect({
      phase: peeked?.phase,
      host: peeked?.host,
      group: peeked?.group,
      title: peeked?.card?.title,
      chips: peeked?.card?.chips,
    }).toEqual({
      phase: "open",
      host: "Ari",
      group: "Roommates",
      title: "Sunset at Indian Rock",
      chips: ["Free", "2 hours", "Golden hour 4:28"],
    });
    const view = await t.query(api.web.share.watch, {
      code: seeded.inviteCode,
      deviceToken: token("Guest"),
    });
    expect({
      phase: view.phase,
      host: view.host,
      group: view.group,
      me: view.me,
      mates: view.mates,
      revealAt: view.revealAt,
      meet: view.meet,
      time: view.time,
    }).toEqual({
      phase: "open",
      host: "Ari",
      group: "Roommates",
      me: null,
      mates: [],
      revealAt: null,
      meet: "Top of Indian Rock",
      time: "3:00 pm",
    });
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", seeded.frolicId as Id<"frolics">));
    expect({ status: frolic?.status, kind: frolic?.kind, day: frolic?.day, deadline: frolic?.deadline }).toEqual({
      status: "open",
      kind: "solo",
      day: DAY,
      deadline: NOON + 6 * HOUR,
    });
  });

  test("seed builds a fresh scene per call, and every seed host shares one placeholder hash", async () => {
    const t = makeT();
    const first = await t.mutation(internal.web.devSeed.seed, {});
    const second = await t.mutation(internal.web.devSeed.seed, {});
    expect(second.frolicId).not.toBe(first.frolicId);
    expect(second.inviteCode).not.toBe(first.inviteCode);
    const state = await census(t);
    expect({
      hosts: state.users.filter((row) => row.name === "Ari").length,
      groups: state.groups.map((row) => row.name),
      frolics: state.frolics.length,
      invites: state.invites.length,
    }).toEqual({ hosts: 2, groups: ["Roommates", "Roommates"], frolics: 2, invites: 2 });
    expect(new Set(state.users.map((row) => row.tokenHash)).size).toBe(1);
  });

  test("frolicInvite mints another live link to the same frolic", async () => {
    const t = makeT();
    const seeded = await t.mutation(internal.web.devSeed.seed, {});
    const code = await t.mutation(internal.web.devSeed.frolicInvite, {
      frolicId: seeded.frolicId as Id<"frolics">,
    });
    expect(code).toMatch(/^[A-Z0-9]{8,}$/);
    expect(code).not.toBe(seeded.inviteCode);
    const invite = await inviteByCode(t, code);
    expect({ frolic: invite?.frolicId, kind: invite?.kind, revoked: invite?.revoked }).toEqual({
      frolic: seeded.frolicId,
      kind: "frolic",
      revoked: false,
    });
    const host = await t.run(async (ctx) => await ctx.db.get("users", invite!.createdBy));
    expect(host?.name).toBe("Ari");
    const view = await t.query(api.web.share.watch, { code, deviceToken: token("Guest") });
    expect({ phase: view.phase, host: view.host, title: view.card?.title }).toEqual({
      phase: "open",
      host: "Ari",
      title: "Sunset at Indian Rock",
    });
    expect((await t.query(internal.web.share.peek, { code: seeded.inviteCode }))?.card?.title).toBe(
      "Sunset at Indian Rock",
    );
  });

  test("who reports the scene before a match and the reveal after one", async () => {
    const t = makeT();
    const seeded = await t.mutation(internal.web.devSeed.seed, {});
    expect(await t.query(internal.web.devSeed.who, {})).toEqual({
      frolics: [{ id: seeded.frolicId, status: "open", revealAt: null }],
      reveals: 0,
      attendees: 0,
    });
    const invite = await inviteByCode(t, seeded.inviteCode);
    await t.mutation(api.web.share.join, { code: seeded.inviteCode, deviceToken: token("Priya"), name: "Priya" });
    await t.mutation(internal.taps.tapAs, {
      userId: invite!.createdBy,
      frolicId: seeded.frolicId as Id<"frolics">,
      kind: "down",
      source: "app",
    });
    expect(await t.query(internal.web.devSeed.who, {})).toEqual({
      frolics: [{ id: seeded.frolicId, status: "open", revealAt: null }],
      reveals: 1,
      attendees: 0,
    });
    await flipDue(t);
    const flipped = await t.run(async (ctx) => await ctx.db.get("frolics", seeded.frolicId as Id<"frolics">));
    expect(flipped?.revealAt).toBeGreaterThanOrEqual(NOON + 1500);
    expect(await t.query(internal.web.devSeed.who, {})).toEqual({
      frolics: [{ id: seeded.frolicId, status: "on", revealAt: flipped?.revealAt }],
      reveals: 0,
      attendees: 2,
    });
  });

  test("a drifted scene says so to the page and refuses a web yes, and a done one expires", async () => {
    const t = makeT();
    const drifted = await t.mutation(internal.web.devSeed.seed, { mode: "drifted" });
    const driftedView = await t.query(api.web.share.watch, {
      code: drifted.inviteCode,
      deviceToken: token("Guest"),
    });
    expect(driftedView.phase).toBe("drifted");
    const refused = await t.mutation(api.web.share.join, {
      code: drifted.inviteCode,
      deviceToken: token("Late"),
      name: "Late",
    });
    expect(refused).toEqual({ ok: false, phase: "drifted" });

    const done = await t.mutation(internal.web.devSeed.seed, { mode: "done" });
    const doneView = await t.query(api.web.share.watch, {
      code: done.inviteCode,
      deviceToken: token("Guest"),
    });
    expect(doneView.phase).toBe("expired");
    const frolic = await t.run(async (ctx) => await ctx.db.get("frolics", done.frolicId as Id<"frolics">));
    expect(frolic?.status).toBe("done");
  });
});

describe("the e2e admin surface", () => {
  test("reset clears one run's rows and leaves the other run standing", async () => {
    const t = makeT();
    const alpha = await t.mutation(internal.e2e.admin.seed, { run: "alpha" });
    const beta = await t.mutation(internal.e2e.admin.seed, { run: "beta" });
    const both = await census(t);
    expect(both.groups.map((row) => row.e2eRun).sort()).toEqual(["alpha", "beta"]);

    expect(await t.mutation(internal.e2e.admin.reset, { run: "alpha" })).toEqual({ cleared: 13 });

    const left = await census(t);
    expect({
      runs: left.groups.map((row) => row.e2eRun),
      users: left.users.length,
      memberships: left.memberships.length,
      invites: left.invites.length,
      plans: left.plans.length,
      availability: left.availability.length,
      frolics: left.frolics.map((row) => row._id),
    }).toEqual({
      runs: ["beta"],
      users: 4,
      memberships: 4,
      invites: 1,
      plans: 1,
      availability: 1,
      frolics: [beta.frolicId],
    });
    expect(await t.run(async (ctx) => await ctx.db.get("groups", alpha.groupId))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get("frolics", alpha.frolicId))).toBeNull();
    expect((await t.query(api.users.me, { deviceToken: alpha.users.maya.deviceToken }))).toBeNull();
    expect((await t.query(api.users.me, { deviceToken: beta.users.maya.deviceToken }))?.name).toBe("Maya");
    expect(await t.mutation(internal.e2e.admin.reset, { run: "alpha" })).toEqual({ cleared: 0 });
  });

  test("seed is idempotent for one run name", async () => {
    const t = makeT();
    const first = await t.mutation(internal.e2e.admin.seed, { run: "run-1" });
    const second = await t.mutation(internal.e2e.admin.seed, { run: "run-1" });
    expect(second.groupId).not.toBe(first.groupId);
    expect(second.frolicId).not.toBe(first.frolicId);
    const state = await census(t);
    expect({
      runs: state.groups.map((row) => row.e2eRun),
      users: state.users.map((row) => row.name).sort(),
      memberships: state.memberships.length,
      invites: state.invites.map((row) => row.code),
      plans: state.plans.length,
      availability: state.availability.length,
      frolics: state.frolics.map((row) => row._id),
      places: state.places.map((row) => row.slug),
    }).toEqual({
      runs: ["run-1"],
      users: ["Dev", "Jordan", "Maya", "Priya"],
      memberships: 4,
      invites: [second.inviteCode],
      plans: 1,
      availability: 1,
      frolics: [second.frolicId],
      places: ["indian-rock"],
    });
    expect(await t.run(async (ctx) => await ctx.db.get("groups", first.groupId))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get("frolics", first.frolicId))).toBeNull();
  });

  test("seed with the demo scenario then advance walks the crew to the kayaks", async () => {
    const t = makeT();
    const body = await t.mutation(internal.e2e.admin.seed, { run: "run-1", scenario: "demo" });
    expect({ run: body.run, deadline: body.deadline, reveal_at: body.reveal_at }).toEqual({
      run: "run-1",
      deadline: NOON + 3 * HOUR,
      reveal_at: null,
    });
    const tonight = await t.query(api.frolics.today, {
      deviceToken: body.users.maya.deviceToken,
      groupId: body.groupId,
    });
    expect({ phase: tonight.phase, id: tonight.frolic?.frolicId, title: tonight.frolic?.plan?.title }).toEqual({
      phase: "open",
      id: body.frolicId,
      title: "Sunset at Indian Rock",
    });

    const advanced = await t.mutation(internal.e2e.admin.advance, { run: "run-1" });
    expect(advanced).not.toBeNull();
    expect(advanced).not.toBe(body.frolicId);
    if (!advanced) throw new Error("advance returned no frolic");
    const next = await t.query(api.frolics.today, {
      deviceToken: body.users.maya.deviceToken,
      groupId: body.groupId,
    });
    expect({
      title: next.frolic?.plan?.title,
      cost: next.frolic?.plan?.cost,
      payUpFront: next.frolic?.plan?.payUpFront,
      duration: next.frolic?.durationMinutes,
      day: next.frolic?.day,
    }).toEqual({
      title: "Kayaks at the Marina",
      cost: 8,
      payUpFront: true,
      duration: 90,
      day: "2026-11-16",
    });

    for (const who of ["dev", "priya"] as const) {
      await t.mutation(api.taps.tap, { deviceToken: body.users[who].deviceToken, frolicId: advanced, kind: "down" });
    }
    expect(await t.query(internal.e2e.admin.revealLog, { run: "run-1" })).toEqual([]);
    await flipDue(t);
    const kayak = await t.run(async (ctx) => await ctx.db.get("frolics", advanced));
    expect(kayak?.status).toBe("on");
    if (!kayak) throw new Error("the kayak frolic is missing");
    expect(kayak.revealAt! - kayak.matchedAt!).toBe(1500);
    const log = (await t.query(internal.e2e.admin.revealLog, { run: "run-1" })).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    );
    expect(log.map((row) => ({ name: row.name, user: row.userId, frolic: row.frolicId }))).toEqual([
      { name: "Dev", user: body.users.dev.userId, frolic: advanced },
      { name: "Priya", user: body.users.priya.userId, frolic: advanced },
    ]);
    expect(log.map((row) => row.reveal_at)).toEqual([kayak.revealAt, kayak.revealAt]);
    expect(log.map((row) => row.bloom_at)).toEqual([kayak.revealAt! + 800, kayak.revealAt! + 800]);
    for (const row of log) {
      expect(row.delivered_at).toBeGreaterThanOrEqual(row.reveal_at);
      expect(row.delivered_at).toBeLessThanOrEqual(row.reveal_at + 1000);
    }
    const rock = await t.query(api.frolics.today, {
      deviceToken: body.users.jordan.deviceToken,
      groupId: body.groupId,
      frolicId: body.frolicId,
    });
    expect({ phase: rock.phase, reveal: rock.reveal }).toEqual({ phase: "open", reveal: null });
    expect(await t.mutation(internal.e2e.admin.advance, { run: "run-1" })).toBe(advanced);
  });

  test("advance needs the demo scene and revealLog needs the run", async () => {
    const t = makeT();
    await t.mutation(internal.e2e.admin.seed, { run: "plain" });
    expect(await t.mutation(internal.e2e.admin.advance, { run: "plain" })).toBeNull();
    expect(await t.mutation(internal.e2e.admin.advance, { run: "never-seeded" })).toBeNull();
    expect(await t.query(internal.e2e.admin.revealLog, { run: "never-seeded" })).toEqual([]);
    expect(await t.mutation(internal.e2e.admin.reset, { run: "never-seeded" })).toEqual({ cleared: 0 });
  });
});

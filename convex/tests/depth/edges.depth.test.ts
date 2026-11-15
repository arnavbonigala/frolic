/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token, type T } from "../setup.helpers";

const DAY = "2026-11-15";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function planFor(t: T, groupId: Id<"groups">, title: string, neighborhood?: string): Promise<Id<"plans">> {
  return await t.run(async (ctx) => {
    const placeId = await ctx.db.insert("places", {
      slug: `spot-${title.toLowerCase()}`,
      name: title,
      neighborhood,
      lat: 37.87,
      lng: -122.25,
      cost: 0,
      tags: ["sunset"],
      hours: [{ day: 6, open: 0, close: 1440 }],
      indoor: false,
      sober: true,
      title,
      address: "1 Grizzly Peak Blvd",
      costPerPersonCents: 0,
      costLabel: "free",
      payUpFront: false,
      priceVerified: true,
      energy: "chill",
      needsDaylight: true,
      durationMinutes: 60,
      meetSpot: "The gate",
      source: "seed",
    });
    return await ctx.db.insert("plans", {
      groupId,
      day: DAY,
      kind: "daily",
      placeId,
      title,
      line: "Catch the last light",
      cost: 0,
      startsAt: NOON + 2 * HOUR,
      sunsetAt: NOON + 5 * HOUR,
      durationMinutes: 60,
      source: "scorer",
      generatedAt: NOON,
      costLabel: "free",
      payUpFront: false,
      chips: ["sunset"],
      whySource: "template",
      whyInputs: { placeName: title, topTags: ["sunset"], rainSwap: false },
      weatherSwap: false,
    });
  });
}

describe("frolic open", () => {
  test("reopening an open frolic with a new plan swaps the plan in", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const first = await planFor(t, crew.groupId, "Indian Rock");
    const second = await planFor(t, crew.groupId, "Cheese Board");

    const frolicId = await t.mutation(internal.frolics.open, {
      groupId: crew.groupId,
      day: DAY,
      kind: "weekend",
      planId: first,
      window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
      durationMinutes: 60,
      deadline: NOON + 4 * HOUR,
    });
    const reopened = await t.mutation(internal.frolics.open, {
      groupId: crew.groupId,
      day: DAY,
      kind: "weekend",
      planId: second,
      window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
      durationMinutes: 60,
      deadline: NOON + 4 * HOUR,
    });
    expect(reopened).toBe(frolicId);
    expect((await t.run(async (ctx) => await ctx.db.get("frolics", frolicId)))?.planId).toBe(second);

    const view = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(view.frolic?.plan?.title).toBe("Cheese Board");
    expect(view.frolic?.plan?.place?.name).toBe("Cheese Board");
    expect(view.frolic?.plan?.place?.neighborhood).toBeNull();
  });

  test("an open frolic keeps its plan when the reopen names none", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const plan = await planFor(t, crew.groupId, "Indian Rock");
    const args = {
      groupId: crew.groupId,
      day: DAY,
      kind: "daily" as const,
      window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
      durationMinutes: 60,
      deadline: NOON + 4 * HOUR,
    };
    const frolicId = await t.mutation(internal.frolics.open, { ...args, planId: plan });
    await t.mutation(internal.frolics.open, args);
    expect((await t.run(async (ctx) => await ctx.db.get("frolics", frolicId)))?.planId).toBe(plan);
  });

  test("today picks the newest frolic of the day it is given", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const todayView = await t.query(api.frolics.today, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      day: "2026-11-15",
    });
    expect(todayView.frolic?.frolicId).toBe(crew.frolicId);
    const tomorrow = await t.query(api.frolics.today, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      day: "2026-11-16",
    });
    expect(tomorrow.frolic).toBeNull();
    expect(tomorrow.phase).toBe("none");
  });
});

describe("a sitting member says not today after the reveal", () => {
  test("a going member who taps not today after the reveal sits out through the late tap path", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe("going");

    await tap(t, crew, "Dev", { kind: "notToday" });
    const view = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(view.reveal?.going.map((p) => p.name).sort()).toEqual(["Jordan", "Maya"]);
    expect(view.reveal?.going.find((p) => p.name === "Jordan")?.role).toBe("hopIn");
  });
});

describe("hop in pool bookkeeping", () => {
  test("asking to hop in twice while the room is full leaves one waiting row", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"], { capacity: 2 });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe(
      "waiting",
    );
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe(
      "waiting",
    );
    const hop = await t.run(async (ctx) => await ctx.db.query("hopIns").collect());
    expect(hop).toHaveLength(1);
    expect(hop[0].status).toBe("waiting");
  });

  test("someone waiting who bails leaves the pool", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"], { capacity: 2 });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId });
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Jordan"), frolicId: crew.frolicId });
    const hop = await t.run(async (ctx) => await ctx.db.query("hopIns").collect());
    expect(hop.map((h) => h.status)).toEqual(["left"]);
    expect((await t.query(api.frolics.today, { deviceToken: token("Jordan"), groupId: crew.groupId })).reveal?.me).toMatchObject(
      { going: false, hopInWaiting: false, canHopIn: false },
    );

    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe("going");
    const after = await t.run(async (ctx) => await ctx.db.query("hopIns").collect());
    expect(after.map((h) => h.status)).toEqual(["joined"]);
  });

  test("today reads a frolic by its id and still hides it from another crew", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const view = await t.query(api.frolics.today, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      frolicId: crew.frolicId,
    });
    expect(view.frolic?.frolicId).toBe(crew.frolicId);
    expect(view.memberCount).toBe(2);
  });

  test("a frolic whose plan was deleted still reveals without a place", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const plan = await planFor(t, crew.groupId, "Indian Rock");
    await t.mutation(internal.frolics.open, {
      groupId: crew.groupId,
      day: DAY,
      kind: "daily",
      planId: plan,
      window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
      durationMinutes: 60,
      deadline: NOON + 4 * HOUR,
    });
    await t.run(async (ctx) => await ctx.db.delete("plans", plan));
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    const view = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(view.phase).toBe("on");
    expect(view.frolic?.plan).toBeNull();
  });
});

describe("missing rows never break a read", () => {
  test("a membership whose person is gone is skipped by the crew read and the invite preview", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.run(async (ctx) => await ctx.db.delete("users", crew.ids.Dev));

    const view = await t.query(api.crew.crew, { deviceToken: token("Maya"), groupId: crew.groupId, day: DAY });
    expect(view.members.map((m) => m.name)).toEqual(["Maya"]);
    const preview = await t.query(api.users.invitePreview, { inviteCode: crew.inviteCode });
    expect(preview?.members.map((m) => m.name)).toEqual(["Maya"]);
    expect(preview?.memberCount).toBe(2);
  });

  test("a membership whose crew is gone is skipped by me", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const second = await t.mutation(api.users.createGroup, {
      deviceToken: token("Maya"),
      firstName: "Maya",
      groupName: "Second",
    });
    await t.run(async (ctx) => await ctx.db.delete("groups", second.groupId));
    const me = await t.query(api.users.me, { deviceToken: token("Maya") });
    expect(me?.groups.map((g) => g.name)).toEqual(["Sunset Crew"]);
    expect(me?.groups[0].groupId).toBe(crew.groupId);
  });

  test("only if survives a person whose user row is gone but whose membership is not", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await t.run(async (ctx) => await ctx.db.delete("users", crew.ids.Dev));
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    const taps = await t.run(async (ctx) => await ctx.db.query("taps").collect());
    expect(taps).toHaveLength(1);
    expect(taps[0].onlyIf).toEqual([crew.ids.Dev]);
  });

  test("today drops a person whose user row is gone from only if", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    await t.run(async (ctx) => await ctx.db.delete("users", crew.ids.Dev));
    const view = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(view.myTap?.onlyIf).toEqual([]);
    expect(view.myTap?.kind).toBe("down");
  });

  test("an only if person with a photo reads with a photo url", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const photo = await t.run(async (ctx) => await ctx.storage.store(new Blob(["face"])));
    await t.mutation(api.users.updateProfile, { deviceToken: token("Dev"), photoId: photo });
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    const view = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(view.myTap?.onlyIf).toHaveLength(1);
    expect(view.myTap?.onlyIf[0].photoUrl).toEqual(expect.any(String));
    expect(view.myTap?.onlyIf[0].name).toBe("Dev");
  });

  test("a crew of one sees the solo phase even with a frolic open", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const view = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(view.phase).toBe("solo");
    expect(view.frolic?.frolicId).toBe(crew.frolicId);
    expect(view.myTap).toBeNull();
  });

  test("a plan carries its place neighborhood through to today", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const plan = await planFor(t, crew.groupId, "Indian Rock", "Berkeley Hills");
    await t.mutation(internal.frolics.open, {
      groupId: crew.groupId,
      day: DAY,
      kind: "daily",
      planId: plan,
      window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
      durationMinutes: 60,
      deadline: NOON + 4 * HOUR,
    });
    const view = await t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(view.frolic?.plan?.place?.neighborhood).toBe("Berkeley Hills");
    expect(view.frolic?.plan?.place?.name).toBe("Indian Rock");
    expect(view.frolic?.plan?.sunsetAt).toBe(NOON + 5 * HOUR);
  });
});

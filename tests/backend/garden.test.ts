/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { NOON, flipDue, makeT, setupCrew, tap, token, type T, type Crew } from "./setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubEnv("CONVEX_SITE_URL", "https://frolic.convex.site");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function finish(t: T, crew: Crew) {
  await t.mutation(internal.reveal.complete, { frolicId: crew.frolicId });
}

async function snap(t: T, crew: Crew, name: string) {
  const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x01])])));
  await t.run(async (ctx) =>
    ctx.db.insert("snaps", {
      frolicId: crew.frolicId,
      groupId: crew.groupId,
      userId: crew.ids[name],
      storageId,
      snapAt: NOON,
      takenAt: NOON,
    }),
  );
}

describe("garden overview", () => {
  test("a member sees the crew's finished frolics, a stranger is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await finish(t, crew);
    const view = await t.query(api.garden.overview, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(view.count).toBe(1);
    expect(view.youWent).toBe(true);
    expect(view.sinceLine).toBe("0 before you, 1 with you");
    expect(view.memories).toHaveLength(1);
    expect(view.memories[0].youWent).toBe(true);
    expect(view.memories[0].going.map((p) => p.name).sort()).toEqual(["Dev", "Maya"]);
    expect(view.memories[0].heroKey).toBeNull();
    expect(view.memories[0].photoUrl).toBeNull();
    expect(view.weekLine.length).toBeGreaterThan(0);

    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(
      t.query(api.garden.overview, { deviceToken: token("Eve"), groupId: crew.groupId }),
    ).rejects.toThrow(/not in this crew/);
  });

  test("a frolic nobody joined never appears, and a live one does", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await tap(t, crew, "Jordan", { kind: "notToday" });
    await flipDue(t);
    const live = await t.query(api.garden.overview, { deviceToken: token("Jordan"), groupId: crew.groupId });
    expect(live.count).toBe(1);
    expect(live.memories).toHaveLength(1);
    expect(live.youWent).toBe(false);
    expect(live.sinceLine).toBe("all before you joined");

    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    const empty = await t.query(api.garden.overview, { deviceToken: token("Jordan"), groupId: crew.groupId });
    expect(empty.count).toBe(0);
    expect(empty.memories).toEqual([]);
  });

  test("photos stay hidden from a member until they add one", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await snap(t, crew, "Maya");

    const before = await t.query(api.garden.memory, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(before.photos).toEqual([]);
    expect((await t.query(api.garden.overview, { deviceToken: token("Dev"), groupId: crew.groupId })).memories[0].photoUrl).toBeNull();

    await snap(t, crew, "Dev");
    const after = await t.query(api.garden.memory, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(after.photos).toHaveLength(2);
    expect(after.photos.every((photo) => photo.url.startsWith("http"))).toBe(true);
    expect(after.photos[0].caption?.length ?? 0).toBeGreaterThan(0);

    await finish(t, crew);
    const jordan = await t.query(api.garden.memory, { deviceToken: token("Jordan"), frolicId: crew.frolicId });
    expect(jordan.photos).toHaveLength(2);
  });

  test("a memory carries the place, its hero key and the fund line", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await t.run(async (ctx) =>
      ctx.db.insert("fundLedger", {
        groupId: crew.groupId,
        frolicId: crew.frolicId,
        entry: "payout",
        amountCents: 800,
        at: NOON,
      }),
    );
    const memory = await t.query(api.garden.memory, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    expect(memory.fundLine).toBe("The Frolic Fund covered $8 of this one.");
    expect(memory.place).toBeNull();
    expect(memory.caption?.length ?? 0).toBeGreaterThan(0);
    const overview = await t.query(api.garden.overview, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(overview.fund?.line).toBe("The Frolic Fund covered $8 of this one.");
    expect(overview.fund?.frolicTitle.length ?? 0).toBeGreaterThan(0);
  });

  test("a memory of a seeded place carries its painted hero", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.run(async (ctx) => {
      const placeId = await ctx.db.insert("places", {
        slug: "indian-rock",
        name: "Indian Rock Park",
        lat: 37.8925,
        lng: -122.2726,
        cost: 0,
        tags: ["sunset"],
        hours: [],
        indoor: false,
        sober: true,
        title: "Sunset at Indian Rock",
        address: "Indian Rock Path",
        costPerPersonCents: 0,
        costLabel: "Free",
        payUpFront: false,
        priceVerified: true,
        energy: "chill",
        needsDaylight: true,
        durationMinutes: 60,
        meetSpot: "Indian Rock Path",
        source: "test",
      });
      const planId = await ctx.db.insert("plans", {
        groupId: crew.groupId,
        day: "2026-11-15",
        kind: "daily",
        placeId,
        title: "Sunset at Indian Rock",
        line: "Golden hour on the rocks.",
        cost: 0,
        startsAt: Date.now() + 2 * 60 * 60 * 1000,
        durationMinutes: 60,
        source: "fallback",
        generatedAt: Date.now(),
        costLabel: "Free",
        payUpFront: false,
        chips: ["Free"],
        whySource: "template",
        whyInputs: { placeName: "Indian Rock Park", topTags: ["sunset"], rainSwap: false },
        weatherSwap: false,
      });
      await ctx.db.patch("frolics", crew.frolicId, { planId });
    });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    const memory = await t.query(api.garden.memory, { deviceToken: token("Maya"), frolicId: crew.frolicId });
    expect(memory.heroKey).toBe("plan-sunsets");
    expect(memory.place?.name).toBe("Indian Rock Park");
    expect(memory.title).toBe("Sunset at Indian Rock");
  });

  test("a person sets their own photo and caption on a memory", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await t.mutation(internal.reveal.complete, { frolicId: crew.frolicId });
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x02])])),
    );
    await t.mutation(api.garden.setMine, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      storageId,
      caption: "the sky did the rest",
    });
    const memory = await t.query(api.garden.memory, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(memory.photos).toHaveLength(1);
    expect(memory.photos[0].caption).toBe("the sky did the rest");

    await t.mutation(api.garden.setMine, {
      deviceToken: token("Maya"),
      frolicId: crew.frolicId,
      caption: "same rock, better light",
    });
    const again = await t.query(api.garden.memory, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(again.photos).toHaveLength(1);
    expect(again.photos[0].caption).toBe("same rock, better light");
  });

  test("setMine refuses someone who was not going, a stranger, and bad copy", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await expect(
      t.mutation(api.garden.setMine, { deviceToken: token("Jordan"), frolicId: crew.frolicId, caption: "hi" }),
    ).rejects.toThrow(/people who went/);
    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(
      t.mutation(api.garden.setMine, { deviceToken: token("Eve"), frolicId: crew.frolicId, caption: "hi" }),
    ).rejects.toThrow(/not in this crew/);
    await expect(
      t.mutation(api.garden.setMine, { deviceToken: token("Maya"), frolicId: crew.frolicId, caption: "so fun!" }),
    ).rejects.toThrow(/Captions/);
    await expect(
      t.mutation(api.garden.setMine, { deviceToken: token("Maya"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/Add a photo/);
  });

  test("a frolic that never happened is not a memory", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.run(async (ctx) => ctx.db.patch("frolics", crew.frolicId, { status: "faded" }));
    await expect(
      t.query(api.garden.memory, { deviceToken: token("Maya"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/did not happen/);
  });
});

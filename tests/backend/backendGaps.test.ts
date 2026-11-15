import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { seedCrew } from "../../keiki/test/seed";
import { makeT as makeCrewT, patchFrolic } from "../../keiki/test/harness";
import { NOON, charge, crew, installWhop, makeT as makeWhopT, newWorld, revealed, setEnv, shareOf, shares } from "../qa/whop/harness";
import type { WhopWorld } from "../qa/whop/harness";

describe("plans.drop.openFrolic", () => {
  it("finds the open frolic for a group and day", async () => {
    const t = makeCrewT();
    const seed = await seedCrew(t);
    expect(await t.query(internal.plans.drop.openFrolic, { groupId: seed.groupId, day: seed.day })).toBe(seed.frolicId);
  });

  it("returns nothing for another day or a closed frolic", async () => {
    const t = makeCrewT();
    const seed = await seedCrew(t);
    expect(await t.query(internal.plans.drop.openFrolic, { groupId: seed.groupId, day: "2026-12-24" })).toBeNull();
    await patchFrolic(t, seed.frolicId, { status: "faded" });
    expect(await t.query(internal.plans.drop.openFrolic, { groupId: seed.groupId, day: seed.day })).toBeNull();
  });

  it("returns nothing for a group with no frolic that day", async () => {
    const t = makeCrewT();
    const seed = await seedCrew(t);
    const other = await t.run(async (ctx) => ctx.db.insert("groups", { name: "Other Crew", createdBy: seed.mayaId, timezone: "America/Los_Angeles" }));
    expect(await t.query(internal.plans.drop.openFrolic, { groupId: other, day: seed.day })).toBeNull();
  });
});

describe("web.devSeed.users", () => {
  it("lists every seeded person with the source they came in from", async () => {
    const t = makeCrewT();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { name: "Maya Chen", source: "app" });
      await ctx.db.insert("users", { name: "Sam Rivera", source: "imessage" });
    });
    expect(await t.query(internal.web.devSeed.users, {})).toEqual([
      { name: "Maya Chen", source: "app" },
      { name: "Sam Rivera", source: "imessage" },
    ]);
  });

  it("returns an empty list before anyone is seeded", async () => {
    const t = makeCrewT();
    expect(await t.query(internal.web.devSeed.users, {})).toEqual([]);
  });
});

describe("whop.actions.adoptLost", () => {
  let world: WhopWorld;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
    setEnv();
    world = newWorld();
    installWhop(world);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("adopts a payment whose webhook never arrived", async () => {
    const t = makeWhopT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = "pay_lost_1";
    world.payments.set(paymentId, { status: "authorized", substatus: "requires_capture", metadata: { shareId: share._id } });

    await t.action(internal.whop.actions.adoptLost, { shareId: share._id, productId: "prod_test", since: NOON - 60_000 });

    const after = await shareOf(t, c.frolicId, share.userId);
    expect(after.status).toBe("held");
    expect(after.whopPaymentId).toBe(paymentId);
  });

  it("changes nothing when the carrier has no payment for the share", async () => {
    const t = makeWhopT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];

    await t.action(internal.whop.actions.adoptLost, { shareId: share._id, productId: "prod_test", since: NOON - 60_000 });

    const after = await shareOf(t, c.frolicId, share.userId);
    expect(after.status).toBe(share.status);
    expect(after.whopPaymentId).toBeUndefined();
  });

  it("stays quiet when the carrier payment list is unreachable", async () => {
    const t = makeWhopT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    await charge(t, share._id, world);
    await t.run(async (ctx) => ctx.db.patch("shares", share._id, { status: "pending" }));
    world.fail.list = true;

    await t.action(internal.whop.actions.adoptLost, { shareId: share._id, productId: "prod_test", since: NOON - 60_000 });

    expect((await shareOf(t, c.frolicId, share.userId)).status).toBe("pending");
  });
});

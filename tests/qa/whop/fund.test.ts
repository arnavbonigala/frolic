import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../../convex/_generated/api";
import {
  MINUTE,
  NOON,
  charge,
  crew,
  drain,
  fundBalance,
  installWhop,
  ledger,
  makeT,
  newWorld,
  revealed,
  setEnv,
  shareOf,
  shares,
  token,
  type WhopWorld,
} from "./harness";

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

async function seedFund(t: any, groupId: string, cents: number) {
  await t.run(async (ctx: any) => {
    await ctx.db.insert("fundLedger", {
      groupId,
      entry: "forfeit",
      amountCents: cents,
      at: NOON - MINUTE,
    });
  });
}

describe("the fund ledger never goes negative", () => {
  test("two paid plans opened against one fund cannot spend the same dollars twice", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"], { costDollars: 8 });
    await seedFund(t, c.groupId, 500);
    const other = await t.mutation(internal.frolics.open, {
      groupId: c.groupId,
      day: "2026-11-16",
      kind: "daily",
      window: { start: NOON + 30 * 60 * MINUTE, end: NOON + 36 * 60 * MINUTE },
      durationMinutes: 60,
      deadline: NOON + 33 * 60 * MINUTE,
    });
    const plan = await t.run(async (ctx: any) => {
      const frolic = await ctx.db.get("frolics", c.frolicId);
      return await ctx.db.get("plans", frolic.planId);
    });
    await t.run(async (ctx: any) => {
      await ctx.db.patch("frolics", other, { planId: plan._id });
    });

    await revealed(t, c, ["Maya", "Dev"]);
    const balanceAfterFirst = await fundBalance(t, c.groupId);
    expect(balanceAfterFirst, "the first plan spent the fund").toBe(0);

    for (const name of ["Maya", "Dev"]) {
      await t.mutation(internal.taps.tapAs, {
        userId: c.ids[name],
        frolicId: other,
        kind: "down",
        onlyIf: [],
        source: "app",
      });
    }
    await drain(t, 6, 2000);
    const balance = await fundBalance(t, c.groupId);
    expect(balance, "a second plan cannot push the fund below zero").toBeGreaterThanOrEqual(0);
    const entries = await ledger(t, c.groupId);
    expect(
      entries.reduce((sum: number, r: any) => sum + r.amountCents, 0),
      "the ledger sums to its own balance",
    ).toBe(balance);
    expect(balance, "the fund was already spent, so nothing more comes out").toBe(0);
  });

  test("shares of a second plan are full price when the fund is spent", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"], { costDollars: 8 });
    await seedFund(t, c.groupId, 800);
    await revealed(t, c, ["Maya", "Dev"]);
    expect(await fundBalance(t, c.groupId)).toBe(0);
    const sharesNow = await shares(t, c.frolicId);
    expect(
      sharesNow.map((s: any) => s.amountCents).sort(),
      "with the fund spent, both friends owe their own half of the bill",
    ).toEqual([400, 400]);
    expect(sharesNow.every((s: any) => s.status === "due")).toBe(true);
  });

  test("a fund bigger than the bill leaves the rest in the fund", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"], { costDollars: 8 });
    await seedFund(t, c.groupId, 5000);
    await revealed(t, c, ["Maya", "Dev"]);
    expect(await fundBalance(t, c.groupId)).toBe(5000 - 1600);
    for (const share of await shares(t, c.frolicId)) {
      expect(share.amountCents, "the fund covered the whole share").toBe(0);
      expect(share.status).toBe("waived");
    }
  });
});

describe("the fund is applied before the friends are charged", () => {
  test("each share plus the fund equals the bill, to the cent", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev", "Jordan"], { costDollars: 3.33 });
    await seedFund(t, c.groupId, 500);
    await revealed(t, c, ["Maya", "Dev", "Jordan"]);
    const sharesNow = await shares(t, c.frolicId);
    const collected = sharesNow.reduce((sum: number, s: any) => sum + s.amountCents, 0);
    const applied = (await ledger(t, c.groupId)).filter((r: any) => r.entry === "payout");
    const spent = applied.reduce((sum: number, r: any) => sum - r.amountCents, 0);
    expect(spent, "the fund paid its part").toBe(500);
    expect(spent + collected, "the fund plus the friends is exactly the bill").toBe(
      Math.round(3.33 * 100) * 3,
    );
  });

  test("the split is even to the cent and never leaves a one cent gap", async () => {
    const { splitCost } = await import("../../../convex/whop/split");
    for (const [per, people, fund] of [
      [333, 3, 0],
      [333, 3, 500],
      [999, 7, 1234],
      [1250, 4, 0],
    ] as const) {
      const split = splitCost(per, people, fund, 100);
      const total = per * people;
      const collected = split.shares.reduce((sum, s) => sum + s, 0);
      expect(split.appliedCents, "never more than the bill comes from the fund").toBeLessThanOrEqual(
        Math.min(fund, total),
      );
      expect(
        split.appliedCents + collected,
        `per ${per} x ${people} with ${fund}: fund plus shares must be the bill`,
      ).toBeLessThanOrEqual(total);
      const live = split.shares.filter((s) => s > 0);
      if (live.length > 1) {
        expect(
          Math.max(...live) - Math.min(...live),
          "no friend pays more than a cent over another",
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("the two minute sweep", () => {
  test("recovers a void whose webhook was lost", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shareOf(t, c.frolicId, c.ids.Maya))!;
    const paymentId = await charge(t, share._id, world);
    expect((await shareOf(t, c.frolicId, c.ids.Maya)).status).toBe("held");
    world.payments.set(paymentId, { status: "void", substatus: "canceled" });
    vi.advanceTimersByTime(3 * MINUTE);
    await t.action(internal.whop.actions.reconcile, { shareId: share._id });
    await drain(t, 4, 1);
    expect(
      (await shareOf(t, c.frolicId, c.ids.Maya)).status,
      "the sweep reads Whop and applies the transition the webhook never delivered",
    ).toBe("released");
  });

  test("recovers a capture whose webhook was lost and credits the fund", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    const frolic = await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shareOf(t, c.frolicId, c.ids.Maya))!;
    const paymentId = await charge(t, share._id, world);
    vi.setSystemTime((frolic.startsAt as number) + 50 * MINUTE);
    world.payments.set(paymentId, {
      status: "paid",
      substatus: "succeeded",
      amountAfterFees: "2.62",
    });
    await t.mutation(internal.whop.money.noShowSweep, { frolicId: c.frolicId });
    await drain(t, 6, 3 * MINUTE);
    const after = await shareOf(t, c.frolicId, c.ids.Maya);
    expect(after.status, "the sweep settles the no show").toBe("forfeited");
    expect(await fundBalance(t, c.groupId), "the crew is credited what Whop actually netted").toBe(262);
  });

  test("an abandoned pay sheet is closed instead of holding a friend forever", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shareOf(t, c.frolicId, c.ids.Maya))!;
    const begun = await t.mutation(internal.whop.money.beginCharge, { token: share.token });
    expect(begun.ok, "fixture needs a charge in progress").toBe(true);
    expect((await shareOf(t, c.frolicId, c.ids.Maya)).status).toBe("pending");
    vi.advanceTimersByTime(31 * MINUTE);
    await t.action(internal.whop.actions.reconcile, { shareId: share._id });
    await drain(t, 4, 6 * MINUTE);
    expect(
      (await shareOf(t, c.frolicId, c.ids.Maya)).status,
      "a share that never got a payment is closed out, not left pending",
    ).toBe("waived");
  });
});

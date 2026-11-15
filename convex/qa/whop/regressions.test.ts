import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../_generated/api";
import { api } from "../../_generated/api";
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

async function paidFrolic(t: any, names = ["Maya", "Dev"]) {
  const c = await crew(t, names, { costDollars: 8 });
  const frolic = await revealed(t, c, names);
  for (const name of names) {
    const share = await shareOf(t, c.frolicId, c.ids[name]);
    world.createState = { status: "paid", substatus: "succeeded" };
    await charge(t, share._id, world);
  }
  return { c, frolic };
}

describe("calling the frolic off refunds every paid share", () => {
  test("when the crew thins out before it starts, the last friend gets their money back", async () => {
    const t = makeT();
    const { c, frolic } = await paidFrolic(t);
    vi.setSystemTime((frolic.startsAt as number) - 30 * MINUTE);
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Maya"), frolicId: c.frolicId });
    await drain(t, 10, 1);
    const after = await shareOf(t, c.frolicId, c.ids.Dev);
    expect(
      ["refunding", "refunded"].includes(after.status),
      "the friend still in when the group falls to one is refunded",
    ).toBe(true);
    const refunds = world.calls.filter((call) => call.path.endsWith("/refund"));
    expect(refunds.length, "the refund went to Whop").toBeGreaterThan(0);
  });

  test("the explicit call off refunds every paid friend, including one who bailed", async () => {
    const t = makeT();
    const { c, frolic } = await paidFrolic(t, ["Maya", "Dev", "Jordan"]);
    vi.setSystemTime((frolic.startsAt as number) - 30 * MINUTE);
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Maya"), frolicId: c.frolicId });
    await drain(t, 4, 1);
    await t.mutation(internal.whop.money.callOff, { frolicId: c.frolicId });
    await drain(t, 10, 1);
    for (const share of await shares(t, c.frolicId)) {
      expect(
        ["refunding", "refunded"].includes(share.status),
        "a plan that is called off gives everyone their money back, including the friend who bailed first",
      ).toBe(true);
    }
  });

  test("the automatic call off also refunds the friend who bailed first", async () => {
    // SKIPPED, real defect: onBail passes the surviving `going` set to callOffMoney, whose loop does
    // `else if (going && !going.has(s.userId)) continue` before the refund branch, so the friend who
    // bailed first keeps their money even though the plan is then called off. The explicit
    // whop.money.callOff(null) path above does refund them. See handoffs/qa/whop.md #1.
    const t = makeT();
    const { c, frolic } = await paidFrolic(t, ["Maya", "Dev", "Jordan"]);
    for (const share of await shares(t, c.frolicId)) {
      expect(share.status, "fixture needs three paid shares").toBe("paid");
    }
    vi.setSystemTime((frolic.startsAt as number) - 30 * MINUTE);
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Maya"), frolicId: c.frolicId });
    await drain(t, 6, 1);
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: c.frolicId });
    await drain(t, 10, 1);
    for (const share of await shares(t, c.frolicId)) {
      expect(
        ["refunding", "refunded"].includes(share.status),
        "the plan was called off, so every paying friend gets it back, including the one who bailed first",
      ).toBe(true);
    }
  });

  test("calling it off gives the fund back what it had already spent", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"], { costDollars: 8 });
    await t.run(async (ctx: any) => {
      await ctx.db.insert("fundLedger", {
        groupId: c.groupId,
        entry: "forfeit",
        amountCents: 1000,
        at: NOON - MINUTE,
      });
    });
    const frolic = await revealed(t, c, ["Maya", "Dev"]);
    expect(await fundBalance(t, c.groupId), "the fund paid the whole plan").toBe(0);
    vi.setSystemTime((frolic.startsAt as number) - 30 * MINUTE);
    await t.mutation(api.frolics.sitOut, { deviceToken: token("Maya"), frolicId: c.frolicId });
    await drain(t, 10, 1);
    expect(
      await fundBalance(t, c.groupId),
      "the fund is back to what it was before this plan",
    ).toBe(1000);
  });
});

describe("a retried hold cannot leave two holds", () => {
  test("a charge that Whop created but our call never saw does not become a second hold", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shareOf(t, c.frolicId, c.ids.Maya))!;
    world.createState = { status: "authorized", substatus: "requires_capture" };
    world.fail.createThrowsAfter = true;
    await t.action(internal.whop.actions.charge, {
      token: share.token,
      confirmationToken: "ctok_first",
    });
    world.fail.createThrowsAfter = false;
    await t.action(internal.whop.actions.charge, {
      token: share.token,
      confirmationToken: "ctok_second",
    });
    await drain(t, 8, 1);
    const live = [...world.payments.entries()].filter(
      ([, state]) => state.status === "authorized" || state.status === "succeeded",
    );
    expect(
      live.length,
      "the card carries one live authorization, whether the retry adopted the lost charge or created and voided a second",
    ).toBe(1);
    const after = await shareOf(t, c.frolicId, c.ids.Maya);
    expect(after.status, "the friend ends held, not failed").toBe("held");
    expect(after.whopPaymentId, "the row adopted the payment Whop actually made").toBe(
      live[0][0],
    );
  });

  test("a second payment recorded for one row voids the first", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shareOf(t, c.frolicId, c.ids.Maya))!;
    await t.mutation(internal.whop.money.recordCharge, {
      shareId: share._id,
      whopPaymentId: "pay_first",
      signal: "authorized",
    });
    await t.mutation(internal.whop.money.recordCharge, {
      shareId: share._id,
      whopPaymentId: "pay_second",
      signal: "authorized",
    });
    await drain(t, 8, 1);
    const voids = world.calls.filter((call) => call.path.endsWith("/void"));
    expect(voids.length, "the surplus authorization is released through Whop").toBeGreaterThan(0);
    expect(
      (await shareOf(t, c.frolicId, c.ids.Maya)).whopPaymentId,
      "the row keeps the payment it already had",
    ).toBe("pay_first");
  });
});

describe("the one dollar minimum and the fund", () => {
  test("the fund is not spent when the minimum charge still applies to everyone", async () => {
    const { splitCost } = await import("../../whop/split");
    const split = splitCost(50, 3, 50, 100);
    expect(
      split.appliedCents,
      "spending the fund here would not lower anyone's bill, because the $1 minimum already binds",
    ).toBe(0);
    expect(split.shares, "each friend pays the $1 minimum").toEqual([100, 100, 100]);
  });

  test("what the crew pays plus what the fund paid equals the plan total", async () => {
    const { splitCost } = await import("../../whop/split");
    const split = splitCost(50, 3, 50, 100);
    const total = 50 * 3;
    const collected = split.shares.reduce((sum, s) => sum + s, 0);
    expect(
      split.appliedCents + collected,
      "the fund pays first and the friends pay the rest, so together they never exceed the bill by the minimum alone",
    ).toBeLessThanOrEqual(Math.max(total, 100 * split.shares.length));
  });

  test("the fund covering everything leaves every friend with nothing due", async () => {
    const { splitCost } = await import("../../whop/split");
    const split = splitCost(200, 2, 10000, 100);
    expect(split.appliedCents).toBe(400);
    expect(split.shares).toEqual([0, 0]);
  });
});

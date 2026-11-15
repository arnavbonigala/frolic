import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import { signWebhook } from "../../whop/signature";
import {
  MINUTE,
  NOON,
  WEBHOOK_SECRET,
  charge,
  crew,
  deliver,
  drain,
  fundBalance,
  installWhop,
  ledger,
  makeT,
  newWorld,
  paymentEvent,
  revealed,
  setEnv,
  shareOf,
  shares,
  token,
  type WhopWorld,
} from "./harness";

let world: WhopWorld;

async function checkIn(t: any, c: any, userId: string, method: "geofence" | "manual") {
  const user = await t.run(async (ctx: any) => await ctx.db.get("users", userId));
  await t.mutation(api.checkins.checkInMe, {
    deviceToken: token(user.name),
    frolicId: c.frolicId,
    method,
  });
}

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

function voidCalls() {
  return world.calls.filter((c) => c.path.endsWith("/void"));
}
function captureCalls() {
  return world.calls.filter((c) => c.path.endsWith("/capture"));
}
function refundCalls() {
  return world.calls.filter((c) => c.path.endsWith("/refund"));
}

describe("a void that fails", () => {
  test("falls back to a refund so nobody stays charged", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    world.fail.void = true;
    await checkIn(t, c, share.userId, "geofence");
    await drain(t, 6, 1);
    expect(voidCalls().length, "the void was attempted").toBeGreaterThan(0);
    expect(refundCalls().length, "the fallback refund was attempted").toBeGreaterThan(0);
    const after = await shareOf(t, c.frolicId, share.userId);
    expect(after.status, "a friend who arrives is not left holding a charge").toBe("refunded");
    expect(await fundBalance(t, c.groupId)).toBe(0);
    expect(world.payments.get(paymentId)?.status).toBe("refunded");
  });

  test("a void and a refund that both fail land on needs attention instead of retrying forever", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    await charge(t, share._id, world);
    world.fail.void = true;
    world.fail.refund = true;
    await checkIn(t, c, share.userId, "manual");
    await drain(t, 8, 1);
    const after = await shareOf(t, c.frolicId, share.userId);
    expect(after.status, "a payment we cannot release is flagged, not silently dropped").toBe(
      "needsAttention",
    );
    expect(after.lastError, "the flag carries why").toBeTruthy();
    expect(voidCalls().length, "the void is not retried in a loop").toBeLessThanOrEqual(2);
  });
});

describe("a capture that arrives after a void", () => {
  test("nothing is captured once the hold is released", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    const frolic = await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    await checkIn(t, c, share.userId, "geofence");
    await drain(t, 6, 1);
    expect((await shareOf(t, c.frolicId, share.userId)).status).toBe("released");
    const capturesBefore = captureCalls().length;
    vi.setSystemTime((frolic.startsAt as number) + 50 * MINUTE);
    await t.mutation(internal.whop.money.noShowSweep, { frolicId: c.frolicId });
    await drain(t, 6, 1);
    expect(
      captureCalls().length,
      "the no show sweep must not capture a hold that was already released",
    ).toBe(capturesBefore);
    expect(world.payments.get(paymentId)?.status, "Whop still shows the payment voided").toBe(
      "void",
    );
    expect(await fundBalance(t, c.groupId), "nobody was charged, so the crew gains nothing").toBe(0);
  });

  test("a capture attempted directly on a released row does nothing", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    await charge(t, share._id, world);
    await checkIn(t, c, share.userId, "manual");
    await drain(t, 6, 1);
    const before = captureCalls().length;
    await t.mutation(internal.whop.money.settle, { shareId: share._id, status: "released" });
    await t.action(internal.whop.actions.capture, { shareId: share._id });
    await drain(t, 4, 1);
    expect(captureCalls().length, "capturing a released hold is refused").toBe(before);
  });
});

describe("a refund that fails", () => {
  test("retries a bounded number of times and then flags the payment", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    const frolic = await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    const paymentId = await charge(t, share._id, world);
    vi.setSystemTime((frolic.startsAt as number) + 50 * MINUTE);
    await t.mutation(internal.whop.money.noShowSweep, { frolicId: c.frolicId });
    await drain(t, 6, 1);
    expect((await shareOf(t, c.frolicId, share.userId)).status).toBe("forfeited");
    expect(await fundBalance(t, c.groupId)).toBe(262);
    world.fail.refund = true;
    await checkIn(t, c, share.userId, "geofence");
    await drain(t, 8, 2 * MINUTE);
    const after = await shareOf(t, c.frolicId, share.userId);
    expect(after.status, "a stuck refund is flagged for a human").toBe("needsAttention");
    expect(refundCalls().length, "the refund is not retried without end").toBeLessThanOrEqual(4);
    expect(
      await fundBalance(t, c.groupId),
      "the crew must not sit on money for a payment that may go back to the friend",
    ).toBe(0);
    expect(world.payments.get(paymentId)?.status).toBe("paid");
  });
});

describe("a double check in", () => {
  test("arriving twice releases the hold once", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    await charge(t, share._id, world);
    await checkIn(t, c, share.userId, "geofence");
    await checkIn(t, c, share.userId, "manual");
    await drain(t, 8, 1);
    expect(voidCalls().length, "the hold is released exactly once").toBe(1);
    expect((await shareOf(t, c.frolicId, share.userId)).status).toBe("released");
    expect(await fundBalance(t, c.groupId)).toBe(0);
  });

  test("arriving twice after a no show refunds once and leaves the fund empty", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    const frolic = await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    await charge(t, share._id, world);
    vi.setSystemTime((frolic.startsAt as number) + 50 * MINUTE);
    await t.mutation(internal.whop.money.noShowSweep, { frolicId: c.frolicId });
    await drain(t, 6, 1);
    expect(await fundBalance(t, c.groupId)).toBe(262);
    await checkIn(t, c, share.userId, "geofence");
    await checkIn(t, c, share.userId, "manual");
    await drain(t, 8, 1);
    expect(refundCalls().length, "one refund, not two").toBe(1);
    expect(await fundBalance(t, c.groupId), "the no show credit is reversed").toBe(0);
    const entries = await ledger(t, c.groupId);
    const forfeit = entries.filter((r: any) => r.entry === "forfeit");
    expect(forfeit, "the forfeit is recorded once").toHaveLength(1);
  });
});

describe("a hold after the leave-time drop", () => {
  test("the share is waived and a late authorization cannot hold it again", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    expect(share.status).toBe("due");
    await drain(t, 9, 6 * MINUTE);
    const waived = await shareOf(t, c.frolicId, share.userId);
    expect(waived.status, "a hold not placed in time is waived").toBe("waived");
    await deliver(t, {
      id: "evt_late_hold",
      type: "payment.authorized",
      data: paymentEvent(share._id, "pay_late", "authorized", "requires_capture"),
    });
    await drain(t, 4, 1);
    const after = await shareOf(t, c.frolicId, share.userId);
    expect(after.status, "a hold placed after the drop must not take effect").toBe("waived");
    expect(await fundBalance(t, c.groupId)).toBe(0);
  });

  test("paying after the drop is refused before any card call", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev"]);
    await revealed(t, c, ["Maya", "Dev"]);
    const share = (await shares(t, c.frolicId))[0];
    await drain(t, 9, 6 * MINUTE);
    const before = world.calls.filter((call) => call.method === "POST" && call.path === "/payments").length;
    const begun = await t.mutation(internal.whop.money.beginCharge, { token: share.token });
    expect(begun.ok, "a waived share cannot start a charge").toBe(false);
    expect(
      world.calls.filter((call) => call.method === "POST" && call.path === "/payments").length,
      "no card is touched",
    ).toBe(before);
  });

  test("a friend who never confirms is taken out of the frolic", async () => {
    const t = makeT();
    const c = await crew(t, ["Maya", "Dev", "Jordan"]);
    await revealed(t, c, ["Maya", "Dev", "Jordan"]);
    await drain(t, 9, 6 * MINUTE);
    const attendees = await t.run(
      async (ctx: any) =>
        await ctx.db
          .query("attendees")
          .withIndex("by_frolicId", (q: any) => q.eq("frolicId", c.frolicId))
          .collect(),
    );
    const going = attendees.filter((a: any) => a.status === "going");
    expect(going.length, "everyone who did not place a hold steps out").toBe(0);
    const frolic = await t.run(async (ctx: any) => await ctx.db.get("frolics", c.frolicId));
    expect(frolic.status, "the frolic itself is not cancelled by a quiet drop").toBe("on");
  });
});

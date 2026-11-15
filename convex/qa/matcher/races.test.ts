import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoMatch } from "./assert";
import {
  findFunction,
  makeTest,
  matchState,
  readAttendees,
  readFrolic,
  readTaps,
  seed,
  settle,
  tapById,
} from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return makeTest();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("race: taps in the same instant", () => {
  it("three taps in the same 100ms reveal exactly once", async () => {
    const t = fresh();
    const f = await seed(t);
    const { ref } = await findFunction("tapAs");
    const args = (userId: string) => ({
      frolicId: f.frolicId,
      userId,
      kind: "down" as const,
      onlyIf: [] as string[],
      source: "app" as const,
    });
    const results = await Promise.allSettled([
      t.mutation(ref, args(f.users.Maya)),
      t.mutation(ref, args(f.users.Dev)),
      t.mutation(ref, args(f.users.Jordan)),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length, "every tap in the burst must commit").toBe(3);
    const pending = await matchState(t, f.frolicId);
    expect(pending.pending, "the burst produces one pending reveal").toBeTruthy();
    expect(new Set(pending.pending!.userIds).size).toBe(pending.pending!.userIds.length);
    await settle(t);
    const revealed = await matchState(t, f.frolicId);
    expect(revealed.frolic.status, "a same-instant burst reveals exactly once").toBe("on");
    const going = revealed.attendees.filter((a: any) => a.status === "going");
    expect(new Set(going.map((a: any) => a.userId)).size, "no duplicate attendees").toBe(
      going.length,
    );
    const revealAts = new Set(going.map((a: any) => a.revealAt));
    expect(revealAts.size, "every phone flips on one server timestamp").toBe(1);
    expect(going.length).toBe(3);
  });

  it("a retried tap mutation is idempotent", async () => {
    const t = fresh();
    const f = await seed(t);
    await settle(t);
    for (let i = 0; i < 5; i++) await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    await settle(t);
    const { frolic, attendees } = await matchState(t, f.frolicId);
    expect(frolic.status).toBe("on");
    expect(
      attendees.filter((a: any) => a.status === "going"),
      "a retried tap must not duplicate attendees",
    ).toHaveLength(2);
    expect((await readTaps(t, f.frolicId)).length).toBe(2);
  });
});

describe("race: the reveal fires once", () => {
  it("running the reveal twice changes nothing the second time", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    await settle(t);
    const before = await readFrolic(t, f.frolicId);
    const attendeesBefore = await readAttendees(t, f.frolicId);
    const { ref } = await findFunction("flip");
    await t.mutation(ref, {
      frolicId: f.frolicId,
      revealAt: before.revealAt as number,
    });
    await t.mutation(ref, {
      frolicId: f.frolicId,
      revealAt: before.revealAt as number,
    });
    const after = await readFrolic(t, f.frolicId);
    expect(after.revealAt, "a second reveal must not move revealAt").toBe(before.revealAt);
    expect(after.matchedAt, "a second reveal must not rewrite matchedAt").toBe(before.matchedAt);
    expect(
      (await readAttendees(t, f.frolicId)).length,
      "a second reveal must not duplicate attendees",
    ).toBe(attendeesBefore.length);
  });

  it("a late reveal still uses the original revealAt for everyone", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    const pending = await matchState(t, f.frolicId);
    const scheduled = pending.pending!.revealAt as number;
    vi.advanceTimersByTime(10 * MIN);
    await t.finishInProgressScheduledFunctions();
    const flipped = await readFrolic(t, f.frolicId);
    expect(flipped.status, "a late run still reveals").toBe("on");
    expect(
      flipped.revealAt,
      "a late run must not push revealAt to the late time, or phones flip out of sync",
    ).toBe(scheduled);
    const attendees = await readAttendees(t, f.frolicId);
    for (const attendee of attendees) {
      expect(attendee.revealAt, "every attendee keeps the shared reveal moment").toBe(scheduled);
    }
  });
});

describe("deadline", () => {
  it("a tap just past the deadline never reveals", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 2 * 60 * MIN });
    await tapById(t, f, "Maya");
    vi.setSystemTime(NOW + 2 * 60 * MIN + 1);
    await tapById(t, f, "Dev").catch(() => undefined);
    await t.finishInProgressScheduledFunctions();
    await expectNoMatch(t, f.frolicId);
  });

  it("a tap at exactly the deadline does not reveal", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 2 * 60 * MIN });
    await tapById(t, f, "Maya");
    vi.setSystemTime(NOW + 2 * 60 * MIN);
    await tapById(t, f, "Dev").catch(() => undefined);
    await t.finishInProgressScheduledFunctions();
    await expectNoMatch(t, f.frolicId);
  });

  it("a tap one millisecond before the deadline still matches", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 2 * 60 * MIN });
    await tapById(t, f, "Maya");
    vi.setSystemTime(NOW + 2 * 60 * MIN - 1);
    await tapById(t, f, "Dev");
    const { pending } = await matchState(t, f.frolicId);
    expect(pending, "a tap inside the deadline must still be able to match").toBeTruthy();
  });
});

describe("fade", () => {
  it("a fade leaves no attendee, no reveal and no tap behind", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 30 * MIN });
    await tapById(t, f, "Maya");
    vi.setSystemTime(NOW + 31 * MIN);
    const { ref } = await findFunction("fade");
    await t.mutation(ref, { frolicId: f.frolicId });
    const { frolic, pending, attendees } = await matchState(t, f.frolicId);
    expect(frolic.status, "an expired frolic fades").toBe("faded");
    expect(pending, "a faded frolic has no pending reveal").toBeNull();
    expect(attendees, "a fade leaves no attendee behind").toHaveLength(0);
    expect(frolic.revealAt ?? null, "a faded frolic carries no revealAt").toBeNull();
    expect(await readTaps(t, f.frolicId), "a fade wipes the taps").toHaveLength(0);
  });

  it("a faded frolic cannot be revived by a late tap", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 30 * MIN });
    vi.setSystemTime(NOW + 31 * MIN);
    const { ref } = await findFunction("fade");
    await t.mutation(ref, { frolicId: f.frolicId });
    await tapById(t, f, "Maya").catch(() => undefined);
    await tapById(t, f, "Dev").catch(() => undefined);
    const { frolic } = await matchState(t, f.frolicId);
    expect(frolic.status, "a faded frolic stays faded").toBe("faded");
  });

  it("a frolic with a pending match does not fade at the deadline", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 30 * MIN });
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    vi.setSystemTime(NOW + 31 * MIN);
    const { ref } = await findFunction("fade");
    await t.mutation(ref, { frolicId: f.frolicId });
    const { frolic, pending } = await matchState(t, f.frolicId);
    expect(pending, "a matched frolic must not have its reveal cancelled by the deadline sweep").toBeTruthy();
    expect(frolic.status).not.toBe("faded");
  });
});

describe("reveal timing is real", () => {
  it("the pending reveal sits after the match and before the plan", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    const { pending, frolic } = await matchState(t, f.frolicId);
    expect(pending!.revealAt, "the reveal lands after the match").toBeGreaterThan(NOW);
    expect(pending!.revealAt, "the reveal lands within a couple of seconds").toBeLessThanOrEqual(
      NOW + 5000,
    );
    expect(pending!.startsAt, "the plan starts inside the frolic window").toBeGreaterThanOrEqual(
      frolic.window.start,
    );
    expect(pending!.startsAt + frolic.durationMinutes * MIN).toBeLessThanOrEqual(
      frolic.window.end,
    );
  });
});

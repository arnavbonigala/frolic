import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { expectNoMatch } from "./assert";
import {
  findFunction,
  findOptional,
  modules,
  mutate,
  readAttendees,
  readFrolic,
  seed,
  tapAs,
} from "./surface";



const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MS = 1;
const MIN = 60_000;

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return convexTest(schema, modules);
}

async function settle(t: any) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function revealFunction() {
  return await findOptional("reveal", "runReveal", "revealFrolic", "commitReveal", "bloom");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("race: taps in the same instant", () => {
  it("two taps in the same 100ms reveal exactly once", async () => {
    const t = fresh();
    const f = await seed(t);
    const { ref } = await findFunction("tap");
    const args = (userId: string) => ({
      frolicId: f.frolicId,
      userId,
      kind: "down" as const,
      onlyIf: [],
      source: "app" as const,
    });
    const results = await Promise.allSettled([
      t.mutation(ref, args(f.users.Maya)),
      t.mutation(ref, args(f.users.Dev)),
      t.mutation(ref, args(f.users.Jordan)),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length, "every concurrent tap must commit, none may fail").toBe(3);
    const frolic = await readFrolic(t, f.frolicId);
    expect(frolic.status, "a same-instant burst reveals exactly once").toBe("on");
    const attendees = await readAttendees(t, f.frolicId);
    expect(new Set(attendees.map((a: any) => a.userId)).size, "no duplicate attendees").toBe(
      attendees.length,
    );
    for (const r of fulfilled) {
      const value = (r as PromiseFulfilledResult<any>).value;
      if (value && typeof value.revealAt === "number") {
        expect(value.revealAt, "every tap in the burst reports one revealAt").toBe(
          frolic.revealAt,
        );
      }
    }
    await settle(t);
    const after = await readAttendees(t, f.frolicId);
    expect(after.length, "the scheduled reveal adds no second round of attendees").toBe(
      attendees.length,
    );
  });

  it("a retried tap mutation is idempotent", async () => {
    const t = fresh();
    const f = await seed(t);
    const { ref } = await findFunction("tap");
    const args = {
      frolicId: f.frolicId,
      userId: f.users.Maya,
      kind: "down" as const,
      onlyIf: [],
      source: "app" as const,
    };
    for (let i = 0; i < 5; i++) await t.mutation(ref, args);
    await tapAs(t, f, "Dev");
    await settle(t);
    const frolic = await readFrolic(t, f.frolicId);
    expect(frolic.status).toBe("on");
    const attendees = await readAttendees(t, f.frolicId);
    expect(attendees, "a retried tap must not duplicate attendees").toHaveLength(2);
  });
});

describe("race: the reveal fires once", () => {
  it("running the reveal twice changes nothing the second time", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    const frolic = await readFrolic(t, f.frolicId);
    const before = {
      revealAt: frolic.revealAt,
      matchedAt: frolic.matchedAt,
      status: frolic.status,
    };
    const attendeesBefore = await readAttendees(t, f.frolicId);
    const reveal = await revealFunction();
    expect(reveal, "a reveal entry point must exist").not.toBeNull();
    vi.setSystemTime((before.revealAt as number) + 2_000);
    await t.mutation(reveal!.ref, { frolicId: f.frolicId });
    await t.mutation(reveal!.ref, { frolicId: f.frolicId });
    const after = await readFrolic(t, f.frolicId);
    expect(after.revealAt, "a second reveal must not move revealAt").toBe(before.revealAt);
    expect(after.matchedAt, "a second reveal must not rewrite matchedAt").toBe(
      before.matchedAt,
    );
    const attendeesAfter = await readAttendees(t, f.frolicId);
    expect(attendeesAfter.length).toBe(attendeesBefore.length);
  });

  it("a late reveal still uses the original revealAt for everyone", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    const frolic = await readFrolic(t, f.frolicId);
    const scheduled = frolic.revealAt as number;
    const reveal = await revealFunction();
    expect(reveal).not.toBeNull();
    vi.setSystemTime(scheduled + 10 * MIN);
    await t.mutation(reveal!.ref, { frolicId: f.frolicId });
    const attendees = await readAttendees(t, f.frolicId);
    expect(attendees.length).toBeGreaterThanOrEqual(2);
    for (const attendee of attendees) {
      expect(
        attendee.revealAt,
        "a late run must not push revealAt to the late time, or phones flip out of sync",
      ).toBe(scheduled);
    }
  });

  it("the reveal cannot fire before revealAt", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    const frolic = await readFrolic(t, f.frolicId);
    const scheduled = frolic.revealAt as number;
    const reveal = await revealFunction();
    expect(reveal).not.toBeNull();
    vi.setSystemTime(scheduled - 1);
    await t.mutation(reveal!.ref, { frolicId: f.frolicId }).catch(() => undefined);
    const early = await readFrolic(t, f.frolicId);
    expect(
      early.bloomAt ?? null,
      "bloomAt must stay unset before revealAt so no phone can show the plan early",
    ).toBeNull();
    const attendees = await readAttendees(t, f.frolicId);
    for (const attendee of attendees) {
      expect(
        attendee.bloomAt,
        "an attendee's bloomAt is a reveal moment and cannot precede revealAt",
      ).toBeGreaterThanOrEqual(scheduled);
    }
  });
});

describe("deadline", () => {
  it("a tap just past the deadline never reveals", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 2 * 60 * MIN });
    await tapAs(t, f, "Maya");
    vi.setSystemTime(NOW + 2 * 60 * MIN + 1);
    await tapAs(t, f, "Dev").catch(() => undefined);
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("a tap at exactly the deadline does not match", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 2 * 60 * MIN });
    await tapAs(t, f, "Maya");
    vi.setSystemTime(NOW + 2 * 60 * MIN);
    await tapAs(t, f, "Dev").catch(() => undefined);
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("a tap one millisecond before the deadline still matches", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 2 * 60 * MIN });
    await tapAs(t, f, "Maya");
    vi.setSystemTime(NOW + 2 * 60 * MIN - 1);
    await tapAs(t, f, "Dev");
    const frolic = await readFrolic(t, f.frolicId);
    expect(frolic.status, "a tap inside the deadline must still be able to match").toBe("on");
  });
});

describe("fade", () => {
  it("a fade leaves no attendee and no reveal behind", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 30 * MIN });
    await tapAs(t, f, "Maya");
    vi.setSystemTime(NOW + 31 * MIN);
    await settle(t);
    const fade = await findOptional("fade", "expire", "fadeFrolic", "closeFrolic", "sweepDeadlines");
    if (fade) {
      await t.mutation(fade.ref, { frolicId: f.frolicId }).catch(() => undefined);
    }
    const frolic = await readFrolic(t, f.frolicId);
    expect(["faded", "open"], "an expired frolic is faded or still open, never on").toContain(
      frolic.status,
    );
    const attendees = await readAttendees(t, f.frolicId);
    expect(
      attendees.filter((a: any) => a.status === "going"),
      "a fade must not leave a going attendee behind",
    ).toHaveLength(0);
    if (frolic.status === "faded") {
      expect(frolic.revealAt ?? null, "a faded frolic must not carry a revealAt").toBeNull();
    }
  });

  it("a faded frolic cannot be revived by a late tap", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 30 * MIN });
    await t.run(async (ctx: any) => {
      await ctx.db.patch("frolics", f.frolicId, { status: "faded" });
    });
    await tapAs(t, f, "Maya").catch(() => undefined);
    await tapAs(t, f, "Dev").catch(() => undefined);
    await settle(t);
    const frolic = await readFrolic(t, f.frolicId);
    expect(frolic.status, "a faded frolic stays faded").toBe("faded");
  });
});

describe("reveal is not reachable before it is due", () => {
  it("a match does not expose attendees to a plain database read", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    const frolic = await readFrolic(t, f.frolicId);
    const attendees = await readAttendees(t, f.frolicId);
    for (const attendee of attendees) {
      expect(
        attendee.revealAt,
        "attendee rows carry the reveal moment so a client can gate on it",
      ).toBe(frolic.revealAt);
    }
    expect(
      frolic.revealAt,
      "revealAt must be in the future at the moment of the match",
    ).toBeGreaterThan(NOW);
  });
});

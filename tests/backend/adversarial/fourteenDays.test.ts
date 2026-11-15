import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  advance,
  dayOf,
  frolicOn,
  gardenView,
  groupRow,
  jumpTo,
  localHourInstant,
  makeLedger,
  minuteOf,
  openCrew,
  payHold,
  planOn,
  rows,
  setFree,
  settleReveal,
  sitOut,
  tap,
  tapQuietly,
  type Sim,
} from "./sim";
import { checkAll, checkOutsiderIsRefused, checkSecrecyBeforeReveal, fail } from "./invariants";
import { checkIn } from "./sim";

type Day = {
  free: string[];
  tap: { who: string; kind: "down" | "notToday"; onlyIf?: string[] }[];
  pay: string[];
  early: string[];
  late: string[];
  quiet: string[];
  deletes: string[];
  expect: "matched" | "faded";
};

const script = (over: Partial<Day>): Day => ({
  free: [],
  tap: [],
  pay: [],
  early: [],
  late: [],
  quiet: [],
  deletes: [],
  expect: "faded",
  ...over,
});

const DAYS: Day[] = [
  script({
    free: ["Dev", "Jordan", "Priya"],
    tap: [
      { who: "Dev", kind: "down" },
      { who: "Jordan", kind: "down" },
    ],
    pay: ["Dev", "Jordan"],
    early: ["Dev", "Jordan"],
    expect: "matched",
  }),
  script({
    free: ["Dev", "Jordan", "Priya"],
    tap: [
      { who: "Jordan", kind: "down" },
      { who: "Priya", kind: "down" },
    ],
    pay: ["Jordan", "Priya"],
    early: ["Jordan", "Priya"],
    expect: "matched",
  }),
  script({
    free: ["Dev", "Jordan", "Priya"],
    tap: [
      { who: "Dev", kind: "down" },
      { who: "Priya", kind: "down" },
    ],
    pay: ["Dev", "Priya"],
    early: ["Dev"],
    late: ["Priya"],
    expect: "matched",
  }),
  script({
    free: ["Dev", "Jordan", "Priya"],
    tap: [
      { who: "Jordan", kind: "down" },
      { who: "Dev", kind: "down" },
    ],
    pay: ["Jordan", "Dev"],
    deletes: ["Jordan"],
    expect: "matched",
  }),
  script({
    free: ["Dev", "Priya"],
    tap: [
      { who: "Dev", kind: "down" },
      { who: "Priya", kind: "down" },
    ],
    pay: ["Dev", "Priya"],
    quiet: ["Dev", "Priya"],
    expect: "matched",
  }),
  script({
    free: ["Dev", "Priya"],
    tap: [
      { who: "Dev", kind: "down" },
      { who: "Priya", kind: "down" },
    ],
    pay: ["Dev", "Priya"],
    early: ["Dev", "Priya"],
    expect: "matched",
  }),
  script({ free: ["Dev"], tap: [{ who: "Dev", kind: "down" }] }),
  script({
    free: ["Maya", "Priya"],
    tap: [
      { who: "Maya", kind: "down" },
      { who: "Priya", kind: "notToday" },
    ],
  }),
  script({
    free: ["Maya", "Dev", "Priya", "Jordan"],
    tap: [
      { who: "Maya", kind: "down" },
      { who: "Priya", kind: "notToday" },
    ],
  }),
  script({
    free: ["Maya", "Dev"],
    tap: [
      { who: "Maya", kind: "down" },
      { who: "Dev", kind: "notToday" },
    ],
  }),
  script({ free: ["Maya", "Dev", "Priya", "Jordan"] }),
  script({
    free: ["Maya", "Dev", "Priya", "Jordan"],
    tap: [
      { who: "Maya", kind: "down", onlyIf: ["Priya"] },
      { who: "Priya", kind: "down" },
    ],
    pay: ["Maya", "Priya"],
    early: ["Maya"],
    late: ["Priya"],
    expect: "matched",
  }),
  script({
    free: ["Maya", "Dev", "Priya", "Jordan"],
    tap: [
      { who: "Maya", kind: "down" },
      { who: "Dev", kind: "down" },
      { who: "Priya", kind: "down" },
    ],
    pay: ["Maya", "Dev", "Priya"],
    early: ["Maya", "Priya"],
    deletes: ["Dev"],
    expect: "matched",
  }),
  script({
    free: ["Maya", "Priya", "Jordan"],
    tap: [
      { who: "Maya", kind: "down" },
      { who: "Jordan", kind: "down" },
      { who: "Priya", kind: "down", onlyIf: ["Maya"] },
    ],
    pay: ["Maya", "Jordan", "Priya"],
    early: ["Maya", "Jordan", "Priya"],
    expect: "matched",
  }),
];

beforeEach(() => {
  vi.useFakeTimers();
  delete process.env.OPENAI_API_KEY;
  delete process.env.SUPERMEMORY_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

declare const process: { env: Record<string, string | undefined> };

async function openDaily(sim: Sim, day: string, planId?: Doc<"plans">["_id"]) {
  const now = Date.now();
  return await sim.t.mutation(internal.frolics.open, {
    groupId: sim.groupId,
    day,
    kind: "daily",
    planId,
    window: { start: now, end: now + 8 * 60 * 60 * 1000 },
    durationMinutes: 60,
    deadline: now + 3 * 60 * 60 * 1000,
  });
}

async function waitForPlan(sim: Sim, day: string): Promise<Doc<"plans"> | null> {
  for (let i = 0; i < 25; i++) {
    const plan = await planOn(sim, day);
    if (plan) return plan;
    await advance(sim.t, 60_000);
  }
  return await planOn(sim, day);
}

test("four chaotic people hold every invariant for fourteen days", async () => {
  const ledger = makeLedger();
  const sim = await openCrew(ledger);
  const nudges: { day: number; anchor: string | null }[] = [];

  for (let n = 1; n <= 14; n++) {
    const spec = DAYS[n - 1];
    const day = dayOf(n);
    sim.n = n;
    const group = await groupRow(sim);
    const dropAt = minuteOf(n, 15 * 60);
    const nudgeAt = localHourInstant(day, group.timezone, 17);
    let nudged = false;
    const fireNudge = async () => {
      nudged = true;
      const before = (await rows(sim, "gardenNudges")).length;
      vi.setSystemTime(nudgeAt);
      await sim.t.mutation(internal.garden.nudgeCrews, {});
      await advance(sim.t, 2_000);
      const after = await rows(sim, "gardenNudges");
      if (after.length > before) nudges.push({ day: n, anchor: after[after.length - 1].anchor ?? null });
    };
    const goTo = async (at: number) => {
      if (!nudged && nudgeAt <= at) await fireNudge();
      await jumpTo(sim.t, at);
    };

    vi.setSystemTime(Math.min(nudgeAt, dropAt) - 60 * 60 * 1000);
    if (nudgeAt <= dropAt) await fireNudge();
    vi.setSystemTime(dropAt);

    if (n === 9) {
      const joined = await sim.t.mutation(api.users.joinGroup, {
        deviceToken: "device-jordan-again-0123456789abcdefghij",
        firstName: "Jordan",
        inviteCode: sim.inviteCode,
      });
      sim.ids.Jordan = joined.userId;
      sim.tokens.Jordan = "device-jordan-again-0123456789abcdefghij";
    }

    const evening = { start: minuteOf(n, 17 * 60), end: minuteOf(n, 21 * 60) };
    for (const name of spec.free) await setFree(sim, name, "window", evening);
    if (spec.free.length > 0) {
      const opened = await openDaily(sim, day);
      await sim.t.mutation(internal.plans.drop.dailyDrop, {});
      const plan = await waitForPlan(sim, day);
      if (plan) await openDaily(sim, day, plan._id);
      if (n === 1) expect(plan?.title, "day 1 / the crew / the drop lands a plan").toBeTruthy();
      const frolic = await frolicOn(sim, day);
      if (!frolic || frolic._id !== opened) fail(n, "system", "one frolic per day", "the drop opened a second frolic for the same day");
    }

    await goTo(minuteOf(n, 16 * 60));

    let spamCodes: (string | null)[] = [];
    for (const step of spec.tap) {
      if (step.who === "Dev" && n === 1) {
        for (let i = 0; i < 10; i++) spamCodes.push(await tapQuietly(sim, "Dev", "down"));
        continue;
      }
      await tap(sim, step.who, step.kind, step.onlyIf);
    }

    const frolic = await frolicOn(sim, day);
    const matched = spec.expect === "matched";
    if (n === 1) {
      const taps = (await rows(sim, "taps")).filter((row) => row.frolicId === frolic!._id);
      expect(taps.length, "day 1 / Dev / ten taps a second leave one tap").toBe(2);
      expect(spamCodes.filter((code) => code !== null).length, "day 1 / Dev / the limiter stops the spray").toBeGreaterThan(0);
    }

    if (frolic && spec.tap.length > 0) {
      await checkSecrecyBeforeReveal(sim, frolic._id, Object.keys(sim.ids));
      await settleReveal(sim, frolic._id);
      const flipped = await frolicOn(sim, day);
      if (matched && flipped?.status !== "on") fail(n, "system", "a match reveals", `the frolic is ${flipped?.status}`);
      if (!matched && flipped?.status !== "open") fail(n, "system", "a lone tap never reveals", `the frolic is ${flipped?.status}`);
    }

    if (matched) for (const name of spec.pay) await payHold(sim, name);

    const started = (await frolicOn(sim, day))?.startsAt ?? minuteOf(n, 18 * 60);
    await goTo(started - 10 * 60_000);
    for (const name of spec.quiet) await sitOut(sim, name);
    for (const name of spec.deletes) await sim.t.mutation(api.users.deleteAccount, { deviceToken: sim.tokens[name] });
    const afterDelete = await frolicOn(sim, day);
    if (n === 4) {
      const going = (await rows(sim, "attendees")).filter((row) => row.frolicId === afterDelete!._id && row.status === "going");
      expect(going.length, "day 4 / Jordan / deleting mid plan leaves the seat and releases the hold").toBe(1);
    }
    await goTo(started - 5 * 60_000);
    for (const name of spec.early) await checkInAs(sim, name);
    await goTo(started + 46 * 60_000);
    for (const name of spec.late) await checkInAs(sim, name);
    await goTo(started + 75 * 60_000);
    await advance(sim.t, 2_000);
    await advance(sim.t, 2_000);

    if (n === 8) {
      const plan = await planOn(sim, day);
      const place = plan ? await sim.t.run(async (ctx) => await ctx.db.get("places", plan.placeId)) : null;
      expect(place?.indoor, "day 8 / the crew / the rainy day's plan is indoors").toBe(true);
    }

    await checkAll(sim);
  }

  expect(nudges.length, "day 11 / the crew / one thirst nudge, on the silent day").toBe(1);
  expect(nudges[0].day, "day 11 / the crew / the nudge lands on the eleventh day").toBe(11);
  await checkOutsiderIsRefused(sim);
  expect((await rows(sim, "frolics")).length, "the fortnight / the crew / one daily frolic per day").toBe(14);
  const seats = await rows(sim, "attendees");
  const frolics = await rows(sim, "frolics");
  const standing = frolics.filter(
    (frolic) =>
      frolic.status === "done" &&
      seats.filter((row) => row.frolicId === frolic._id && row.status === "going").length >= 2,
  );
  const flowers = (await gardenView(sim, "Maya")).collection.flowers;
  expect(flowers.length, "the fortnight / the garden / one flower per frolic that still stands").toBe(standing.length);
  expect(sim.ledger.capturedCents, "the fortnight / money / somebody was actually captured").toBeGreaterThan(0);
  expect(sim.ledger.refundedCents, "the fortnight / money / somebody was actually refunded").toBeGreaterThan(0);
  expect(sim.ledger.voidedCents, "the fortnight / money / somebody was actually released").toBeGreaterThan(0);
});

async function checkInAs(sim: Sim, name: string): Promise<void> {
  try {
    await checkIn(sim, name);
  } catch (e) {
    sim.ledger.bugs.push(`day ${sim.n} / ${name} / check in refused: ${(e as Error).message.slice(0, 80)}`);
  }
}

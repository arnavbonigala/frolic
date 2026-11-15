import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bestSet, lcg, pick, validSet, type OracleTap } from "./oracle";
import {
  makeTest,
  matchState,
  readAttendees,
  seed,
  settle,
  tapById,
  type Fixture,
} from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const NAMES = ["Maya", "Dev", "Jordan", "Priya", "Sam", "Ada"];

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return makeTest();
}

async function goingOf(t: any, f: Fixture) {
  const { frolic, attendees } = await matchState(t, f.frolicId);
  if (frolic.status !== "on") return null;
  return attendees
    .filter((a: any) => a.status === "going")
    .map((a: any) => a.userId as string)
    .sort();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("every revealed set satisfies every condition, on random tap graphs", () => {
  const seeds = Array.from({ length: 24 }, (_, i) => 7919 + i * 104729);

  for (const seedValue of seeds) {
    it(`scenario ${seedValue} only ever reveals a set whose conditions hold`, async () => {
      const rand = lcg(seedValue);
      const t = fresh();
      const f = await seed(t, { names: NAMES, durationMinutes: 60 });
      const frolicWindow = { start: NOW + HOUR, end: NOW + 5 * HOUR };

      const taps: OracleTap[] = [];
      for (const name of NAMES) {
        if (rand() < 0.25) continue;
        const onlyIf: string[] = [];
        if (rand() < 0.4) {
          const other = pick(rand, NAMES.filter((n) => n !== name));
          onlyIf.push(other);
        }
        const startHour = 0.5 + rand() * 3.5;
        const lengthHours = 0.75 + rand() * 2;
        const record: OracleTap = {
          userId: f.users[name],
          onlyIf: onlyIf.map((n) => f.users[n]),
          kind: rand() < 0.12 ? "notToday" : "down",
          window: {
            start: NOW + startHour * HOUR,
            end: NOW + (startHour + lengthHours) * HOUR,
          },
        };
        taps.push(record);
        await tapById(t, f, name, {
          kind: record.kind,
          onlyIf,
          window: record.window,
        }).catch(() => undefined);
      }
      await settle(t);

      const going = await goingOf(t, f);
      const expected = bestSet(taps, frolicWindow, 60 * MIN);

      if (going === null) {
        expect(
          expected,
          "the matcher found no set but one satisfies every condition",
        ).toBeNull();
        return;
      }

      expect(new Set(going).size, "no duplicate attendee for one person").toBe(going.length);
      const matchedTaps = taps.filter((x) => going.includes(x.userId));
      const slot = validSet(matchedTaps, frolicWindow, 60 * MIN);
      expect(
        slot,
        `revealed set ${JSON.stringify(going)} violates a condition: every onlyIf must be present and every window must overlap by the plan length`,
      ).not.toBeNull();
      for (const attendee of going) {
        const tap = taps.find((x) => x.userId === attendee);
        if (tap === undefined) continue;
        expect(tap.kind, "someone marked not today must never be an attendee").toBe("down");
      }
    });
  }
});

describe("the matcher agrees with brute force when the whole graph is known", () => {
  const seeds = Array.from({ length: 12 }, (_, i) => 31337 + i * 6151);

  for (const seedValue of seeds) {
    it(`scenario ${seedValue} picks the set a brute force search picks`, async () => {
      const rand = lcg(seedValue);
      const t = fresh();
      const f = await seed(t, { names: NAMES, durationMinutes: 60 });
      const frolicWindow = { start: NOW + HOUR, end: NOW + 5 * HOUR };

      const taps: OracleTap[] = [];
      const order = [...NAMES];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (const name of order) {
        if (rand() < 0.2) continue;
        const onlyIf: string[] = [];
        if (rand() < 0.3) onlyIf.push(pick(rand, NAMES.filter((n) => n !== name)));
        const tap: OracleTap = {
          userId: f.users[name],
          onlyIf: onlyIf.map((n) => f.users[n]),
          kind: "down",
          window: { start: NOW + (1 + rand() * 2) * HOUR, end: NOW + (4 + rand()) * HOUR },
        };
        taps.push(tap);
        await tapById(t, f, name, { onlyIf, window: tap.window }).catch(() => undefined);
      }
      await settle(t);

      const expected = bestSet(taps, frolicWindow, 60 * MIN);
      const going = await goingOf(t, f);
      if (going === null) {
        expect(expected, "the matcher stayed open but a valid set existed").toBeNull();
        return;
      }
      expect(expected, "a set was revealed, so brute force must find one").not.toBeNull();
      expect(going, "the revealed set must be the biggest, then the earliest").toEqual(
        expected!.members,
      );
    });
  }
});

describe("the revealed set survives a database round trip unchanged", () => {
  it("attendee rows match the pending reveal exactly once flipped", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Dev");
    await tapById(t, f, "Jordan");
    const { pending } = await matchState(t, f.frolicId);
    const scheduled = (pending!.userIds as string[]).slice().sort();
    await settle(t);
    const attendees = await readAttendees(t, f.frolicId);
    const going = attendees
      .filter((a: any) => a.status === "going")
      .map((a: any) => a.userId as string)
      .sort();
    expect(going, "the plan the phones flip to is the plan the matcher chose").toEqual(scheduled);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { bestSet, lcg, pick, validSet, type OracleTap } from "./oracle";
import { modules, readAttendees, readFrolic, seed, tapAs } from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const NAMES = ["Maya", "Dev", "Jordan", "Priya", "Sam", "Ada"];

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return convexTest(schema, modules);
}

async function settle(t: any) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("every revealed set is valid, on random tap graphs", () => {
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
        if (rand() < 0.45) {
          const other = pick(rand, NAMES.filter((n) => n !== name));
          onlyIf.push(other);
          if (rand() < 0.2) {
            const second = pick(rand, NAMES.filter((n) => n !== name && n !== other));
            onlyIf.push(second);
          }
        }
        const hasWindow = rand() < 0.5;
        const startHour = 0.5 + rand() * 3.5;
        const lengthHours = 0.75 + rand() * 2;
        const record: OracleTap = {
          userId: f.users[name],
          onlyIf: onlyIf.map((n) => f.users[n]),
          kind: rand() < 0.12 ? "notToday" : "down",
          window: hasWindow
            ? { start: NOW + startHour * HOUR, end: NOW + (startHour + lengthHours) * HOUR }
            : undefined,
        };
        taps.push(record);
        await tapAs(t, f, name, {
          kind: record.kind,
          onlyIf,
          window: record.window,
        });
        await settle(t);
      }

      const frolic = await readFrolic(t, f.frolicId);
      if (frolic.status !== "on") {
        const expected = bestSet(taps, frolicWindow, 60 * MIN);
        expect(
          expected,
          "the matcher found no set but one satisfies every condition",
        ).toBeNull();
        return;
      }

      const attendees = await readAttendees(t, f.frolicId);
      const going = attendees.filter((a: any) => a.status === "going");
      const goingIds = going.map((a: any) => a.userId);
      expect(new Set(goingIds).size, "no duplicate attendee for one person").toBe(goingIds.length);

      const matchedTaps = taps.filter((x) => goingIds.includes(x.userId));
      const slot = validSet(matchedTaps, frolicWindow, 60 * MIN);
      expect(
        slot,
        `revealed set ${JSON.stringify(goingIds)} violates a condition: every onlyIf must be present and every window must overlap by the plan length`,
      ).not.toBeNull();

      for (const attendee of going) {
        const tap = taps.find((x) => x.userId === attendee.userId);
        if (tap === undefined) continue;
        expect(tap.kind, "someone marked not today must never be an attendee").toBe("down");
      }
    });
  }
});

describe("the matcher agrees with the oracle when the set is decided once", () => {
  const seeds = Array.from({ length: 12 }, (_, i) => 31337 + i * 6151);

  for (const seedValue of seeds) {
    it(`scenario ${seedValue} picks the same set a brute force search picks`, async () => {
      const rand = lcg(seedValue);
      const t = fresh();
      const f = await seed(t, { names: NAMES, durationMinutes: 60 });
      const frolicWindow = { start: NOW + HOUR, end: NOW + 5 * HOUR };

      const taps: OracleTap[] = [];
      const order = [...NAMES].sort(() => rand() - 0.5);
      let turnedOnAt = -1;
      for (let i = 0; i < order.length; i++) {
        const name = order[i];
        if (rand() < 0.2) continue;
        const onlyIf: string[] = [];
        if (rand() < 0.3) onlyIf.push(pick(rand, NAMES.filter((n) => n !== name)));
        const record: OracleTap = {
          userId: f.users[name],
          onlyIf: onlyIf.map((n) => f.users[n]),
          kind: "down",
          window: { start: NOW + (1 + rand() * 2) * HOUR, end: NOW + (4 + rand()) * HOUR },
        };
        taps.push(record);
        await tapAs(t, f, name, { onlyIf, window: record.window });
        await settle(t);
        const frolic = await readFrolic(t, f.frolicId);
        if (frolic.status === "on") {
          turnedOnAt = i;
          break;
        }
      }

      const expected = bestSet(taps, frolicWindow, 60 * MIN);
      if (turnedOnAt === -1) {
        expect(expected, "the matcher stayed open but a valid set existed").toBeNull();
        return;
      }
      if (turnedOnAt !== taps.length - 1) return;

      const attendees = await readAttendees(t, f.frolicId);
      const going = attendees
        .filter((a: any) => a.status === "going")
        .map((a: any) => a.userId)
        .sort();
      expect(expected, "a set was revealed, so the oracle must find one").not.toBeNull();
      expect(going, "the revealed set must be the biggest, then the earliest").toEqual(
        expected!.members,
      );
    });
  }
});

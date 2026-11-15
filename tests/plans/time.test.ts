import { describe, expect, test } from "vitest";
import { addDays, clockLabel, dateLabel, daysBetween, localParts, localTimeToMs, solarTimes, weekdayOf } from "../../convex/plans/time";

const DAY = "2026-11-15";

describe("pacific time", () => {
  test("reads local parts in Pacific time", () => {
    expect(localParts(localTimeToMs(DAY, 18 * 60))).toEqual({ day: DAY, weekday: 0, minutes: 18 * 60 });
    expect(clockLabel(localTimeToMs(DAY, 16 * 60 + 58))).toBe("4:58");
    expect(clockLabel(localTimeToMs(DAY, 0))).toBe("12:00");
    expect(clockLabel(localTimeToMs(DAY, 12 * 60 + 5))).toBe("12:05");
  });

  test("round trips minute of day through both DST changes", () => {
    for (const day of ["2026-03-08", "2026-07-04", "2026-11-01", "2026-11-15", "2026-12-31"]) {
      for (const minutes of [0, 6 * 60, 12 * 60, 16 * 60 + 58, 23 * 60 + 45]) {
        expect(localParts(localTimeToMs(day, minutes)).minutes).toBe(minutes);
      }
    }
  });

  test("moves across days and DST", () => {
    expect(addDays(DAY, 1)).toBe("2026-11-16");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetween("2026-11-08", DAY)).toBe(7);
    expect(weekdayOf(DAY)).toBe(0);
    expect(dateLabel(DAY)).toBe("Nov 15");
  });

  test("computes the Berkeley sunset close to the almanac", () => {
    const { sunsetMs } = solarTimes(DAY);
    expect(Math.abs(sunsetMs - localTimeToMs(DAY, 16 * 60 + 58))).toBeLessThan(4 * 60 * 1000);
    const summer = solarTimes("2026-06-21");
    const winter = solarTimes("2026-12-21");
    expect(Math.abs(summer.sunsetMs - localTimeToMs("2026-06-21", 20 * 60 + 35))).toBeLessThan(15 * 60 * 1000);
    expect(localParts(winter.sunsetMs).minutes).toBeLessThan(localParts(summer.sunsetMs).minutes - 120);
  });
});

const MINUTE = 60_000;
const FALL_BACK = "2026-11-01";
const SPRING_FORWARD = "2026-03-08";

describe("the day the clocks go back", () => {
  test("the local day lasts twenty five hours", () => {
    const start = localTimeToMs(FALL_BACK, 0);
    const next = localTimeToMs(addDays(FALL_BACK, 1), 0);
    expect(new Date(start).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(new Date(next).toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(next - start).toBe(25 * 60 * MINUTE);
  });

  test("a window that spans the repeated hour runs three real hours", () => {
    const start = localTimeToMs(FALL_BACK, 30);
    const end = localTimeToMs(FALL_BACK, 150);
    expect(localParts(end).minutes - localParts(start).minutes).toBe(120);
    expect(end - start).toBe(3 * 60 * MINUTE);
  });

  test("a wall minute inside the repeated hour maps to one instant", () => {
    const once = localTimeToMs(FALL_BACK, 90);
    expect(localTimeToMs(FALL_BACK, 90)).toBe(once);
    expect(new Date(once).toISOString()).toBe("2026-11-01T08:30:00.000Z");
    expect(localParts(once)).toEqual({ day: FALL_BACK, weekday: 0, minutes: 90 });
  });

  test("a drop inside the repeated hour fires once, in order", () => {
    const before = localTimeToMs(FALL_BACK, 60);
    const drop = localTimeToMs(FALL_BACK, 90);
    const after = localTimeToMs(FALL_BACK, 180);
    expect(new Date(before).toISOString()).toBe("2026-11-01T08:00:00.000Z");
    expect(new Date(drop).toISOString()).toBe("2026-11-01T08:30:00.000Z");
    expect(new Date(after).toISOString()).toBe("2026-11-01T11:00:00.000Z");
    expect(drop - before).toBe(30 * MINUTE);
    expect(after - drop).toBe(150 * MINUTE);
  });

  test("a reveal timestamp inside the repeated hour is one instant", () => {
    const revealAt = localTimeToMs(FALL_BACK, 105);
    expect(localTimeToMs(FALL_BACK, 105)).toBe(revealAt);
    expect(localParts(revealAt).minutes).toBe(105);
    expect(revealAt).toBeGreaterThan(localTimeToMs(FALL_BACK, 104));
    expect(revealAt).toBeLessThan(localTimeToMs(FALL_BACK, 106));
    expect(revealAt - localTimeToMs(FALL_BACK, 104)).toBe(MINUTE);
  });
});

describe("the day the clocks go forward", () => {
  test("the local day lasts twenty three hours", () => {
    const start = localTimeToMs(SPRING_FORWARD, 0);
    const next = localTimeToMs(addDays(SPRING_FORWARD, 1), 0);
    expect(new Date(start).toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(new Date(next).toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(next - start).toBe(23 * 60 * MINUTE);
  });

  test("a wall minute the clock skips lands on the transition, never an hour early", () => {
    const transition = localTimeToMs(SPRING_FORWARD, 180);
    expect(new Date(transition).toISOString()).toBe("2026-03-08T10:00:00.000Z");
    expect(localTimeToMs(SPRING_FORWARD, 119)).toBe(transition - MINUTE);
    for (let minute = 120; minute < 180; minute++) expect(localTimeToMs(SPRING_FORWARD, minute)).toBe(transition);
  });
});

describe("one wall minute, one instant", () => {
  test("a later wall minute never maps to an earlier instant", () => {
    for (const day of [DAY, FALL_BACK, SPRING_FORWARD, "2026-06-21"]) {
      let prev = -Infinity;
      for (let minute = 0; minute < 1440; minute++) {
        const ms = localTimeToMs(day, minute);
        expect(ms).toBeGreaterThanOrEqual(prev);
        prev = ms;
      }
    }
  });

  test("every wall minute that exists round trips", () => {
    for (const day of [DAY, FALL_BACK, SPRING_FORWARD, "2026-06-21"]) {
      for (let minute = 0; minute < 1440; minute++) {
        const skipped = day === SPRING_FORWARD && minute >= 120 && minute < 180;
        if (skipped) continue;
        expect(localParts(localTimeToMs(day, minute))).toEqual({ day, weekday: weekdayOf(day), minutes: minute });
      }
    }
  });
});

describe("midnight", () => {
  test("a plan at 23:50 that expires at 00:10 crosses midnight once", () => {
    const start = localTimeToMs(DAY, 23 * 60 + 50);
    const end = localTimeToMs(addDays(DAY, 1), 10);
    expect(end - start).toBe(20 * MINUTE);
    expect(localParts(start)).toEqual({ day: DAY, weekday: 0, minutes: 1430 });
    expect(localParts(end)).toEqual({ day: "2026-11-16", weekday: 1, minutes: 10 });
    expect(localTimeToMs(DAY, 24 * 60 + 10)).toBe(end);
  });

  test("the plan day is Pacific while the server clock is UTC", () => {
    const evening = Date.UTC(2026, 10, 16, 3, 0);
    expect(localParts(evening)).toEqual({ day: DAY, weekday: 0, minutes: 19 * 60 });
    expect(localTimeToMs(DAY, 19 * 60)).toBe(evening);
    const newYork = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric" }).format(
      new Date(evening),
    );
    expect(newYork).toBe("11/15/2026");
    expect(new Date(evening).toISOString().slice(0, 10)).toBe("2026-11-16");
  });

  test("a date string crosses midnight local before it crosses it in UTC", () => {
    const localNight = Date.UTC(2026, 10, 1, 2, 0);
    expect(localParts(localNight).day).toBe("2026-10-31");
    expect(new Date(localNight).toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(localTimeToMs("2026-10-31", 19 * 60)).toBe(localNight);
  });
});

describe("the sun", () => {
  const near = (ms: number, day: string, minute: number) => expect(Math.abs(ms - localTimeToMs(day, minute))).toBeLessThan(4 * MINUTE);

  test("sunrise and sunset land on the almanac minute at both solstices", () => {
    const june = solarTimes("2026-06-21");
    near(june.sunriseMs, "2026-06-21", 5 * 60 + 47);
    near(june.sunsetMs, "2026-06-21", 20 * 60 + 35);
    const december = solarTimes("2026-12-21");
    near(december.sunriseMs, "2026-12-21", 7 * 60 + 21);
    near(december.sunsetMs, "2026-12-21", 16 * 60 + 53);
    expect(localParts(june.sunriseMs).minutes).toBeLessThan(localParts(december.sunriseMs).minutes);
    expect(localParts(june.sunsetMs).minutes).toBeGreaterThan(localParts(december.sunsetMs).minutes);
  });

  test("a golden hour before an eight o'clock sunset stays before it", () => {
    const golden = 30;
    const june = solarTimes("2026-06-21");
    expect(localParts(june.sunsetMs - golden * MINUTE).minutes).toBe(20 * 60 + 4);
    expect(clockLabel(june.sunsetMs - golden * MINUTE)).toBe("8:04");
    expect(clockLabel(june.sunsetMs)).toBe("8:34");
    for (const day of ["2026-06-21", "2026-07-15", "2026-08-01"]) {
      const { sunsetMs } = solarTimes(day);
      const starts = sunsetMs - golden * MINUTE;
      expect(localParts(sunsetMs).minutes).toBeGreaterThanOrEqual(20 * 60);
      expect(starts).toBeLessThan(sunsetMs);
      expect(localParts(starts).minutes).toBeGreaterThanOrEqual(19 * 60);
      expect(sunsetMs - starts).toBe(golden * MINUTE);
    }
  });

  test("reads the evening and after midnight on a twelve hour clock", () => {
    expect(clockLabel(localTimeToMs(DAY, 20 * 60 + 34))).toBe("8:34");
    expect(clockLabel(localTimeToMs(DAY, 0))).toBe("12:00");
    expect(clockLabel(localTimeToMs(DAY, 4))).toBe("12:04");
    expect(clockLabel(localTimeToMs(DAY, 12 * 60))).toBe("12:00");
  });
});

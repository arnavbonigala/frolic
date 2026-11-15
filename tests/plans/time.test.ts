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

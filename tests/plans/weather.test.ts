import { describe, expect, test, vi } from "vitest";
import { localTimeToMs } from "../../convex/plans/time";
import { WEATHER_TIMEOUT_MS, conditionLabel, fetchWeather, hourAt, isRainy, openMeteoUrl, parseOpenMeteo } from "../../convex/plans/weather";

const DAY = "2026-11-15";
const body = (over: Record<string, unknown> = {}) => ({
  hourly: {
    time: Array.from({ length: 4 }, (_, i) => localTimeToMs(DAY, 15 * 60) / 1000 + i * 3600),
    temperature_2m: [58, 60, 62, 61],
    precipitation_probability: [5, 80, 10, 10],
    weather_code: [0, 63, 1, 2],
    cloud_cover: [10, 95, 40, 80],
  },
  daily: { sunrise: [localTimeToMs(DAY, 6 * 60) / 1000], sunset: [localTimeToMs(DAY, 16 * 60 + 58) / 1000] },
  ...over,
});

describe("open meteo", () => {
  test("asks for the day in GMT unix time", () => {
    const url = openMeteoUrl("2026-11-15");
    expect(url).toContain("start_date=2026-11-15");
    expect(url).toContain("end_date=2026-11-15");
    expect(url).toContain("timeformat=unixtime");
    expect(url).toContain("temperature_unit=fahrenheit");
  });

  test("parses hours and sun times", () => {
    const day = parseOpenMeteo(body());
    expect(day.hourly).toHaveLength(4);
    expect(day.hourly[0].tempF).toBe(58);
    expect(day.sunsetMs).toBe(localTimeToMs(DAY, 16 * 60 + 58));
    expect(hourAt(day, localTimeToMs(DAY, 16 * 60) + 60000)?.tempF).toBe(60);
    expect(hourAt(day, localTimeToMs(DAY, 23 * 60))).toBeNull();
    expect(hourAt(null, 0)).toBeNull();
  });

  test("knows rain from a heavy code or a high chance", () => {
    const day = parseOpenMeteo(body());
    expect(isRainy(day.hourly[0])).toBe(false);
    expect(isRainy(day.hourly[1])).toBe(true);
    expect(isRainy({ timeMs: 0, tempF: 60, precipProb: 60, code: 1, cloudCover: 10 })).toBe(true);
    expect(conditionLabel(day.hourly[0])).toBe("Clear");
    expect(conditionLabel(day.hourly[1])).toBe("Rain");
    expect(conditionLabel(day.hourly[2])).toBe("Partly cloudy");
    expect(conditionLabel(day.hourly[3])).toBe("Cloudy");
  });

  test("throws rather than inventing weather", () => {
    expect(() => parseOpenMeteo({})).toThrow(/no hourly data/);
    expect(() => parseOpenMeteo({ hourly: { time: [0], temperature_2m: [60] } })).toThrow(/no sun times/);
  });

  test("gives up on a slow forecast", async () => {
    const hang = vi.fn((_url: unknown, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    await expect(fetchWeather(DAY, hang as unknown as typeof fetch, 10)).rejects.toThrow();
    const down = vi.fn(async () => new Response("no", { status: 503 }));
    await expect(fetchWeather(DAY, down as unknown as typeof fetch)).rejects.toThrow(/http 503/);
    expect(WEATHER_TIMEOUT_MS).toBe(6000);
  });

  test("fetches a real shaped body", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(body()), { status: 200 }));
    const day = await fetchWeather(DAY, ok as unknown as typeof fetch);
    expect(day.hourly).toHaveLength(4);
  });
});

describe("the group's own day", () => {
  test("asks open meteo for the local day so the evening is covered", () => {
    const url = openMeteoUrl(DAY);
    expect(url).toContain("timezone=America%2FLos_Angeles");
    expect(url).toContain("start_date=" + DAY);
    expect(url).toContain("end_date=" + DAY);
    const localDay = (day: string) =>
      Array.from({ length: 24 }, (_, hour) => localTimeToMs(day, hour * 60) / 1000);
    const hours = localDay(DAY);
    const parsed = parseOpenMeteo({
      hourly: {
        time: hours,
        temperature_2m: hours.map(() => 57),
        precipitation_probability: hours.map(() => 0),
        weather_code: hours.map(() => 0),
        cloud_cover: hours.map(() => 20),
      },
      daily: { sunrise: [localTimeToMs(DAY, 6 * 60 + 49) / 1000], sunset: [localTimeToMs(DAY, 16 * 60 + 58) / 1000] },
    });
    for (const minute of [4 * 60, 9 * 60, 16 * 60 + 58, 18 * 60, 20 * 60, 23 * 60]) {
      expect(hourAt(parsed, localTimeToMs(DAY, minute))).not.toBeNull();
    }
    expect(hourAt(parsed, parsed.sunsetMs)?.tempF).toBe(57);
  });

  test("the sunset hour carries the rain a plan needs to see", () => {
    const body = {
      hourly: {
        time: [localTimeToMs(DAY, 12 * 60) / 1000, localTimeToMs(DAY, 17 * 60) / 1000],
        temperature_2m: [55, 53],
        precipitation_probability: [10, 90],
        weather_code: [1, 63],
        cloud_cover: [20, 95],
      },
      daily: { sunrise: [localTimeToMs(DAY, 6 * 60 + 49) / 1000], sunset: [localTimeToMs(DAY, 16 * 60 + 58) / 1000] },
    };
    const parsed = parseOpenMeteo(body);
    expect(isRainy(hourAt(parsed, parsed.sunsetMs))).toBe(true);
  });
});

describe("a forecast with holes", () => {
  test("an hour the feed leaves blank is missing, not sixty degrees", () => {
    const holed = body();
    holed.hourly.temperature_2m[1] = null as unknown as number;
    const parsed = parseOpenMeteo(holed);
    expect(parsed.hourly.map((h) => h.tempF)).toEqual([58, 62, 61]);
    expect(parsed.hourly.some((h) => h.timeMs === localTimeToMs(DAY, 16 * 60))).toBe(false);
  });

  test("an hour with no cloud cover is missing", () => {
    const holed = body();
    holed.hourly.cloud_cover[3] = null as unknown as number;
    expect(parseOpenMeteo(holed).hourly).toHaveLength(3);
  });

  test("a body with no usable hour throws rather than inventing weather", () => {
    expect(() =>
      parseOpenMeteo({
        hourly: { time: [localTimeToMs(DAY, 15 * 60) / 1000], temperature_2m: [null], weather_code: [0], cloud_cover: [10], precipitation_probability: [0] },
        daily: { sunrise: [1], sunset: [2] },
      }),
    ).toThrow(/no usable hours/);
  });

  test("a null body throws", async () => {
    const empty = vi.fn(async () => new Response("null", { status: 200 }));
    await expect(fetchWeather(DAY, empty as unknown as typeof fetch)).rejects.toThrow(/no hourly data/);
  });

  test("a failed read leaves no weather at all", () => {
    expect(hourAt(null, localTimeToMs(DAY, 18 * 60))).toBeNull();
  });
});

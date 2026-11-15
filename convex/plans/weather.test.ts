import { describe, expect, test, vi } from "vitest";
import { localTimeToMs } from "./time";
import { WEATHER_TIMEOUT_MS, conditionLabel, fetchWeather, hourAt, isRainy, openMeteoUrl, parseOpenMeteo } from "./weather";

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

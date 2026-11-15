import { BERKELEY } from "./time";

export type HourWeather = { timeMs: number; tempF: number; precipProb: number; code: number; cloudCover: number };
export type DayWeather = { hourly: HourWeather[]; sunriseMs: number; sunsetMs: number };

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export function openMeteoUrl(day: string, lat = BERKELEY.lat, lng = BERKELEY.lng): string {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: "temperature_2m,precipitation_probability,weather_code,cloud_cover",
    daily: "sunrise,sunset",
    temperature_unit: "fahrenheit",
    timezone: "GMT",
    timeformat: "unixtime",
    start_date: day,
    end_date: day,
  });
  return OPEN_METEO_URL + "?" + q.toString();
}

export function parseOpenMeteo(body: unknown): DayWeather {
  const b = body as {
    hourly?: { time?: number[]; temperature_2m?: number[]; precipitation_probability?: (number | null)[]; weather_code?: number[]; cloud_cover?: number[] };
    daily?: { sunrise?: number[]; sunset?: number[] };
  };
  const hr = b?.hourly;
  const times = hr?.time;
  if (!Array.isArray(times) || times.length === 0 || !Array.isArray(hr?.temperature_2m)) throw new Error("weather: no hourly data");
  const sunrise = b.daily?.sunrise?.[0];
  const sunset = b.daily?.sunset?.[0];
  if (typeof sunrise !== "number" || typeof sunset !== "number") throw new Error("weather: no sun times");
  return {
    sunriseMs: sunrise * 1000,
    sunsetMs: sunset * 1000,
    hourly: times.map((t, i) => ({
      timeMs: t * 1000,
      tempF: Math.round(hr.temperature_2m![i] ?? 60),
      precipProb: hr.precipitation_probability?.[i] ?? 0,
      code: hr.weather_code?.[i] ?? 0,
      cloudCover: hr.cloud_cover?.[i] ?? 0,
    })),
  };
}

export const WEATHER_TIMEOUT_MS = 6000;

export async function fetchWeather(day: string, fetcher: typeof fetch = fetch, timeoutMs = WEATHER_TIMEOUT_MS): Promise<DayWeather> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(openMeteoUrl(day), { signal: controller.signal });
    if (!res.ok) throw new Error("weather: http " + res.status);
    return parseOpenMeteo(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export function hourAt(weather: DayWeather | null, ms: number): HourWeather | null {
  if (!weather || weather.hourly.length === 0) return null;
  let best = weather.hourly[0];
  for (const h of weather.hourly) if (Math.abs(h.timeMs - ms) < Math.abs(best.timeMs - ms)) best = h;
  return Math.abs(best.timeMs - ms) <= 90 * 60_000 ? best : null;
}

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

export function isRainy(h: HourWeather | null): boolean {
  return !!h && (h.precipProb >= 50 || RAIN_CODES.has(h.code));
}

export function isClear(h: HourWeather | null): boolean {
  return !!h && !isRainy(h) && h.cloudCover < 60;
}

export function conditionLabel(h: HourWeather): string {
  if (isRainy(h)) return "Rain";
  if (h.cloudCover < 30) return "Clear";
  if (h.cloudCover < 70) return "Partly cloudy";
  return "Cloudy";
}

export const TIME_ZONE = "America/Los_Angeles";
export const BERKELEY = { lat: 37.8716, lng: -122.2727 };
const MINUTE = 60_000;
const DAY_MS = 86_400_000;

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type LocalParts = { day: string; weekday: number; minutes: number };

export function localParts(ms: number): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return {
    day: parts.year + "-" + parts.month + "-" + parts.day,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function localTimeToMs(day: string, minutes: number): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d) + minutes * MINUTE + 8 * 60 * MINUTE;
  const p = localParts(guess);
  const drift = (Date.UTC(...ymd(p.day)) - Date.UTC(y, m - 1, d)) / MINUTE + p.minutes - minutes;
  return guess - drift * MINUTE;
}

function ymd(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m - 1, d];
}

export function addDays(day: string, n: number): string {
  const t = Date.UTC(...ymd(day)) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(...ymd(to)) - Date.UTC(...ymd(from))) / DAY_MS);
}

export function weekdayOf(day: string): number {
  return new Date(Date.UTC(...ymd(day))).getUTCDay();
}

export function clockLabel(ms: number): string {
  const { minutes } = localParts(ms);
  const h = Math.floor(minutes / 60) % 12 || 12;
  return h + ":" + String(minutes % 60).padStart(2, "0");
}

export function dateLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[m - 1] + " " + d;
}

export function solarTimes(day: string, lat = BERKELEY.lat, lng = BERKELEY.lng): { sunriseMs: number; sunsetMs: number } {
  const rad = Math.PI / 180;
  const noonUtc = Date.UTC(...ymd(day)) + 12 * 3_600_000;
  const n = Math.round(noonUtc / DAY_MS - 10957.5 + 0.0008);
  const jStar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit = 2451545 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const decl = Math.asin(Math.sin(lambda * rad) * Math.sin(23.4397 * rad));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad;
  const toMs = (j: number) => Math.round((j - 2440587.5) * DAY_MS);
  return { sunriseMs: toMs(jTransit - H / 360), sunsetMs: toMs(jTransit + H / 360) };
}

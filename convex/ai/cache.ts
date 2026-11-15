import type { DropInput } from "../plans/engine";

export function pickCacheKey(input: DropInput): string {
  const parts = [
    input.day,
    input.kind,
    input.seed,
    input.attendees.map((a) => a.userId).sort().join("+"),
    input.attendees.map((a) => Math.round(a.window.start / 60000) + "-" + Math.round(a.window.end / 60000)).join(","),
    input.attendees.map((a) => a.taste.join("|")).join(","),
    input.memory.likedTags.join("|"),
    input.memory.suppressed.join("|"),
    input.memory.skipped.map((s) => s.tag + ":" + s.count).join("|"),
    input.weather ? String(input.weather.sunsetMs) : "no-sun",
    input.nowMs > 0 ? Math.floor(input.nowMs / 900000) : 0,
  ];
  return parts.join("~");
}

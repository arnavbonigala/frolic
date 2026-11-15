import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export const DEFAULT_WALK_MINUTES = 10;
export const CHECKIN_RADIUS_METERS = 400;

export function clockTime(ms: number, timeZone: string): string {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
  return text.replace(/[\s\u202f]?(AM|PM)$/i, "");
}

function zoneOffset(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

export function parseClock(text: string): { hour: number; minute: number } | null {
  const match = text.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3];
  if (minute > 59 || hour > 23) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 11) hour += 12;
  return { hour, minute };
}

export function localTimeOnSameDay(referenceMs: number, hour: number, minute: number, timeZone: string): number {
  const offset = zoneOffset(referenceMs, timeZone);
  const local = new Date(referenceMs + offset);
  const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute);
  return guess - zoneOffset(guess - offset, timeZone);
}

export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

export function parseSharedLocation(text: string): { lat: number; lng: number } | null {
  const patterns = [
    /[?&](?:ll|q|sll)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /geo:(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export async function linkForPhone(ctx: QueryCtx, phone: string) {
  return await ctx.db
    .query("keikiLinks")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .unique();
}

export async function crewOf(ctx: QueryCtx, userId: Id<"users">) {
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  if (!membership) return null;
  const group = await ctx.db.get("groups", membership.groupId);
  return group ? { membership, group } : null;
}

export async function crewMembers(ctx: QueryCtx, groupId: Id<"groups">) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .take(64);
  const users = await Promise.all(memberships.map((m) => ctx.db.get("users", m.userId)));
  return users.filter((u): u is Doc<"users"> => u !== null);
}

export async function currentFrolic(ctx: QueryCtx, groupId: Id<"groups">) {
  return await ctx.db
    .query("frolics")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId))
    .order("desc")
    .first();
}

export function isRevealed(frolic: Doc<"frolics">, now: number): boolean {
  return (
    (frolic.status === "on" || frolic.status === "done" || frolic.status === "matched") &&
    frolic.revealAt !== undefined &&
    now >= frolic.revealAt
  );
}

export async function goingAttendees(ctx: QueryCtx, frolicId: Id<"frolics">) {
  const rows = await ctx.db
    .query("attendees")
    .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
    .take(64);
  return rows.filter((row) => row.status === "going");
}

export async function planDetails(ctx: QueryCtx, frolic: Doc<"frolics">, timeZone: string, walkMinutes: number) {
  const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
  const place = plan ? await ctx.db.get("places", plan.placeId) : null;
  const startsAt = frolic.startsAt ?? plan?.startsAt ?? frolic.window.start;
  const leaveAt = startsAt - walkMinutes * 60_000;
  return {
    plan,
    place,
    startsAt,
    leaveAt,
    view: {
      title: plan?.title ?? place?.name ?? "Today's plan",
      line: plan?.line ?? null,
      place: place?.name ?? null,
      neighborhood: place?.neighborhood ?? null,
      meetingPoint: plan?.meetingPoint?.label ?? place?.name ?? null,
      startsAt: clockTime(startsAt, timeZone),
      leaveAt: clockTime(leaveAt, timeZone),
      walkMinutes,
      cost: plan ? (plan.cost === 0 ? "Free" : "$" + plan.cost) : null,
      weather: plan?.weather ?? null,
      why: plan?.why ?? null,
    },
  };
}

export function meetingCoords(
  plan: Doc<"plans"> | null,
  place: Doc<"places"> | null,
): { lat: number; lng: number } | null {
  if (plan?.meetingPoint) return { lat: plan.meetingPoint.lat, lng: plan.meetingPoint.lng };
  if (place) return { lat: place.lat, lng: place.lng };
  return null;
}

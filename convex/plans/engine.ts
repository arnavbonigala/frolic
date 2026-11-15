import { BERKELEY_PLACES, PLACE_BY_SLUG, heroKeyFor, type HeroKey, type Place, type PlaceTag, type TimeOfDay, type WeekHours } from "../places/data";
import { citeWhy, unbackedClaim } from "../memory/why";
import { crowdWeight } from "./crowd";
import type { MemoryContext } from "./memoryContext";
import { addDays, clockLabel, daysBetween, localParts, localTimeToMs, solarTimes } from "./time";
import { conditionLabel, hourAt, isClear, isRainy, type DayWeather, type HourWeather } from "./weather";
import { tripLabel, tripTo, type LatLng, type Trip } from "./travel";

export type Limits = { budgetCents: number | null; energy: "chill" | "anything"; maxMinutes: number | null; homeBy: number | null };
export type Attendee = { userId: string; limits: Limits; origin: LatLng | null; window: { start: number; end: number }; taste: string[] };
export type HistoryEntry = { day: string; placeSlug: string; favoredUserId: string | null };
export type DropKind = "daily" | "weekend" | "solo" | "free";
export type DropOffer = {
  dropId: string;
  sellerName: string;
  title: string;
  priceCents: number;
  seatsLeft: number;
  placeSlug: string;
  tags: string[];
  validDays: number[];
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
};

export type DropInput = {
  day: string;
  kind: DropKind;
  seed: string;
  nowMs: number;
  attendees: Attendee[];
  weather: DayWeather | null;
  memory: MemoryContext;
  history: HistoryEntry[];
  lastFrolicDay: string | null;
  places?: Place[];
  drops?: DropOffer[];
};

export type Candidate = {
  place: Place;
  startMs: number;
  endMs: number;
  freeCount: number;
  trips: Record<string, Trip>;
  maxTrip: Trip;
  hour: HourWeather | null;
  rainy: boolean;
  golden: boolean;
  comeback: boolean;
  dryScore: number;
  score: number;
};

export type WhySource = "template" | "memory" | "device" | "haiku";
export type WhyInputs = {
  placeName: string;
  memory: string | null;
  topTags: string[];
  weather: string | null;
  tempF: number | null;
  sunsetAt: number;
  rainSwap: boolean;
};

export type Plan = {
  placeSlug: string;
  heroKey: HeroKey;
  title: string;
  line: string;
  why: string;
  whySource: WhySource;
  whyMemoryId: string | null;
  whyInputs: WhyInputs;
  chips: string[];
  startsAt: number;
  endsAt: number;
  durationMinutes: number;
  meetingPoint: { lat: number; lng: number; label: string };
  costPerPersonCents: number;
  costLabel: string;
  payUpFront: boolean;
  favoredUserId: string | null;
  weatherSwap: boolean;
  sunsetAt: number;
  weather: string | null;
  source: "scorer" | "model" | "fallback";
  candidates: string[];
  minutesAway: Record<string, number>;
  drop: { dropId: string; sellerName: string; priceCents: number } | null;
};

const MINUTE = 60_000;
const SLOT = 15 * MINUTE;

export const TAG_LABEL: Record<PlaceTag, string> = {
  sunsets: "sunsets",
  views: "big views",
  outdoors: "being outside",
  free: "free stuff",
  hiking: "a good hike",
  picnic: "picnics",
  food: "good food",
  late_night_food: "late-night food",
  dessert: "dessert",
  coffee: "coffee",
  boba: "boba",
  games: "games",
  books: "books",
  music: "music",
  art: "art",
  science: "science",
  nature: "nature",
  water: "being near the water",
  animals: "animals",
  market: "markets",
  climbing: "climbing",
  play: "being a little silly",
  campus: "campus spots",
  city_trip: "trips to the city",
};

const SYNONYMS: Record<string, PlaceTag[]> = {
  sunset: ["sunsets"],
  golden_hour: ["sunsets"],
  late_night: ["late_night_food"],
  pizza: ["food"],
  board_games: ["games"],
  board_game: ["games"],
  bowling: ["games"],
  free_stuff: ["free"],
  beach: ["water"],
  beach_day: ["water", "outdoors"],
  climbing: ["climbing"],
  hike: ["hiking"],
  hikes: ["hiking"],
  campus: ["campus"],
  ice_cream: ["dessert"],
  donuts: ["dessert"],
  tea: ["boba"],
  bubble_tea: ["boba"],
  records: ["music"],
  vinyl: ["music"],
  jazz: ["music"],
  museum: ["art"],
  museums: ["art"],
  dogs: ["animals"],
  goats: ["animals"],
  bart: ["city_trip"],
  sf: ["city_trip"],
  the_city: ["city_trip"],
};

export function normalizeTag(raw: string): PlaceTag[] {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key in TAG_LABEL) return [key as PlaceTag];
  if (SYNONYMS[key]) return SYNONYMS[key];
  if (key.endsWith("s") && key.slice(0, -1) in TAG_LABEL) return [key.slice(0, -1) as PlaceTag];
  return [];
}

export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

type Blocked = { slugs: Set<string>; tags: Set<PlaceTag>; onceSlugs: Set<string>; onceTags: Set<PlaceTag> };

export function blockedBySkips(memory: MemoryContext): Blocked {
  const b: Blocked = { slugs: new Set(), tags: new Set(), onceSlugs: new Set(), onceTags: new Set() };
  const add = (raw: string, hard: boolean) => {
    const slug = raw.trim().toLowerCase();
    (hard ? b.slugs : b.onceSlugs).add(slug);
    for (const t of normalizeTag(raw)) (hard ? b.tags : b.onceTags).add(t);
  };
  for (const s of memory.suppressed) add(s, true);
  for (const s of memory.skipped) add(s.tag, s.count >= 2);
  return b;
}

const isBlocked = (p: Place, b: Blocked) => b.slugs.has(p.slug) || (p.tags[0] !== undefined && b.tags.has(p.tags[0]));

export function favoredUser(attendees: Attendee[], history: HistoryEntry[], seed: string): string | null {
  if (attendees.length === 0) return null;
  const last = new Map<string, string>();
  for (const h of history) if (h.favoredUserId && (last.get(h.favoredUserId) ?? "") < h.day) last.set(h.favoredUserId, h.day);
  return [...attendees]
    .sort((a, b) => {
      const la = last.get(a.userId) ?? "";
      const lb = last.get(b.userId) ?? "";
      if (la !== lb) return la < lb ? -1 : 1;
      return hash01(seed + a.userId) - hash01(seed + b.userId);
    })[0].userId;
}

function withinLimits(place: Place, a: Attendee, trip: Trip): boolean {
  const l = a.limits;
  if (l.budgetCents !== null && place.costPerPersonCents > l.budgetCents) return false;
  if (l.energy === "chill" && place.energy !== "chill") return false;
  if (l.maxMinutes !== null && trip.minutes > l.maxMinutes) return false;
  return true;
}

export function isOpenFor(place: Place, startMs: number, minutes: number): boolean {
  const { weekday, minutes: m } = localParts(startMs);
  const end = m + minutes;
  if (place.hours[weekday].some(([o, c]) => o <= m && end <= c)) return true;
  const prev = place.hours[(weekday + 6) % 7];
  return prev.some(([, c]) => c > 1440 && end + 1440 <= c);
}

function timeFit(place: Place, startMs: number, sunsetMs: number, rainy: boolean): number {
  const local = localParts(startMs).minutes;
  let fit = 0;
  if (place.bestTimes.includes("golden_hour") && !rainy) {
    const ideal = sunsetMs - 45 * MINUTE;
    fit = Math.max(fit, (place.tags.includes("sunsets") ? 20 : 8) * Math.max(0, 1 - Math.abs(startMs - ideal) / (90 * MINUTE)));
  }
  if (place.bestTimes.includes("late_night") && local >= 21 * 60) fit = Math.max(fit, 12);
  if (place.bestTimes.includes("morning") && local < 11 * 60) fit = Math.max(fit, 8);
  if (place.bestTimes.includes("daytime") && local >= 11 * 60 && startMs <= sunsetMs - 60 * MINUTE) fit = Math.max(fit, 6);
  return fit;
}

type Ctx = {
  input: DropInput;
  sunriseMs: number;
  sunsetMs: number;
  dayStartMs: number;
  need: number;
  weights: Map<PlaceTag, number>;
  favored: string | null;
  blocked: Blocked;
  comebackSlug: string | null;
  relaxed?: boolean;
};

export const FREE_LEAD_MIN = 30;
export const FREE_TRAVEL_PAD_MIN = 10;

export function freeEarliestStart(nowMs: number, maxTripMinutes: number): number {
  const lead = Math.max(FREE_LEAD_MIN, maxTripMinutes + FREE_TRAVEL_PAD_MIN);
  return Math.ceil((nowMs + lead * MINUTE) / SLOT) * SLOT;
}

const OUTSIDE_TAGS: PlaceTag[] = ["outdoors", "nature", "hiking"];
const darkOnlyOutside = (p: Place) => !p.drop && !p.indoor && !p.bestTimes.includes("late_night") && p.tags.some((t) => OUTSIDE_TAGS.includes(t));

export function timeOfDay(startMs: number, sunsetMs: number): TimeOfDay {
  const m = localParts(startMs).minutes;
  if (m >= 21 * 60 || m < 4 * 60) return "late";
  if (startMs >= sunsetMs + 20 * MINUTE) return "evening";
  if (m < 11 * 60) return "morning";
  if (startMs >= sunsetMs - 90 * MINUTE) return "golden";
  return "day";
}

function closeMinute(place: Place, startMs: number): number | null {
  const { weekday, minutes: m } = localParts(startMs);
  const today = place.hours[weekday].find(([o, c]) => o <= m && m < c);
  if (today) return today[1];
  const spill = place.hours[(weekday + 6) % 7].find(([, c]) => c > 1440 && m + 1440 < c);
  return spill ? spill[1] - 1440 : null;
}

function bestSlot(place: Place, trips: Record<string, Trip>, ctx: Ctx) {
  const { input } = ctx;
  const dur = place.durationMin * MINUTE;
  const dayEnd = ctx.dayStartMs + 86_400_000;
  const free = input.kind === "free";
  const maxTrip = Math.max(...Object.values(trips).map((t) => t.minutes));
  const earliest = Math.max(
    input.nowMs,
    ctx.dayStartMs,
    Math.min(...input.attendees.map((a) => a.window.start)),
    free ? freeEarliestStart(input.nowMs, maxTrip) : 0,
  );
  const latest = ctx.relaxed ? dayEnd : Math.min(dayEnd, Math.max(...input.attendees.map((a) => a.window.end)));
  let best: { startMs: number; count: number; fit: number } | null = null;
  for (let s = Math.ceil(earliest / SLOT) * SLOT; s + dur <= latest; s += SLOT) {
    const e = s + dur;
    if (!isOpenFor(place, s, place.durationMin)) continue;
    if (place.needsDaylight && (s < ctx.sunriseMs || e > ctx.sunsetMs + 20 * MINUTE)) continue;
    if (darkOnlyOutside(place) && (s < ctx.sunriseMs || e > ctx.sunsetMs + 30 * MINUTE)) continue;
    const homeOk = input.attendees.every((a) => a.limits.homeBy === null || (e - ctx.dayStartMs) / MINUTE + trips[a.userId].minutes <= a.limits.homeBy);
    if (!homeOk) continue;
    const count = input.attendees.filter((a) => a.window.start <= s && e <= a.window.end).length;
    if (ctx.relaxed) return { startMs: s, count, fit: 0 };
    if (count < ctx.need) continue;
    const fit = timeFit(place, s, ctx.sunsetMs, isRainy(hourAt(input.weather, s)));
    if (!best || count > best.count || (count === best.count && fit > best.fit)) best = { startMs: s, count, fit };
  }
  return best;
}

function scoreCandidate(c: Omit<Candidate, "dryScore" | "score">, ctx: Ctx): { dryScore: number; score: number } {
  const p = c.place;
  let taste = 0;
  for (const t of p.tags) taste += ctx.weights.get(t) ?? 0;
  let s = Math.min(36, taste * 6);
  s += timeFit(p, c.startMs, ctx.sunsetMs, c.rainy);
  s += c.freeCount * 5;
  s -= Math.max(0, c.maxTrip.minutes - 12) * 1.5 + c.maxTrip.minutes * 0.3;
  if (c.golden) s += (ctx.weights.get("sunsets") ?? 0) + (ctx.weights.get("views") ?? 0) > 0 || ctx.weights.size === 0 ? 15 : 5;
  if (c.comeback) s += 45;
  if (p.drop && taste > 0) s += DROP_BOOST;
  if (ctx.input.memory.pastNights.some((n) => n.placeId === p.slug)) s += 10;
  for (const h of ctx.input.history) {
    if (h.placeSlug !== p.slug) continue;
    const ago = daysBetween(h.day, ctx.input.day);
    if (ago >= 0 && ago < 14) s -= (14 - ago) * 2.5;
    if (ago >= 0 && ago <= 3) s -= 80;
  }
  for (const h of ctx.input.history) {
    const ago = daysBetween(h.day, ctx.input.day);
    if (ago >= 0 && ago <= 3 && PLACE_BY_SLUG.get(h.placeSlug)?.tags[0] === p.tags[0]) s -= (4 - ago) * 6;
  }
  if (ctx.blocked.onceSlugs.has(p.slug) || p.tags.some((t) => ctx.blocked.onceTags.has(t))) s -= 12;
  s -= p.costPerPersonCents / 400;
  s += crowdWeight(p) * (ctx.weights.size === 0 ? CROWD_MAX : CROWD_MAX / 3);
  s += hash01(ctx.input.seed + "|" + p.slug) * 0.5;
  const rainDelta = c.rainy ? (p.indoor ? 8 : -60) : 0;
  return { dryScore: s, score: s + rainDelta };
}

function buildCtx(input: DropInput): Ctx {
  const sun = input.weather ? { sunriseMs: input.weather.sunriseMs, sunsetMs: input.weather.sunsetMs } : solarTimes(input.day);
  const favored = favoredUser(input.attendees, input.history, input.seed);
  const weights = new Map<PlaceTag, number>();
  const bump = (t: PlaceTag, w: number) => weights.set(t, (weights.get(t) ?? 0) + w);
  for (const a of input.attendees) for (const raw of a.taste) for (const t of normalizeTag(raw)) bump(t, a.userId === favored && input.attendees.length > 1 ? 2 : 1);
  input.memory.likedTags.forEach((raw, i) => normalizeTag(raw).forEach((t) => bump(t, Math.max(0.5, 1.5 - i * 0.25))));
  const blocked = blockedBySkips(input.memory);
  let comebackSlug: string | null = null;
  if (input.lastFrolicDay && daysBetween(input.lastFrolicDay, input.day) >= 7) {
    comebackSlug = input.memory.pastNights.find((n) => n.placeId)?.placeId ?? null;
    if (!comebackSlug) {
      const counts = new Map<string, number>();
      for (const h of input.history) counts.set(h.placeSlug, (counts.get(h.placeSlug) ?? 0) + 1);
      comebackSlug = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
    }
  }
  return {
    input,
    ...sun,
    dayStartMs: localTimeToMs(input.day, 0),
    need: input.attendees.length >= 2 ? 2 : 1,
    weights,
    favored,
    blocked,
    comebackSlug,
  };
}

export const DROP_BOOST = 8;
export const CROWD_MAX = 8;

export const centsLabel = (cents: number) => "$" + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

export function dropPlaces(input: DropInput): Place[] {
  const base = input.places ?? BERKELEY_PLACES;
  const need = input.attendees.length >= 2 ? 2 : 1;
  return (input.drops ?? []).flatMap((d) => {
    const place = base.find((p) => p.slug === d.placeSlug);
    if (!place || d.seatsLeft < need) return [];
    const hours = Array.from({ length: 7 }, (_, i) => (d.validDays.includes(i) ? [[d.startMinute, d.endMinute]] : [])) as WeekHours;
    return [
      {
        ...place,
        title: d.title,
        costPerPersonCents: d.priceCents,
        costLabel: centsLabel(d.priceCents),
        payUpFront: true,
        priceVerified: true,
        tags: [...new Set(d.tags.flatMap(normalizeTag))],
        hours,
        needsDaylight: false,
        durationMin: d.durationMinutes,
        drop: { dropId: d.dropId, sellerName: d.sellerName, seatsLeft: d.seatsLeft },
      },
    ];
  });
}

export function rankCandidates(
  input: DropInput,
  ctx = buildCtx(input),
  pool = [...(input.places ?? BERKELEY_PLACES), ...dropPlaces(input)],
  relax = true,
): Candidate[] {
  if (input.attendees.length === 0) return [];
  const out: Candidate[] = [];
  for (const place of pool) {
    if (isBlocked(place, ctx.blocked)) continue;
    const trips: Record<string, Trip> = {};
    let ok = true;
    for (const a of input.attendees) {
      const trip = tripTo(a.origin, place);
      if (!withinLimits(place, a, trip)) {
        ok = false;
        break;
      }
      trips[a.userId] = trip;
    }
    if (!ok) continue;
    const slot = bestSlot(place, trips, ctx);
    if (!slot) continue;
    const hour = hourAt(input.weather, slot.startMs);
    const rainy = isRainy(hour);
    const maxTrip = Object.values(trips).reduce((m, t) =>
      t.minutes > m.minutes || (t.minutes === m.minutes && t.mode > m.mode) ? t : m,
    );
    const golden =
      !rainy && (input.weather === null || isClear(hour)) && p_golden(place) &&
      slot.startMs <= ctx.sunsetMs &&
      slot.startMs + place.durationMin * MINUTE >= ctx.sunsetMs - 15 * MINUTE;
    const base = {
      place,
      startMs: slot.startMs,
      endMs: slot.startMs + place.durationMin * MINUTE,
      freeCount: slot.count,
      trips,
      maxTrip,
      hour,
      rainy,
      golden,
      comeback: place.slug === ctx.comebackSlug,
    };
    out.push({ ...base, ...scoreCandidate(base, ctx) });
  }
  if (out.length === 0 && input.kind === "free" && relax && !ctx.relaxed) return rankCandidates(input, { ...ctx, relaxed: true }, pool);
  return out.sort(
    (a, b) =>
      (ctx.relaxed ? a.startMs - b.startMs : b.freeCount - a.freeCount) ||
      b.score - a.score ||
      (a.place.slug < b.place.slug ? -1 : 1),
  );
}

const p_golden = (p: Place) => p.tags.includes("sunsets") && !p.indoor;

export const COPY_BANNED = /[\u2014\u2013!]|\bnot\b[^.]*\bbut\b/i;
export const copyOk = (s: string) => s.trim().length > 0 && s.length <= 140 && !COPY_BANNED.test(s);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function costPhrase(p: Place): string {
  if (p.costPerPersonCents === 0) return "it's free";
  if (p.costPerPersonCents <= 1000) return "it's " + p.costLabel.charAt(0).toLowerCase() + p.costLabel.slice(1);
  return "it fits everyone's budget";
}

function weatherPhrase(c: Candidate, swap: boolean): string | null {
  if (swap) return "it's dry inside while it rains";
  if (c.golden) return "the sky's clear until dark";
  if (c.hour && !c.rainy && c.hour.tempF >= 58 && !c.place.indoor) return "it's " + c.hour.tempF + "\u00b0 out";
  if (c.place.indoor && c.hour && c.hour.tempF < 52) return "it's warm inside";
  if (c.freeCount >= 3) return (c.freeCount === 3 ? "three" : String(c.freeCount)) + " of you are free then";
  return null;
}

function tasteWhy(lead: string, tag: PlaceTag, c: Candidate, swap: boolean): string {
  const parts = [tag === "free" ? null : costPhrase(c.place), weatherPhrase(c, swap)].filter((x): x is string => !!x);
  const head = lead + TAG_LABEL[tag];
  if (parts.length === 0) return head + ".";
  if (parts.length === 1) return head + " and " + parts[0] + ".";
  return head + ", " + parts[0] + ", and " + parts[1] + ".";
}

function pickTag(p: Place, tags: PlaceTag[]): PlaceTag | undefined {
  const own = tags.filter((t) => p.tags.includes(t));
  return own.find((t) => t !== "free") ?? own[0];
}

function dropWhy(c: Candidate): string | null {
  const d = c.place.drop;
  if (!d) return null;
  const when = c.golden ? "at golden hour" : localParts(c.startMs).minutes >= 21 * 60 ? "tonight" : "at " + clockLabel(c.startMs);
  const why = d.sellerName + " has " + d.seatsLeft + (d.seatsLeft === 1 ? " seat " : " seats ") + when + ".";
  return copyOk(why) ? why : null;
}

const tagWord = (tag: string) => TAG_LABEL[tag as PlaceTag] ?? tag.replace(/_/g, " ");

function writeWhy(c: Candidate, ctx: Ctx, swap: boolean): { why: string; whySource: WhySource; whyMemoryId: string | null; memory: string | null } {
  const p = c.place;
  const hosted = dropWhy(c);
  if (hosted) return { why: hosted, whySource: "template", whyMemoryId: null, memory: null };
  const cite = citeWhy({ slug: p.slug, name: p.name, tags: p.tags }, ctx.input.memory, { day: ctx.input.day, comeback: c.comeback, label: tagWord });
  if (cite && copyOk(cite.why)) return { why: cite.why, whySource: "memory", whyMemoryId: cite.memoryId, memory: cite.memory };
  const likedTag = pickTag(p, ctx.input.memory.likedTags.flatMap(normalizeTag));
  if (likedTag) return { why: tasteWhy("you keep picking ", likedTag, c, swap), whySource: "memory", whyMemoryId: null, memory: null };
  const ranked = [...ctx.weights.entries()].sort((a, b) => b[1] - a[1] || p.tags.indexOf(a[0]) - p.tags.indexOf(b[0])).map(([t]) => t);
  const tasteTag = pickTag(p, ranked);
  if (tasteTag) return { why: tasteWhy("you're into ", tasteTag, c, swap), whySource: "template", whyMemoryId: null, memory: null };
  if (swap) return { why: "rain's coming, so this one keeps everyone dry, and " + costPhrase(p) + ".", whySource: "template", whyMemoryId: null, memory: null };
  return { why: p.fallbackWhy, whySource: "template", whyMemoryId: null, memory: null };
}

export function sunsetRelevant(c: Candidate, sunsetMs: number): boolean {
  const p = c.place;
  if (p.tags.includes("sunsets") || p.tags.includes("views")) return true;
  return !p.indoor && c.startMs < sunsetMs && c.endMs > sunsetMs - 60 * MINUTE;
}

function closesAt(c: Candidate): number | null {
  const { weekday, minutes } = localParts(c.startMs);
  const span = c.place.hours[weekday].find(([o, cl]) => o <= minutes && minutes < cl);
  if (!span || span[1] >= 1440) return null;
  return c.startMs + (span[1] - minutes) * MINUTE;
}

function placeLine(c: Candidate): string {
  const close = closesAt(c);
  const trip = cap(tripLabel(c.maxTrip)) + ".";
  if (close !== null) return "Open until " + clockLabel(close) + ". " + trip;
  return trip + " " + (c.place.costPerPersonCents === 0 ? "It's free." : cap(c.place.costLabel) + ".");
}

function writeLine(c: Candidate, ctx: Ctx, swap: boolean): string {
  const sunset = clockLabel(ctx.sunsetMs);
  const golden = clockLabel(ctx.sunsetMs - 30 * MINUTE);
  const hook = c.place.drop ? "" : cap(c.place.tip) + ".";
  const close = closeMinute(c.place, c.startMs);
  const hours = c.place.indoor && close !== null ? "Open until " + clockLabel(ctx.dayStartMs + close * MINUTE) + "." : "";
  const lead = c.hour ? conditionLabel(c.hour) + " and " + c.hour.tempF + "\u00b0." + (!c.place.indoor && c.hour.tempF < 50 ? " Bring a layer." : "") : "";
  const parts = swap
    ? ["Rain around " + clockLabel(c.startMs) + ", so it's indoors.", hours || placeLine(c), hook]
    : c.golden
      ? [lead, "Golden hour starts at " + golden + ".", hook]
      : sunsetRelevant(c, ctx.sunsetMs) && c.startMs < ctx.sunsetMs
        ? [lead, "Sunset at " + sunset + ".", hook]
        : [lead, hours, hook];
  let line = "";
  for (const part of parts.filter(Boolean)) if (copyOk(line ? line + " " + part : part)) line = line ? line + " " + part : part;
  return line || placeLine(c);
}

function writeTitle(c: Candidate, ctx: Ctx): string {
  const p = c.place;
  if (p.drop) return p.title;
  const when = timeOfDay(c.startMs, ctx.sunsetMs);
  const base = p.titles?.[when] ?? (when === "golden" || !/sunset|golden hour|dusk/i.test(p.title) ? p.title : p.titles?.day ?? p.title);
  const close = closeMinute(p, c.startMs);
  const tight = close !== null && close < 26 * 60 && close * MINUTE + ctx.dayStartMs - c.endMs <= 30 * MINUTE;
  return tight && (when === "evening" || when === "late") && copyOk(base + " before close") ? base + " before close" : base;
}

function writeChips(c: Candidate, ctx: Ctx, swap: boolean): string[] {
  const third = swap
    ? "Dry inside"
    : c.golden
      ? "Golden hour " + clockLabel(ctx.sunsetMs - 30 * MINUTE)
      : c.hour
        ? conditionLabel(c.hour) + ", " + c.hour.tempF + "\u00b0"
        : sunsetRelevant(c, ctx.sunsetMs) || closesAt(c) === null
          ? "Sunset " + clockLabel(ctx.sunsetMs)
          : "Open until " + clockLabel(closesAt(c)!);
  return [c.place.costLabel, tripLabel(c.maxTrip), third];
}

function toPlan(c: Candidate, ctx: Ctx, candidates: Candidate[], source: Plan["source"], swap: boolean): Plan {
  const p = c.place;
  const w = source === "fallback" ? { why: p.fallbackWhy, whySource: "template" as const, whyMemoryId: null, memory: null } : writeWhy(c, ctx, swap);
  const topTags = [...ctx.weights.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([t]) => TAG_LABEL[t]);
  return {
    placeSlug: p.slug,
    heroKey: heroKeyFor(p),
    title: writeTitle(c, ctx),
    line: writeLine(c, ctx, swap),
    why: w.why,
    whySource: w.whySource,
    whyMemoryId: w.whyMemoryId,
    whyInputs: {
      placeName: p.name,
      memory: w.memory,
      topTags,
      weather: c.hour ? conditionLabel(c.hour) : null,
      tempF: c.hour?.tempF ?? null,
      sunsetAt: ctx.sunsetMs,
      rainSwap: swap,
    },
    chips: writeChips(c, ctx, swap),
    startsAt: c.startMs,
    endsAt: c.endMs,
    durationMinutes: p.durationMin,
    meetingPoint: { lat: p.lat, lng: p.lng, label: p.meetSpot },
    costPerPersonCents: p.costPerPersonCents,
    costLabel: p.costLabel,
    payUpFront: p.payUpFront,
    favoredUserId: ctx.input.attendees.length > 1 ? ctx.favored : null,
    weatherSwap: swap,
    sunsetAt: ctx.sunsetMs,
    weather: c.hour ? conditionLabel(c.hour) + ", " + c.hour.tempF + "\u00b0" : null,
    source,
    candidates: candidates.map((x) => x.place.slug),
    minutesAway: Object.fromEntries(
      Object.entries(c.trips)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([u, t]) => [u, t.minutes]),
    ),
    drop: p.drop ? { dropId: p.drop.dropId, sellerName: p.drop.sellerName, priceCents: p.costPerPersonCents } : null,
  };
}

export const FALLBACK_SLUGS = ["memorial-glade", "pegasus-books", "moes-books", "live-oak-park", "games-of-berkeley", "rose-garden", "berkeley-marina", "caffe-strada", "kingpin-donuts"];

export function fallbackPlan(input: DropInput): Plan | null {
  const safe: DropInput = { ...input, weather: null };
  const ctx = buildCtx(safe);
  const pool = FALLBACK_SLUGS.map((s) => (input.places ?? BERKELEY_PLACES).find((p) => p.slug === s)).filter((p): p is Place => !!p);
  const strict = rankCandidates(safe, ctx, pool, false);
  const ranked = strict.length > 0 || input.kind !== "free" ? strict : rankCandidates(safe, ctx, input.places ?? BERKELEY_PLACES);
  if (ranked.length === 0) return null;
  const order = (c: Candidate) => {
    const i = FALLBACK_SLUGS.indexOf(c.place.slug);
    return i < 0 ? FALLBACK_SLUGS.length : i;
  };
  const pick = [...ranked].sort((a, b) => order(a) - order(b))[0];
  return toPlan(pick, ctx, ranked, "fallback", false);
}

export type GenerateOptions = { preferredSlug?: string | null; preferredWhy?: string | null };

export function generatePlan(input: DropInput, opts: GenerateOptions = {}): Plan | null {
  const ctx = buildCtx(input);
  const ranked = rankCandidates(input, ctx);
  if (ranked.length === 0) return fallbackPlan(input);
  const preferred = opts.preferredSlug ? ranked.find((c) => c.place.slug === opts.preferredSlug) : undefined;
  const pick = preferred ?? ranked[0];
  const dryTop = [...ranked].sort((a, b) => b.dryScore - a.dryScore || (a.place.slug < b.place.slug ? -1 : 1))[0];
  const swap = pick.place.indoor && dryTop.rainy && !dryTop.place.indoor && dryTop !== pick;
  const plan = toPlan(pick, ctx, ranked, preferred ? "model" : "scorer", swap);
  const place = { slug: pick.place.slug, name: pick.place.name, tags: pick.place.tags };
  const cited = citeWhy(place, input.memory, { day: input.day, comeback: pick.comeback, label: tagWord }) !== null;
  if (preferred && opts.preferredWhy && copyOk(opts.preferredWhy) && !cited && !unbackedClaim(opts.preferredWhy, input.memory, place)) {
    plan.why = opts.preferredWhy;
    plan.whySource = "haiku";
  }
  return plan;
}

export function validatePlan(plan: Plan, input: DropInput): boolean {
  const ranked = rankCandidates(input);
  const allowed = new Set([...ranked.map((c) => c.place.slug), ...(plan.source === "fallback" ? FALLBACK_SLUGS : [])]);
  if (!allowed.has(plan.placeSlug)) return false;
  if (![plan.title, plan.line, plan.why, ...plan.chips].every(copyOk)) return false;
  const place = plan.drop
    ? dropPlaces(input).find((p) => p.drop?.dropId === plan.drop?.dropId)
    : (input.places ?? BERKELEY_PLACES).find((p) => p.slug === plan.placeSlug);
  return !!place && isOpenFor(place, plan.startsAt, place.durationMin);
}

export function nextDays(day: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(day, i));
}

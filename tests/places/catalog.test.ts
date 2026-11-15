import { describe, expect, test } from "vitest";
import { BERKELEY_PLACES, PLACE_BY_SLUG, type BestTime, type Place } from "../../convex/places/data";
import { PLACES as ANIMALS_NIGHTS_MUSEUMS } from "../../convex/places/sets/animals-nights-museums";
import { PLACES as CLASSES } from "../../convex/places/sets/classes";
import { PLACES as ESCAPE_KARAOKE_DANCE } from "../../convex/places/sets/escape-karaoke-dance";
import { PLACES as GAMES_AND_SKATING } from "../../convex/places/sets/games-and-skating";
import { EMPTY_MEMORY } from "../../convex/plans/memoryContext";
import { addDays, localParts, localTimeToMs, solarTimes } from "../../convex/plans/time";
import { copyOk, generatePlan, isOpenFor, type Attendee, type DropInput, type Plan } from "../../convex/plans/engine";

const SETS: { name: string; places: Place[] }[] = [
  { name: "animals-nights-museums", places: ANIMALS_NIGHTS_MUSEUMS },
  { name: "escape-karaoke-dance", places: ESCAPE_KARAOKE_DANCE },
  { name: "games-and-skating", places: GAMES_AND_SKATING },
  { name: "classes", places: CLASSES },
];

const NEW_PLACES = SETS.flatMap((s) => s.places);
const WEDNESDAY = "2026-11-18";
const MINUTE = 60_000;

const IDEAL: Record<BestTime, (day: string) => number> = {
  morning: () => 9 * 60,
  daytime: () => 13 * 60,
  golden_hour: (day) => localParts(solarTimes(day).sunsetMs).minutes - 45,
  late_night: () => 21 * 60,
};

const daylight = (place: Place, startMs: number) => {
  if (place.indoor || place.bestTimes.includes("late_night")) return true;
  const sky = solarTimes(localParts(startMs + place.durationMin * MINUTE).day);
  return startMs >= sky.sunriseMs && startMs + place.durationMin * MINUTE <= sky.sunsetMs + 30 * MINUTE;
};

function slot(place: Place, best: BestTime): { day: string; nowMs: number } | null {
  for (let i = 0; i < 7; i++) {
    const day = addDays(WEDNESDAY, i);
    const ideal = IDEAL[best](day);
    let bestSlot: { day: string; nowMs: number } | null = null;
    for (let min = 7 * 60; min <= 23 * 60; min += 15) {
      const nowMs = localTimeToMs(day, min);
      if (!isOpenFor(place, nowMs, place.durationMin) || !daylight(place, nowMs)) continue;
      if (!bestSlot || Math.abs(min - ideal) < Math.abs(localParts(bestSlot.nowMs).minutes - ideal)) bestSlot = { day, nowMs };
    }
    if (bestSlot) return bestSlot;
  }
  return null;
}

const person = (userId: string, taste: string[]): Attendee => ({
  userId,
  limits: { budgetCents: null, energy: "anything", maxMinutes: null, homeBy: null },
  origin: null,
  window: { start: 0, end: 0 },
  taste,
});

function input(place: Place, nowMs: number, day: string, restricted: boolean): DropInput {
  return {
    day,
    kind: "daily",
    seed: "catalog:" + place.slug + ":" + nowMs,
    nowMs,
    attendees: ["maya", "dev", "jordan"].map((userId) => ({
      ...person(userId, place.tags),
      window: { start: nowMs, end: localTimeToMs(day, 23 * 60 + 30) },
    })),
    weather: null,
    memory: EMPTY_MEMORY,
    history: [],
    lastFrolicDay: null,
    places: restricted ? [place] : undefined,
  };
}

function problems(plan: Plan | null, day: string): string[] {
  if (!plan) return ["no plan"];
  const out: string[] = [];
  const place = PLACE_BY_SLUG.get(plan.placeSlug);
  if (!place) return ["plan names an unknown place " + plan.placeSlug];
  const { sunriseMs, sunsetMs } = solarTimes(day);
  const dark = plan.startsAt > sunsetMs + 20 * MINUTE || plan.startsAt < sunriseMs;
  if (!place.indoor && dark && !place.bestTimes.includes("late_night")) out.push("outdoor after dark");
  if (!plan.drop && !isOpenFor(place, plan.startsAt, place.durationMin)) out.push("closed at the start");
  if (/^late-night|^midnight/i.test(plan.title) && localParts(plan.startsAt).minutes < 20 * 60 && localParts(plan.startsAt).minutes > 4 * 60) out.push("late-night title in daytime");
  for (const s of [plan.title, plan.line, plan.why, ...plan.chips]) if (!copyOk(s)) out.push("copy: " + s);
  return out;
}

describe("the place sets are in the catalog", () => {
  test("every set entry is reachable through PLACE_BY_SLUG", () => {
    expect(NEW_PLACES.length).toBeGreaterThan(20);
    for (const set of SETS)
      for (const place of set.places) {
        expect(PLACE_BY_SLUG.get(place.slug), set.name + " " + place.slug).toBe(place);
        expect(BERKELEY_PLACES).toContain(place);
      }
  });

  test("no slug repeats across the sets or the catalog", () => {
    const slugs = BERKELEY_PLACES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(PLACE_BY_SLUG.size).toBe(slugs.length);
  });

  test("no venue is in the catalog twice", () => {
    const addresses = BERKELEY_PLACES.map((p) => p.address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    expect(addresses.filter((a, i) => addresses.indexOf(a) !== i)).toEqual([]);
  });

  test("each set keeps its own count", () => {
    expect(ANIMALS_NIGHTS_MUSEUMS).toHaveLength(8);
    expect(ESCAPE_KARAOKE_DANCE).toHaveLength(5);
    expect(GAMES_AND_SKATING).toHaveLength(7);
    expect(CLASSES).toHaveLength(8);
  });

  test("a set entry reaches the catalog with its fields and first tag intact", () => {
    for (const set of SETS)
      for (const place of set.places) {
        const catalogued = PLACE_BY_SLUG.get(place.slug)!;
        expect(catalogued.tags).toEqual(place.tags);
        expect(catalogued.bestTimes).toEqual(place.bestTimes);
        expect(catalogued.hours).toEqual(place.hours);
        expect(catalogued.costPerPersonCents).toBe(place.costPerPersonCents);
        expect(catalogued.costLabel).toBe(place.costLabel);
        expect(catalogued.title).toBe(place.title);
        expect(catalogued.fallbackWhy).toBe(place.fallbackWhy);
      }
  });
});

describe("the engine can use the new places", () => {
  test("every new place is planned near each of its best times", { timeout: 60_000 }, () => {
    const failures: string[] = [];
    for (const place of NEW_PLACES)
      for (const best of place.bestTimes) {
        const at = slot(place, best);
        if (!at) {
          failures.push(place.slug + " is never open in a plan beside its best time " + best);
          continue;
        }
        const plan = generatePlan(input(place, at.nowMs, at.day, true));
        const found = problems(plan, at.day);
        if (plan && plan.placeSlug !== place.slug) found.push("planned " + plan.placeSlug + " instead");
        if (found.length > 0) failures.push(place.slug + " " + best + ": " + found.join("; "));
      }
    expect(failures).toEqual([]);
  });

  test("the full catalog answers at those same moments without breaking the grid", { timeout: 60_000 }, () => {
    const failures: string[] = [];
    for (const place of NEW_PLACES)
      for (const best of place.bestTimes) {
        const at = slot(place, best);
        if (!at) continue;
        const found = problems(generatePlan(input(place, at.nowMs, at.day, false)), at.day);
        if (found.length > 0) failures.push(place.slug + " " + best + ": " + found.join("; "));
      }
    expect(failures).toEqual([]);
  });
});

import { describe, expect, test } from "vitest";
import { PLACE_BY_SLUG, type Place } from "../../convex/places/data";
import { EMPTY_MEMORY, type MemoryContext } from "../../convex/plans/memoryContext";
import { localTimeToMs, solarTimes } from "../../convex/plans/time";
import { crowdWeight } from "../../convex/plans/crowd";
import {
  generatePlan,
  isOpenFor,
  rankCandidates,
  type Attendee,
  type Candidate,
  type DropInput,
  type Plan,
} from "../../convex/plans/engine";

const DAY = "2026-11-18";
const MINUTE = 60_000;
const at = (hh: number, mm = 0, day = DAY) => localTimeToMs(day, hh * 60 + mm);

const LIMITLESS = { budgetCents: null, energy: "anything" as const, maxMinutes: null, homeBy: null };

const person = (userId: string, over: Partial<Attendee> = {}, day = DAY): Attendee => ({
  userId,
  limits: LIMITLESS,
  origin: null,
  window: { start: at(15, 0, day), end: at(23, 0, day) },
  taste: [],
  ...over,
});

const input = (attendees: Attendee[], over: Partial<DropInput> = {}): DropInput => {
  const day = over.day ?? DAY;
  return {
    day,
    kind: "daily",
    seed: "group1:" + day,
    nowMs: at(9, 0, day),
    attendees,
    weather: null,
    memory: EMPTY_MEMORY,
    history: [],
    lastFrolicDay: null,
    ...over,
  };
};

const memory = (m: Partial<MemoryContext>): MemoryContext => ({ ...EMPTY_MEMORY, ...m });

const minutesInto = (ms: number, day = DAY) => (ms - localTimeToMs(day, 0)) / MINUTE;

const twin = (slug: string, tags: Place["tags"]): Place => ({
  ...PLACE_BY_SLUG.get("pegasus-books")!,
  slug,
  name: slug,
  tags,
});

const chosen = (plan: Plan, ranked: Candidate[]): Candidate =>
  ranked.find((c) => c.place.slug === plan.placeSlug && c.startMs === plan.startsAt)!;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle<T>(items: T[], r: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const DAYS = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];
const TASTES = [["Sunsets"], ["Late-night food"], ["Games"], ["Outdoors", "Free stuff"], []];

function randomCrew(seed: number): DropInput {
  const r = rng(seed);
  const day = DAYS[Math.floor(r() * DAYS.length)];
  const start = (hh: number, mm = 0) => localTimeToMs(day, hh * 60 + mm);
  const size = 1 + Math.floor(r() * 5);
  const attendees = Array.from({ length: size }, (_, i) => {
    const from = 9 + Math.floor(r() * 10);
    return person(
      "u" + i + "-" + seed,
      {
        limits: {
          budgetCents: [0, 1000, 2500, null][Math.floor(r() * 4)],
          energy: r() < 0.5 ? "chill" : "anything",
          maxMinutes: r() < 0.3 ? null : 5 + Math.floor(r() * 9) * 5,
          homeBy: [21 * 60, 22 * 60, null][Math.floor(r() * 3)],
        },
        origin: { lat: 37.86 + r() * 0.03, lng: -122.29 + r() * 0.04 },
        window: { start: start(from), end: start(Math.min(24, from + 2 + Math.floor(r() * 8))) },
        taste: TASTES[Math.floor(r() * TASTES.length)],
      },
      day,
    );
  });
  return input(attendees, { day, nowMs: start(8) });
}

describe("the pick is deterministic", () => {
  test("the same inputs give the same plan on every run", () => {
    for (let i = 0; i < 60; i++) {
      const crew = randomCrew(i + 1);
      expect(generatePlan(crew)).toEqual(generatePlan(structuredClone(crew)));
    }
  });

  test("the pick path reads no clock and no randomness", () => {
    const realRandom = Math.random;
    const realNow = Date.now;
    const boom = () => {
      throw new Error("the pick path touched the clock or Math.random");
    };
    Math.random = boom;
    Date.now = boom;
    try {
      const crew = input([
        person("maya", { window: { start: at(15), end: at(21) }, taste: ["Sunsets"] }),
        person("dev", { window: { start: at(17), end: at(22) }, taste: ["Games"] }),
        person("jordan", { window: { start: at(16), end: at(20) }, taste: ["Outdoors"] }),
      ]);
      expect(generatePlan(crew)?.placeSlug).toBeTruthy();
      expect(rankCandidates(crew).length).toBeGreaterThan(0);
      for (let i = 0; i < 30; i++) expect(() => generatePlan(randomCrew(7000 + i))).not.toThrow();
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });

  test("the plan does not depend on the order the crew arrives in", () => {
    for (let i = 0; i < 90; i++) {
      const crew = randomCrew(2000 + i);
      const base = JSON.stringify(generatePlan(crew));
      for (let k = 0; k < 3; k++) {
        const reshuffled = { ...crew, attendees: shuffle(crew.attendees, rng(7000 + i * 3 + k)) };
        expect(JSON.stringify(generatePlan(reshuffled))).toBe(base);
      }
    }
  });

  test("a fixed crew lands on the same place, time and copy on any machine", () => {
    const crew = input([
      person("maya", { window: { start: at(15), end: at(21) }, taste: ["Sunsets"] }),
      person("dev", { window: { start: at(17), end: at(22) }, taste: ["Games"] }),
      person("jordan", { window: { start: at(16), end: at(20) }, taste: ["Outdoors"] }),
    ]);
    const plan = generatePlan(crew)!;
    expect(plan.placeSlug).toBe("games-of-berkeley");
    expect(plan.startsAt).toBe(at(17));
    expect(plan.endsAt).toBe(at(17, 45));
    expect(plan.favoredUserId).toBe("dev");
    expect(plan.chips).toEqual(["Free to browse", "4 min walk", "Open until 9:00"]);
  });

  test("two people the same distance away always get the same walk chip", () => {
    const tie = [person("zoe"), person("abe")];
    const forward = generatePlan(input(tie))!;
    const backward = generatePlan(input([...tie].reverse()))!;
    expect(forward.chips).toEqual(backward.chips);
    expect(Object.keys(forward.minutesAway)).toEqual(Object.keys(backward.minutesAway));
  });
});

describe("the window solver", () => {
  test("two people with disjoint windows get a clean nothing", () => {
    const crew = input([
      person("maya", { window: { start: at(15), end: at(16, 30) } }),
      person("dev", { window: { start: at(19), end: at(21) } }),
    ]);
    expect(rankCandidates(crew)).toEqual([]);
    expect(generatePlan(crew)).toBeNull();
  });

  test("three people with one shared 90 minute window all go out inside it", () => {
    const crew = input([
      person("maya", { window: { start: at(15), end: at(20) } }),
      person("dev", { window: { start: at(17), end: at(18, 30) } }),
      person("jordan", { window: { start: at(16), end: at(21) } }),
    ]);
    const ranked = rankCandidates(crew);
    const plan = generatePlan(crew)!;
    const pick = chosen(plan, ranked);
    expect(pick.freeCount).toBe(3);
    expect(Math.max(...ranked.map((c) => c.freeCount))).toBe(3);
    expect(plan.startsAt).toBeGreaterThanOrEqual(at(17));
    expect(plan.endsAt).toBeLessThanOrEqual(at(18, 30));
  });

  test("the start time is the one that gets the most people out", () => {
    const crew = input([
      person("maya", { window: { start: at(15), end: at(21) } }),
      person("dev", { window: { start: at(15), end: at(16) } }),
      person("jordan", { window: { start: at(19), end: at(21) } }),
      person("priya", { window: { start: at(19), end: at(22) } }),
    ]);
    const ranked = rankCandidates(crew);
    const best = Math.max(...ranked.map((c) => c.freeCount));
    expect(best).toBe(3);
    const plan = generatePlan(crew)!;
    expect(chosen(plan, ranked).freeCount).toBe(best);
    expect(plan.startsAt).toBeGreaterThanOrEqual(at(19));
  });

  test("every random crew matches the most people it could get out", () => {
    for (let i = 0; i < 60; i++) {
      const crew = randomCrew(4000 + i);
      const ranked = rankCandidates(crew);
      if (ranked.length === 0) continue;
      const plan = generatePlan(crew)!;
      if (plan.source === "fallback") continue;
      expect(chosen(plan, ranked).freeCount).toBe(Math.max(...ranked.map((c) => c.freeCount)));
    }
  });

  test("someone free all evening does not stretch the plan past the others", () => {
    const crew = input([
      person("maya", { window: { start: at(17), end: at(24) } }),
      person("dev", { window: { start: at(19), end: at(20) } }),
    ]);
    const plan = generatePlan(crew)!;
    expect(plan.startsAt).toBeGreaterThanOrEqual(at(19));
    expect(plan.endsAt).toBeLessThanOrEqual(at(20));
    expect(chosen(plan, rankCandidates(crew)).freeCount).toBe(2);
  });

  test("a window that starts at the sunset minute never gets a daylight plan", () => {
    const sunset = solarTimes(DAY).sunsetMs;
    const crew = input([
      person("maya", { window: { start: sunset, end: at(24) } }),
      person("dev", { window: { start: sunset, end: at(24) } }),
    ]);
    const ranked = rankCandidates(crew);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.some((c) => c.place.needsDaylight)).toBe(false);
    const plan = generatePlan(crew)!;
    expect(plan.startsAt).toBeGreaterThanOrEqual(sunset);
    expect(isOpenFor(PLACE_BY_SLUG.get(plan.placeSlug)!, plan.startsAt, plan.durationMinutes)).toBe(true);
  });

  test("a shared window after a place closes never gets that place", () => {
    const books = PLACE_BY_SLUG.get("pegasus-books")!;
    const crew = input(
      [person("maya", { window: { start: at(22), end: at(24) } }), person("dev", { window: { start: at(22), end: at(24) } })],
      { places: [books] },
    );
    expect(rankCandidates(crew)).toEqual([]);
    expect(generatePlan(crew)).toBeNull();
  });

  test("a place closing at the exact end of the shared window still works", () => {
    const books = PLACE_BY_SLUG.get("pegasus-books")!;
    const close = localTimeToMs(DAY, books.hours[3][0][1] - books.durationMin);
    const crew = input([person("maya", { window: { start: close, end: at(24) } }), person("dev", { window: { start: close, end: at(24) } })], {
      places: [books],
      nowMs: at(9),
    });
    const plan = generatePlan(crew);
    expect(plan?.placeSlug).toBe("pegasus-books");
    expect(isOpenFor(books, plan!.startsAt, books.durationMin)).toBe(true);
  });
});

describe("a place is only picked when it fits everyone", () => {
  test("never a place closed at its own start time", () => {
    for (let i = 0; i < 60; i++) {
      const crew = randomCrew(6000 + i);
      for (const c of rankCandidates(crew)) expect(isOpenFor(c.place, c.startMs, c.place.durationMin)).toBe(true);
      const plan = generatePlan(crew);
      if (!plan || plan.source === "fallback") continue;
      expect(isOpenFor(PLACE_BY_SLUG.get(plan.placeSlug)!, plan.startsAt, plan.durationMinutes)).toBe(true);
    }
  });

  test("never a place that breaks one person's private budget", () => {
    const broke = person("maya", { limits: { ...LIMITLESS, budgetCents: 0 } });
    const crew = input([broke, person("dev")]);
    const ranked = rankCandidates(crew);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((c) => c.place.costPerPersonCents === 0)).toBe(true);
    expect(generatePlan(crew)!.costPerPersonCents).toBe(0);
  });

  test("never a place farther than the fair meeting point allows", () => {
    const near = person("dev", { limits: { ...LIMITLESS, maxMinutes: 8 } });
    const crew = input([person("maya"), near]);
    const ranked = rankCandidates(crew);
    expect(ranked.length).toBeGreaterThan(0);
    for (const c of ranked) expect(c.trips.dev.minutes).toBeLessThanOrEqual(8);
    const plan = generatePlan(crew)!;
    expect(plan.minutesAway.dev).toBeLessThanOrEqual(8);
  });
});

describe("the crowd prior cannot outvote the group", () => {
  const spots = () => [twin("low-demand-spot", ["campus"]), twin("high-demand-spot", ["games"])];

  test("a place the group went to two days ago stays out of the pick", () => {
    const crew = input([person("maya"), person("dev")], { places: spots() });
    expect(crowdWeight(spots()[1])).toBeGreaterThan(crowdWeight(spots()[0]) + 0.2);
    expect(generatePlan(crew)!.placeSlug).toBe("high-demand-spot");
    for (const ago of [1, 2, 3]) {
      const day = "2026-11-" + String(18 - ago).padStart(2, "0");
      const history = [{ day, placeSlug: "high-demand-spot", favoredUserId: null }];
      expect(generatePlan({ ...crew, history })!.placeSlug).toBe("low-demand-spot");
    }
  });

  test("a place the group went to five days ago still stays out of the pick", () => {
    const crew = input([person("maya"), person("dev")], {
      places: spots(),
      history: [{ day: "2026-11-13", placeSlug: "high-demand-spot", favoredUserId: null }],
    });
    expect(generatePlan(crew)!.placeSlug).toBe("low-demand-spot");
  });
});

describe("a crew of any size", () => {
  test("an empty crew gets a clean nothing instead of a throw", () => {
    expect(() => generatePlan(input([]))).not.toThrow();
    expect(generatePlan(input([]))).toBeNull();
    expect(rankCandidates(input([]))).toEqual([]);
  });

  test("a crew of one gets a plan that is open and inside its window", () => {
    const plan = generatePlan(input([person("maya")]))!;
    expect(plan.favoredUserId).toBeNull();
    expect(plan.startsAt).toBeGreaterThanOrEqual(at(15));
    expect(plan.endsAt).toBeLessThanOrEqual(at(23));
    expect(isOpenFor(PLACE_BY_SLUG.get(plan.placeSlug)!, plan.startsAt, plan.durationMinutes)).toBe(true);
  });

  test("a crew of six gets a plan everyone is free for", () => {
    const crew = input(Array.from({ length: 6 }, (_, i) => person("u" + i)));
    const ranked = rankCandidates(crew);
    const plan = generatePlan(crew)!;
    expect(chosen(plan, ranked).freeCount).toBe(6);
    expect(plan.favoredUserId).toBeTruthy();
  });

  test("an empty crew on a free run gets a clean nothing", () => {
    expect(generatePlan(input([], { kind: "free", nowMs: at(14) }))).toBeNull();
  });
});

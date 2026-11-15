import { describe, expect, test } from "vitest";
import { BERKELEY_PLACES, HERO_KEYS, PLACE_BY_SLUG, heroKeyFor } from "../../convex/places/data";
import { EMPTY_MEMORY, type MemoryContext } from "../../convex/plans/memoryContext";
import { localTimeToMs, solarTimes } from "../../convex/plans/time";
import type { DayWeather } from "../../convex/plans/weather";
import { tripTo } from "../../convex/plans/travel";
import {
  FALLBACK_SLUGS,
  copyOk,
  fallbackPlan,
  favoredUser,
  generatePlan,
  isOpenFor,
  rankCandidates,
  validatePlan,
  type Attendee,
  type DropInput,
  type HistoryEntry,
} from "../../convex/plans/engine";

const DAY = "2026-11-18";
const at = (hh: number, mm = 0, day = DAY) => localTimeToMs(day, hh * 60 + mm);

const person = (userId: string, over: Partial<Attendee> = {}, day = DAY): Attendee => ({
  userId,
  limits: { budgetCents: null, energy: "anything", maxMinutes: null, homeBy: null },
  origin: null,
  window: { start: at(15, 0, day), end: at(23, 0, day) },
  taste: [],
  ...over,
});

const drop = (over: Partial<DropInput> = {}): DropInput => {
  const day = over.day ?? DAY;
  return {
    day,
    kind: "daily",
    seed: "group1:" + day,
    nowMs: at(12, 0, day),
    attendees: [person("maya", {}, day), person("dev", {}, day)],
    weather: null,
    memory: EMPTY_MEMORY,
    history: [],
    lastFrolicDay: null,
    ...over,
  };
};

const weather = (rain: boolean, day = DAY): DayWeather => {
  const sun = solarTimes(day);
  return {
    ...sun,
    hourly: Array.from({ length: 24 }, (_, i) => ({
      timeMs: localTimeToMs(day, i * 60),
      tempF: 62,
      precipProb: rain ? 85 : 5,
      code: rain ? 63 : 0,
      cloudCover: rain ? 95 : 10,
    })),
  };
};

const memory = (m: Partial<MemoryContext>): MemoryContext => ({ ...EMPTY_MEMORY, ...m });

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomDrop(seed: number): DropInput {
  const r = rng(seed);
  const days = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];
  const day = days[Math.floor(r() * days.length)];
  const n = 1 + Math.floor(r() * 5);
  const budgets = [0, 1000, 2500, null];
  const homes = [21 * 60, 22 * 60, 23 * 60, 24 * 60, null];
  const attendees = Array.from({ length: n }, (_, i) => {
    const start = 9 + Math.floor(r() * 10);
    return person(
      "u" + i,
      {
        limits: {
          budgetCents: budgets[Math.floor(r() * budgets.length)],
          energy: r() < 0.5 ? "chill" : "anything",
          maxMinutes: r() < 0.3 ? null : 5 + Math.floor(r() * 9) * 5,
          homeBy: homes[Math.floor(r() * homes.length)],
        },
        origin: { lat: 37.86 + r() * 0.03, lng: -122.29 + r() * 0.04 },
        window: { start: at(start, 0, day), end: at(Math.min(24, start + 2 + Math.floor(r() * 8)), 0, day) },
        taste: [["Sunsets"], ["Late-night food"], ["Games"], ["Outdoors", "Free stuff"], []][Math.floor(r() * 5)],
      },
      day,
    );
  });
  return drop({ day, attendees, nowMs: at(8, 0, day), weather: r() < 0.3 ? weather(r() < 0.5, day) : null });
}

describe("place set", () => {
  test("has 60 or more real places with unique slugs and sane data", () => {
    expect(BERKELEY_PLACES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(BERKELEY_PLACES.map((p) => p.slug)).size).toBe(BERKELEY_PLACES.length);
    for (const p of BERKELEY_PLACES) {
      expect(p.lat).toBeGreaterThan(37.7);
      expect(p.lat).toBeLessThan(37.95);
      expect(p.lng).toBeGreaterThan(-122.45);
      expect(p.lng).toBeLessThan(-122.2);
      expect(Number.isInteger(p.costPerPersonCents)).toBe(true);
      expect(p.source).toMatch(/^https:\/\//);
      expect(p.hours.length).toBe(7);
      expect(p.hours.some((d) => d.length > 0)).toBe(true);
      for (const s of [p.title, p.tip, p.fallbackWhy, p.costLabel, p.meetSpot]) expect(copyOk(s)).toBe(true);
    }
  });
});

describe("hero art", () => {
  test("every place maps to one of the five painted plan heroes", () => {
    for (const p of BERKELEY_PLACES) expect(HERO_KEYS).toContain(heroKeyFor(p));
    expect(heroKeyFor(PLACE_BY_SLUG.get("indian-rock")!)).toBe("plan-sunsets");
    expect(heroKeyFor(PLACE_BY_SLUG.get("cheese-board")!)).toBe("plan-late-night-food");
    expect(heroKeyFor(PLACE_BY_SLUG.get("victory-point-cafe")!)).toBe("plan-games");
    expect(heroKeyFor(PLACE_BY_SLUG.get("memorial-glade")!)).toBe("plan-outdoors");
    expect(new Set(BERKELEY_PLACES.map(heroKeyFor)).size).toBe(5);
  });

  test("plans carry the hero key of their place", () => {
    const plan = generatePlan(drop())!;
    expect(plan.heroKey).toBe(heroKeyFor(PLACE_BY_SLUG.get(plan.placeSlug)!));
  });
});

describe("generatePlan", () => {
  test("always returns a place id from the candidate list and validates", () => {
    for (let i = 0; i < 120; i++) {
      const input = randomDrop(i + 1);
      const plan = generatePlan(input);
      if (!plan) continue;
      const slugs = rankCandidates(input).map((c) => c.place.slug);
      if (plan.source === "fallback") expect(FALLBACK_SLUGS).toContain(plan.placeSlug);
      else expect(slugs).toContain(plan.placeSlug);
      expect(validatePlan(plan, input)).toBe(true);
    }
  });

  test("every candidate respects every attendee's private limits", () => {
    for (let i = 0; i < 120; i++) {
      const input = randomDrop(1000 + i);
      for (const c of rankCandidates(input)) {
        for (const a of input.attendees) {
          const { budgetCents, energy, maxMinutes, homeBy } = a.limits;
          if (budgetCents !== null) expect(c.place.costPerPersonCents).toBeLessThanOrEqual(budgetCents);
          if (energy === "chill") expect(c.place.energy).toBe("chill");
          const trip = tripTo(a.origin, c.place).minutes;
          if (maxMinutes !== null) expect(trip).toBeLessThanOrEqual(maxMinutes);
          if (homeBy !== null) expect((c.endMs - localTimeToMs(input.day, 0)) / 60000 + trip).toBeLessThanOrEqual(homeBy);
        }
      }
    }
  });

  test("the plan output never says whose limit excluded a place", () => {
    const input = drop({ attendees: [person("maya", { limits: { budgetCents: 0, energy: "chill", maxMinutes: 20, homeBy: 21 * 60 } }), person("dev")] });
    const plan = generatePlan(input)!;
    const text = JSON.stringify({ ...plan, candidates: [], minutesAway: {} });
    expect(text).not.toMatch(/budget cap|maya|limit/i);
    expect(plan.placeSlug).toBeTruthy();
    expect(PLACE_BY_SLUG.get(plan.placeSlug)!.costPerPersonCents).toBe(0);
  });

  test("closed places are never candidates", () => {
    for (let i = 0; i < 80; i++) {
      const input = randomDrop(5000 + i);
      for (const c of rankCandidates(input)) expect(isOpenFor(c.place, c.startMs, c.place.durationMin)).toBe(true);
    }
    const monday = "2026-11-16";
    const slugs = rankCandidates(drop({ day: monday })).map((c) => c.place.slug);
    expect(slugs).not.toContain("cheese-board");
    expect(slugs).not.toContain("bampfa");
    const wed = rankCandidates(drop()).map((c) => c.place.slug);
    expect(wed).toContain("cheese-board");
  });

  test("hikes that need daylight end before dark", () => {
    const input = drop({ weather: weather(false) });
    const sunset = solarTimes(DAY).sunsetMs;
    for (const c of rankCandidates(input)) if (c.place.needsDaylight) expect(c.endMs).toBeLessThanOrEqual(sunset + 20 * 60000);
  });

  test("rain moves an outdoor pick indoors", () => {
    const sunsetFans = [person("maya", { taste: ["Sunsets"] }), person("dev", { taste: ["Sunsets"] })];
    const dry = generatePlan(drop({ attendees: sunsetFans, weather: weather(false) }))!;
    expect(PLACE_BY_SLUG.get(dry.placeSlug)!.indoor).toBe(false);
    expect(dry.weatherSwap).toBe(false);
    const wet = generatePlan(drop({ attendees: sunsetFans, weather: weather(true) }))!;
    expect(PLACE_BY_SLUG.get(wet.placeSlug)!.indoor).toBe(true);
    expect(wet.weatherSwap).toBe(true);
    expect(wet.line).toMatch(/^Rain around/);
    expect(wet.chips).toContain("Dry inside");
  });

  test("golden hour boosts sunset spots for sunset people", () => {
    const plan = generatePlan(drop({ attendees: [person("maya", { taste: ["Sunsets"] }), person("dev", { taste: ["Sunsets"] })], weather: weather(false) }))!;
    expect(PLACE_BY_SLUG.get(plan.placeSlug)!.tags).toContain("sunsets");
    expect(plan.chips.some((c) => c.startsWith("Golden hour"))).toBe(true);
    expect(plan.line).toMatch(/Golden hour starts at \d+:\d\d\./);
  });

  test("fairness rotates who the plan favors over several days", () => {
    const crew = [person("maya", { taste: ["Sunsets"] }), person("dev", { taste: ["Games"] }), person("jordan", { taste: ["Late-night food"] })];
    const history: HistoryEntry[] = [];
    const favored: string[] = [];
    for (let d = 0; d < 6; d++) {
      const day = "2026-11-" + String(16 + d).padStart(2, "0");
      const plan = generatePlan(drop({ day, attendees: crew.map((a) => ({ ...a, window: { start: at(15, 0, day), end: at(23, 0, day) } })), history, seed: "g:" + day }))!;
      favored.push(plan.favoredUserId!);
      history.push({ day, placeSlug: plan.placeSlug, favoredUserId: plan.favoredUserId });
    }
    expect(new Set(favored.slice(0, 3)).size).toBe(3);
    expect(new Set(favored.slice(3, 6)).size).toBe(3);
    expect(new Set(history.map((h) => h.placeSlug)).size).toBeGreaterThanOrEqual(4);
  });

  test("favoredUser picks whoever was favored longest ago", () => {
    const crew = [person("a"), person("b"), person("c")];
    expect(favoredUser(crew, [{ day: "2026-11-10", placeSlug: "x", favoredUserId: "a" }, { day: "2026-11-11", placeSlug: "x", favoredUserId: "b" }], "s")).toBe("c");
    expect(favoredUser(crew, [{ day: "2026-11-12", placeSlug: "x", favoredUserId: "a" }, { day: "2026-11-11", placeSlug: "x", favoredUserId: "b" }, { day: "2026-11-13", placeSlug: "x", favoredUserId: "c" }], "s")).toBe("b");
  });

  test("a tag skipped twice is never suggested, once is only a penalty", () => {
    const bobaFans = [person("maya", { taste: ["boba"] }), person("dev", { taste: ["boba"] })];
    const before = generatePlan(drop({ attendees: bobaFans }))!;
    expect(PLACE_BY_SLUG.get(before.placeSlug)!.tags).toContain("boba");
    const once = rankCandidates(drop({ attendees: bobaFans, memory: memory({ skipped: [{ tag: "boba", count: 1 }] }) }));
    expect(once.some((c) => c.place.tags.includes("boba"))).toBe(true);
    const twice = drop({ attendees: bobaFans, memory: memory({ skipped: [{ tag: "boba", count: 2 }] }) });
    expect(rankCandidates(twice).some((c) => c.place.tags.includes("boba"))).toBe(false);
    expect(PLACE_BY_SLUG.get(generatePlan(twice)!.placeSlug)!.tags).not.toContain("boba");
    const suppressed = drop({ attendees: bobaFans, memory: memory({ suppressed: ["boba", "indian-rock"] }) });
    const slugs = rankCandidates(suppressed).map((c) => c.place.slug);
    expect(slugs).not.toContain("indian-rock");
    expect(slugs).not.toContain("plentea");
  });

  test("works without weather, using the computed sunset", () => {
    const plan = generatePlan(drop({ weather: null }))!;
    expect(plan.weather).toBeNull();
    expect(Math.abs(plan.sunsetAt - solarTimes(DAY).sunsetMs)).toBeLessThan(1000);
    expect(plan.line).toMatch(/^(Sunset at|Golden hour starts at) \d+:\d\d\.$/);
  });

  test("computed sunset matches the real Berkeley sunset within a few minutes", () => {
    const { sunsetMs } = solarTimes("2026-11-15");
    expect(Math.abs(sunsetMs - localTimeToMs("2026-11-15", 16 * 60 + 58))).toBeLessThan(5 * 60000);
  });

  test("hand-written fallback plan is valid and inside limits", () => {
    const input = drop({ attendees: [person("maya", { limits: { budgetCents: 0, energy: "chill", maxMinutes: null, homeBy: null } }), person("dev")] });
    const plan = fallbackPlan(input)!;
    expect(plan.source).toBe("fallback");
    expect(FALLBACK_SLUGS).toContain(plan.placeSlug);
    expect(plan.why).toBe(PLACE_BY_SLUG.get(plan.placeSlug)!.fallbackWhy);
    expect(validatePlan(plan, input)).toBe(true);
  });

  test("returns null rather than breaking a limit when nothing fits", () => {
    const input = drop({ attendees: [person("maya", { limits: { budgetCents: 0, energy: "chill", maxMinutes: 1, homeBy: null }, origin: { lat: 37.75, lng: -122.25 } }), person("dev")] });
    expect(rankCandidates(input)).toHaveLength(0);
    expect(generatePlan(input)).toBeNull();
  });

  test("deterministic for a fixed seed and fast", () => {
    for (let i = 0; i < 20; i++) {
      const input = randomDrop(9000 + i);
      expect(JSON.stringify(generatePlan(input))).toBe(JSON.stringify(generatePlan(structuredClone(input))));
    }
    const big = drop({ attendees: Array.from({ length: 12 }, (_, i) => person("u" + i, { taste: ["Sunsets", "Games"] })), weather: weather(false) });
    const t0 = performance.now();
    generatePlan(big);
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  test("comeback plan brings back the favorite after a quiet week", () => {
    const plan = generatePlan(
      drop({
        weather: weather(false),
        lastFrolicDay: "2026-11-08",
        memory: memory({ pastNights: [{ id: "m1", text: "Indian Rock at sunset, 4 of us, best night of the fall", placeId: "indian-rock", date: "2026-10-12" }] }),
      }),
    )!;
    expect(plan.placeSlug).toBe("indian-rock");
    expect(plan.why).toBe("Indian Rock was your favorite. Same time?");
    expect(plan.whySource).toBe("memory");
    expect(plan.whyMemoryId).toBe("m1");
  });

  test("why line quotes a real past night at the chosen place", () => {
    const plan = generatePlan(
      drop({
        weather: weather(false),
        attendees: [person("maya", { taste: ["Sunsets"] }), person("dev", { taste: ["Sunsets"] })],
        memory: memory({ pastNights: [{ id: "m9", text: "The Marina sunset in October was our best night", placeId: "berkeley-marina", date: "2026-10-03" }, { id: "m8", text: "Indian Rock with Dev", placeId: "indian-rock" }] }),
      }),
    )!;
    const night = ["berkeley-marina", "indian-rock"].includes(plan.placeSlug);
    expect(night).toBe(true);
    expect(plan.whySource).toBe("memory");
    expect(plan.why).toMatch(/you loved it here/);
    expect(plan.whyInputs.memory).toBeTruthy();
  });

  test("why line names a liked tag in the house voice, never a raw tag list", () => {
    const plan = generatePlan(drop({ weather: weather(false), memory: memory({ likedTags: ["Late-night food"] }), attendees: [person("maya", { window: { start: at(21), end: at(24) } }), person("dev", { window: { start: at(21), end: at(24) } })] }))!;
    expect(plan.why).toMatch(/^you keep picking late-night food, /);
    expect(plan.why).not.toMatch(/_/);
    expect(copyOk(plan.why)).toBe(true);
  });

  test("solo mode plans for one person", () => {
    const plan = generatePlan(drop({ kind: "solo", attendees: [person("me", { taste: ["Games"] })] }))!;
    expect(plan).not.toBeNull();
    expect(plan.favoredUserId).toBeNull();
    expect(Object.keys(plan.minutesAway)).toEqual(["me"]);
  });

  test("time is picked from shared free time", () => {
    const input = drop({ attendees: [person("maya", { window: { start: at(17), end: at(20) } }), person("dev", { window: { start: at(18), end: at(22) } }), person("jo", { window: { start: at(10), end: at(13) } })] });
    const plan = generatePlan(input)!;
    expect(plan.startsAt).toBeGreaterThanOrEqual(at(18));
    expect(plan.endsAt).toBeLessThanOrEqual(at(20));
  });

  test("a late-night window gets late-night food", () => {
    const plan = generatePlan(drop({ attendees: [person("maya", { window: { start: at(22), end: at(25) } }), person("dev", { window: { start: at(22), end: at(25) } })] }))!;
    expect(PLACE_BY_SLUG.get(plan.placeSlug)!.bestTimes).toContain("late_night");
  });

  test("model preference is used only when it is a candidate", () => {
    const input = drop();
    const ranked = rankCandidates(input);
    const second = ranked[1].place.slug;
    const chosen = generatePlan(input, { preferredSlug: second, preferredWhy: "Dev has been asking for this one." })!;
    expect(chosen.placeSlug).toBe(second);
    expect(chosen.source).toBe("model");
    expect(chosen.whySource).toBe("haiku");
    const invented = generatePlan(input, { preferredSlug: "made-up-place" })!;
    expect(invented.placeSlug).toBe(ranked[0].place.slug);
    expect(invented.source).toBe("scorer");
    const badCopy = generatePlan(input, { preferredSlug: second, preferredWhy: "So fun!" })!;
    expect(badCopy.whySource).not.toBe("haiku");
  });
});

describe("day bounds", () => {
  test("a weekend plan booked on Thursday never starts before its own day", () => {
    const saturday = "2026-11-21";
    const thursdayNoon = localTimeToMs("2026-11-19", 9 * 60);
    const input = drop({
      day: saturday,
      kind: "weekend",
      nowMs: thursdayNoon,
      attendees: [person("maya", {}, saturday), person("dev", {}, saturday)],
    });
    const ranked = rankCandidates(input);
    expect(ranked.length).toBeGreaterThan(0);
    const dayStart = localTimeToMs(saturday, 0);
    const dayEnd = localTimeToMs("2026-11-22", 0);
    for (const c of ranked) {
      expect(c.startMs).toBeGreaterThanOrEqual(dayStart);
      expect(c.endMs).toBeLessThanOrEqual(dayEnd);
    }
    const plan = generatePlan(input)!;
    expect(plan.startsAt).toBeGreaterThanOrEqual(dayStart);
  });
});

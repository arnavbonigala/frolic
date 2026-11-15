import { describe, expect, test } from "vitest";
import { PLACE_BY_SLUG } from "../../convex/places/data";
import { EMPTY_MEMORY } from "../../convex/plans/memoryContext";
import { addDays, clockLabel, localParts, localTimeToMs, solarTimes, weekdayOf } from "../../convex/plans/time";
import type { DayWeather } from "../../convex/plans/weather";
import { copyOk, generatePlan, isOpenFor, type Attendee, type DropInput, type HistoryEntry, type Plan } from "../../convex/plans/engine";

declare const process: { env: Record<string, string | undefined> };

const WEEKDAY = "2026-11-18";
const WEEKEND = "2026-11-21";

const TASTES: Record<string, string[]> = {
  sunsets: ["sunsets", "views", "free"],
  outdoors: ["outdoors", "hiking", "nature"],
  lateNight: ["late_night_food", "dessert", "food"],
  games: ["games", "board_games", "coffee"],
  free: ["free_stuff", "books", "music"],
  mixed: ["sunsets", "late_night_food", "games", "free"],
  none: [],
};

type Sky = "clear" | "rain" | "cold" | "none";

function sky(kind: Sky, day: string): DayWeather | null {
  if (kind === "none") return null;
  return {
    ...solarTimes(day),
    hourly: Array.from({ length: 24 }, (_, i) => ({
      timeMs: localTimeToMs(day, i * 60),
      tempF: kind === "cold" ? 44 : kind === "rain" ? 55 : i < 9 || i > 19 ? 54 : 64,
      precipProb: kind === "rain" ? 85 : 5,
      code: kind === "rain" ? 63 : 0,
      cloudCover: kind === "rain" ? 95 : 10,
    })),
  };
}

type Case = { name: string; day: string; nowMin: number; taste: string; sky: Sky; hours: number | null; budget: number | null; history?: HistoryEntry[] };

const at = (day: string, min: number) => localTimeToMs(day, min);

function input(c: Case): DropInput {
  const nowMs = at(c.day, c.nowMin);
  const end = c.hours === null ? at(addDays(c.day, 1), 0) : nowMs + c.hours * 3_600_000;
  const person = (userId: string): Attendee => ({
    userId,
    limits: { budgetCents: c.budget, energy: "anything", maxMinutes: null, homeBy: null },
    origin: null,
    window: { start: nowMs, end },
    taste: TASTES[c.taste],
  });
  return {
    day: c.day,
    kind: c.hours === null ? "daily" : "free",
    seed: "crew:" + c.day + ":" + c.name,
    nowMs,
    attendees: [person("maya"), person("dev"), person("jordan")],
    weather: sky(c.sky, c.day),
    memory: EMPTY_MEMORY,
    history: c.history ?? [],
    lastFrolicDay: null,
  };
}

const TIMES: [string, number][] = [
  ["9am", 9 * 60],
  ["noon", 12 * 60],
  ["3pm", 15 * 60],
  ["9pm", 21 * 60],
  ["11:30pm", 23 * 60 + 30],
];

function grid(): Case[] {
  const out: Case[] = [];
  for (const [label, nowMin] of TIMES)
    for (const taste of Object.keys(TASTES))
      for (const s of ["clear", "rain"] as Sky[]) out.push({ name: `${taste} ${label} ${s} wkday`, day: WEEKDAY, nowMin, taste, sky: s, hours: null, budget: null });
  for (const [label, nowMin] of TIMES)
    for (const taste of ["sunsets", "lateNight", "mixed"]) {
      out.push({ name: `${taste} ${label} cold wkend`, day: WEEKEND, nowMin, taste, sky: "cold", hours: null, budget: null });
      out.push({ name: `${taste} ${label} clear wkend $0`, day: WEEKEND, nowMin, taste, sky: "clear", hours: null, budget: 0 });
    }
  for (const hours of [1, 2, 4])
    for (const [label, nowMin] of TIMES)
      out.push({ name: `free ${hours}h mixed ${label} clear`, day: WEEKDAY, nowMin, taste: "mixed", sky: "clear", hours, budget: 1500 });
  return out;
}

function problems(plan: Plan | null, c: Case): string[] {
  if (!plan) return [];
  const issues: string[] = [];
  const place = PLACE_BY_SLUG.get(plan.placeSlug) ?? null;
  const { sunriseMs, sunsetMs } = solarTimes(c.day);
  const dark = plan.startsAt > sunsetMs + 20 * 60_000 || plan.startsAt < sunriseMs;
  if (place && !place.indoor && dark && !place.bestTimes.includes("late_night")) issues.push("outdoor after dark");
  if (place && !plan.drop && !isOpenFor(place, plan.startsAt, place.durationMin)) issues.push("closed");
  if (/sunset|golden hour|dusk/i.test(plan.title) && Math.abs(plan.startsAt - (sunsetMs - 45 * 60_000)) > 90 * 60_000) issues.push("sunset title off golden hour");
  if (/sunset at \d|golden hour starts/i.test(plan.line) && !(place?.tags.includes("sunsets") ?? false)) issues.push("sunset line on non-sunset place");
  if (c.sky === "rain" && place && !place.indoor) issues.push("outside in the rain");
  if (/^late-night|^midnight/i.test(plan.title) && localParts(plan.startsAt).minutes < 20 * 60 && localParts(plan.startsAt).minutes > 4 * 60) issues.push("late-night title in daytime");
  for (const s of [plan.title, plan.line, plan.why, ...plan.chips]) if (!copyOk(s)) issues.push("copy: " + s);
  return issues;
}

const fmt = (p: Plan | null) =>
  p ? `${p.title} @ ${clockLabel(p.startsAt)} | ${p.line} | why: ${p.why} | [${p.chips.join(" / ")}] | ${p.costLabel}` : "NO PLAN";

function week(taste: string, start: string): Plan[] {
  const history: HistoryEntry[] = [];
  const plans: Plan[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i);
    const nowMin = weekdayOf(day) === 0 || weekdayOf(day) === 6 ? 11 * 60 : 15 * 60;
    const plan = generatePlan(input({ name: "week", day, nowMin, taste, sky: "clear", hours: null, budget: null, history: [...history] }));
    if (!plan) continue;
    plans.push(plan);
    history.push({ day, placeSlug: plan.placeSlug, favoredUserId: plan.favoredUserId });
  }
  return plans;
}

let cached: { c: Case; plan: Plan | null }[] | null = null;
const runs = () => (cached ??= grid().map((c) => ({ c, plan: generatePlan(input(c)) })));
const weeks = new Map<string, Plan[]>();
const weekOf = (taste: string) => weeks.get(taste) ?? weeks.set(taste, week(taste, WEEKDAY)).get(taste)!;

describe("plan quality grid", () => {
  test("print the grid", () => {
    if (process.env.PLAN_GRID !== "1") return;
    const lines: string[] = [];
    for (const { c, plan } of runs()) {
      const issues = problems(plan, c);
      lines.push(`${c.name.padEnd(30)} ${fmt(plan)}${issues.length ? "  <<< " + issues.join("; ") : ""}`);
    }
    for (const taste of Object.keys(TASTES)) {
      lines.push(`week ${taste}: ` + weekOf(taste).map((p) => p.placeSlug).join(", "));
    }
    console.log(lines.join("\n"));
  });

  test("no plan in the grid breaks the basic rules", { timeout: 30_000 }, () => {
    const bad = runs().flatMap(({ c, plan }) => problems(plan, c).map((i) => c.name + ": " + i));
    expect(bad).toEqual([]);
  });

  test("a crew does not get the same place twice in four days", () => {
    for (const taste of Object.keys(TASTES)) {
      const slugs = weekOf(taste).map((p) => p.placeSlug);
      for (let i = 0; i < slugs.length; i++) expect(slugs.slice(Math.max(0, i - 3), i)).not.toContain(slugs[i]);
    }
  });

  test("categories rotate across a week for a mixed crew", () => {
    const firstTags = weekOf("mixed").map((p) => PLACE_BY_SLUG.get(p.placeSlug)!.tags[0]);
    expect(new Set(firstTags).size).toBeGreaterThanOrEqual(4);
  });
});

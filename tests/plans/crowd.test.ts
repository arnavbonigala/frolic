import { describe, expect, test } from "vitest";
import { BERKELEY_PLACES, PLACE_BY_SLUG, type Place } from "../../convex/places/data";
import { EMPTY_MEMORY } from "../../convex/plans/memoryContext";
import { localTimeToMs } from "../../convex/plans/time";
import { CROWD_TAGS, crowdWeight } from "../../convex/plans/crowd";
import { generatePlan, type Attendee, type DropInput } from "../../convex/plans/engine";

const DAY = "2026-11-18";
const at = (hh: number) => localTimeToMs(DAY, hh * 60);
const person = (userId: string, taste: string[] = []): Attendee => ({
  userId,
  limits: { budgetCents: null, energy: "anything", maxMinutes: null, homeBy: null },
  origin: null,
  window: { start: at(15), end: at(23) },
  taste,
});

const twin = (slug: string, tags: Place["tags"]): Place => ({ ...PLACE_BY_SLUG.get("pegasus-books")!, slug, name: slug, tags });

const input = (attendees: Attendee[], places: Place[]): DropInput => ({
  day: DAY,
  kind: "daily",
  seed: "crowd:" + DAY,
  nowMs: at(12),
  attendees,
  weather: null,
  memory: EMPTY_MEMORY,
  history: [],
  lastFrolicDay: null,
  places,
});

describe("crowd prior", () => {
  test("weights are normalized to 0..1 and cover catalog primary tags", () => {
    const values = Object.values(CROWD_TAGS);
    expect(Math.max(...values)).toBe(1);
    expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
    for (const p of BERKELEY_PLACES) expect(crowdWeight(p)).toBeGreaterThanOrEqual(0);
  });

  test("breaks a tie for a cold-start crew toward the higher-demand archetype", () => {
    const low = twin("low-demand-spot", ["campus"]);
    const high = twin("high-demand-spot", ["games"]);
    expect(crowdWeight(high)).toBeGreaterThan(crowdWeight(low) + 0.2);
    const plan = generatePlan(input([person("maya"), person("dev")], [low, high]));
    expect(plan?.placeSlug).toBe("high-demand-spot");
  });

  test("stays a tiebreak when the crew has a stated taste", () => {
    const low = twin("low-demand-spot", ["campus"]);
    const high = twin("high-demand-spot", ["games"]);
    const plan = generatePlan(input([person("maya", ["campus"]), person("dev", ["campus"])], [low, high]));
    expect(plan?.placeSlug).toBe("low-demand-spot");
  });
});

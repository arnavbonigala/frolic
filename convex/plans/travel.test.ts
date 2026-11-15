import { describe, expect, test } from "vitest";
import { PLACE_BY_SLUG } from "../places/data";
import { CAMPUS, distanceKm, tripLabel, tripTo } from "./travel";

describe("travel", () => {
  test("walks to nearby campus places", () => {
    const trip = tripTo(null, PLACE_BY_SLUG.get("memorial-glade")!);
    expect(trip.mode).toBe("walk");
    expect(trip.minutes).toBeGreaterThan(0);
    expect(tripLabel(trip)).toMatch(/min walk$/);
  });

  test("counts BART for city trips", () => {
    const ferry = tripTo(null, PLACE_BY_SLUG.get("ferry-building")!);
    expect(ferry.mode).toBe("bart");
    expect(ferry.minutes).toBeGreaterThan(25);
    expect(tripLabel(ferry)).toMatch(/^BART, \d+ min$/);
  });

  test("holds the line from the mock for Indian Rock", () => {
    const minutes = tripTo(null, PLACE_BY_SLUG.get("indian-rock")!).minutes;
    expect(minutes).toBeGreaterThanOrEqual(8);
    expect(minutes).toBeLessThanOrEqual(25);
  });

  test("measures real distance", () => {
    expect(distanceKm(CAMPUS, CAMPUS)).toBe(0);
    const rock = PLACE_BY_SLUG.get("indian-rock")!;
    expect(distanceKm(CAMPUS, { lat: rock.lat, lng: rock.lng })).toBeGreaterThan(1);
    expect(distanceKm(CAMPUS, { lat: 37.7955, lng: -122.3937 })).toBeGreaterThan(14);
  });
});

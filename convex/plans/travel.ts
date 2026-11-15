import type { Place } from "../places/data";

export type LatLng = { lat: number; lng: number };

export const CAMPUS: LatLng = { lat: 37.8703, lng: -122.2595 };
const DOWNTOWN_BART: LatLng = { lat: 37.8701, lng: -122.2681 };
const BART_RIDE_MIN: Record<string, number> = { embr: 23, "16th": 28, "19th": 13, ashb: 5 };
const STATION_WALK_MIN: Record<string, number> = { embr: 5, "16th": 10, "19th": 8, ashb: 1 };

export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}

const walkMin = (a: LatLng, b: LatLng) => distanceKm(a, b) * 1.3 * 12.5;

export type Trip = { minutes: number; mode: "walk" | "bart" | "transit" };

export function tripTo(origin: LatLng | null, place: Place): Trip {
  const from = origin ?? CAMPUS;
  if (place.bartStation && BART_RIDE_MIN[place.bartStation] !== undefined && place.bartStation !== "ashb") {
    const minutes = walkMin(from, DOWNTOWN_BART) + 4 + BART_RIDE_MIN[place.bartStation] + STATION_WALK_MIN[place.bartStation];
    return { minutes: Math.round(minutes), mode: "bart" };
  }
  const walk = walkMin(from, place);
  if (walk <= 25) return { minutes: Math.max(1, Math.round(walk)), mode: "walk" };
  return { minutes: Math.round(Math.min(walk, 10 + distanceKm(from, place) * 3.5)), mode: "transit" };
}

export function tripLabel(trip: Trip): string {
  if (trip.mode === "walk") return trip.minutes + " min walk";
  if (trip.mode === "bart") return "BART, " + trip.minutes + " min";
  return trip.minutes + " min by bus";
}

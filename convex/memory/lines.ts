import type { PlaceTag } from "../places/data";
import { TAG_LABEL } from "../plans/engine";
import { suppressedTags, SUPPRESS_AFTER, type TagStat } from "./context";

export const LOVE_LINES: Record<PlaceTag, string> = {
  sunsets: "You always end up chasing the sunset.",
  views: "You will climb anything for a view.",
  outdoors: "You are happiest outside.",
  free: "You can find a good night for nothing.",
  hiking: "You never say no to a good hike.",
  picnic: "You turn any afternoon into a picnic.",
  food: "You plan the day around the table.",
  late_night_food: "You always end at the noodle place.",
  dessert: "You always save room for dessert.",
  coffee: "You solve most plans over coffee.",
  boba: "You keep coming back to boba.",
  games: "You are never done after one round.",
  books: "You get lost in a bookshop together.",
  music: "You follow the live music.",
  art: "You always stop for what is on the wall.",
  science: "You like to find out how things work.",
  nature: "You keep finding the quiet green spots.",
  water: "You are never far from the water.",
  animals: "You cannot walk past an animal.",
  market: "You wander a market until it closes.",
  climbing: "You like a little altitude.",
  play: "You are at your best when you are being silly.",
  campus: "You know every good corner of campus.",
  city_trip: "You can never resist a trip to the city.",
};

const isPlaceTag = (tag: string): tag is PlaceTag => tag in LOVE_LINES;

export function crewLines(stats: TagStat[]): string[] {
  const suppressed = suppressedTags(stats);
  const love = stats
    .filter((s) => isPlaceTag(s.tag) && s.liked >= SUPPRESS_AFTER && !suppressed.includes(s.tag))
    .sort((a, b) => b.liked - a.liked)[0];
  const avoid = stats
    .filter((s) => isPlaceTag(s.tag) && suppressed.includes(s.tag))
    .sort((a, b) => b.skipped - a.skipped)[0];
  const lines: string[] = [];
  if (love && isPlaceTag(love.tag)) lines.push(LOVE_LINES[love.tag]);
  if (avoid && isPlaceTag(avoid.tag)) lines.push("You keep passing on " + TAG_LABEL[avoid.tag] + ", so Frolic stopped suggesting it.");
  return lines;
}

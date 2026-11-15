import { HERO_IMAGES } from "./heroes";

const HERO_BY_TAG: Record<string, string> = {
  sunsets: "plan-sunsets",
  sunset: "plan-sunsets",
  "golden hour": "plan-sunsets",
  marina: "plan-sunsets",
  outdoors: "plan-outdoors",
  picnic: "plan-outdoors",
  climbing: "plan-outdoors",
  hike: "plan-outdoors",
  park: "plan-outdoors",
  "late-night food": "plan-late-night-food",
  "late night": "plan-late-night-food",
  food: "plan-late-night-food",
  pizza: "plan-late-night-food",
  games: "plan-games",
  bowling: "plan-games",
  "free stuff": "plan-free-stuff",
  free: "plan-free-stuff",
  campus: "plan-free-stuff",
  pier: "plan-free-stuff",
};

export function heroKey(tags: string[]): string | null {
  for (const tag of tags) {
    const key = HERO_BY_TAG[tag.trim().toLowerCase()];
    if (key) return key;
  }
  return null;
}

export function heroBytes(key: string): Uint8Array | null {
  if (!Object.prototype.hasOwnProperty.call(HERO_IMAGES, key)) return null;
  return Uint8Array.from(atob(HERO_IMAGES[key]), (c) => c.charCodeAt(0));
}

export function heroUrl(tags: string[]): string | null {
  const key = heroKey(tags);
  if (!key || !Object.prototype.hasOwnProperty.call(HERO_IMAGES, key)) return null;
  return `/p/hero/${key}.jpg`;
}

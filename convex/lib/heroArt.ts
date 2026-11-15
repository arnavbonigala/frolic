import { PLACE_BY_SLUG, heroKeyFor, type HeroKey } from "../places/data";

export function heroKeyOf(slug: string): HeroKey {
  const seeded = PLACE_BY_SLUG.get(slug);
  return seeded ? heroKeyFor(seeded) : "plan-free-stuff";
}

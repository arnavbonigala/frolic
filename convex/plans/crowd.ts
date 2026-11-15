import type { Place, PlaceTag } from "../places/data";

export const CROWD_ARCHETYPES: { key: string; likes: number; tags: PlaceTag[] }[] = [
  { key: "classes_and_skills", likes: 12307, tags: ["art", "science"] },
  { key: "random_lecture_on_campus", likes: 464, tags: ["campus"] },
  { key: "walk_and_wander", likes: 7660, tags: ["outdoors", "views"] },
  { key: "mini_golf_bowling_arcade", likes: 6458, tags: ["games", "play"] },
  { key: "art_and_crafts", likes: 5988, tags: ["art"] },
  { key: "eat_out", likes: 5987, tags: ["food", "late_night_food"] },
  { key: "coffee_date", likes: 5722, tags: ["coffee"] },
  { key: "hike_nature_sunrise", likes: 4399, tags: ["hiking", "nature", "sunsets"] },
  { key: "animals_aquarium_zoo", likes: 4282, tags: ["animals"] },
  { key: "escape_room_mystery", likes: 4138, tags: ["games"] },
  { key: "cook_and_bake", likes: 3914, tags: ["food", "market"] },
  { key: "night_adventure_rooftop", likes: 3717, tags: ["late_night_food", "views"] },
  { key: "library_and_books", likes: 3675, tags: ["books"] },
  { key: "park_picnic_playground", likes: 3210, tags: ["picnic", "play", "outdoors"] },
  { key: "karaoke_bar_dance", likes: 2885, tags: ["music"] },
  { key: "hide_and_seek", likes: 2784, tags: ["play"] },
  { key: "skating", likes: 2589, tags: ["play"] },
  { key: "concerts_and_events", likes: 2422, tags: ["music"] },
  { key: "beach_lake_water", likes: 2102, tags: ["water"] },
  { key: "museum_visit", likes: 1911, tags: ["art", "science"] },
  { key: "bus_or_train_somewhere_new", likes: 1907, tags: ["city_trip"] },
  { key: "ice_cream_dessert", likes: 1884, tags: ["dessert", "boba"] },
  { key: "photo_walk", likes: 1759, tags: ["views", "art"] },
  { key: "thrift_mall_market", likes: 1860, tags: ["market"] },
  { key: "board_and_card_games", likes: 1069, tags: ["games"] },
  { key: "volunteer_outdoors", likes: 1088, tags: ["nature", "animals"] },
];

export const CROWD_SLUGS: Record<string, number> = {
  "games-of-berkeley": 1,
  "victory-point-cafe": 1,
  "lawrence-hall": 0.9,
  "tilden-little-farm": 0.8,
};

function normalize(): Record<PlaceTag, number> {
  const sums = new Map<PlaceTag, number>();
  for (const a of CROWD_ARCHETYPES) for (const t of a.tags) sums.set(t, (sums.get(t) ?? 0) + a.likes / a.tags.length);
  const max = Math.max(...sums.values());
  return Object.fromEntries([...sums].map(([t, s]) => [t, Math.round((s / max) * 100) / 100])) as Record<PlaceTag, number>;
}

export const CROWD_TAGS: Partial<Record<PlaceTag, number>> = normalize();

export function crowdWeight(place: Place): number {
  if (place.slug in CROWD_SLUGS) return CROWD_SLUGS[place.slug];
  return place.tags[0] ? CROWD_TAGS[place.tags[0]] ?? 0 : 0;
}

export type TasteSource = "device" | "template" | "haiku";

export type TasteLine = { headline: string; why: string; source: TasteSource };

export const HEADLINE_MAX = 40;
export const WHY_MAX = 140;

type Template = { name: string; phrase: string };

export const TAG_TEMPLATES: Record<string, Template> = {
  sunset: { name: "Sunset Crew", phrase: "golden-hour chasers" },
  outdoors: { name: "Fresh Air Club", phrase: "happiest outside" },
  "late-night-food": { name: "Late-Night Noodle Society", phrase: "night owls who follow the smell of dinner" },
  games: { name: "The Rematch Club", phrase: "never done after one round" },
  "free-stuff": { name: "Free Fun Collective", phrase: "experts at a good night for nothing" },
  boba: { name: "Boba Council", phrase: "always one sip from a plan" },
  coffee: { name: "Slow Morning Society", phrase: "good conversation over a warm cup" },
  music: { name: "Front Row Friends", phrase: "drawn toward live sound" },
  art: { name: "Gallery Hoppers", phrase: "curious about whatever is on the wall" },
  views: { name: "High Ground Gang", phrase: "in it for the view" },
  water: { name: "Shoreline Crew", phrase: "never far from the water" },
  food: { name: "Second Helpings Club", phrase: "planning around the table" },
  indoor: { name: "Cozy Corner Crew", phrase: "happy anywhere with a roof and good company" },
};

const ALIASES: Record<string, string> = {
  sunsets: "sunset",
  goldenhour: "sunset",
  "golden-hour": "sunset",
  outdoor: "outdoors",
  hike: "outdoors",
  hiking: "outdoors",
  picnic: "outdoors",
  beach: "water",
  marina: "water",
  pier: "water",
  nightlife: "late-night-food",
  latenight: "late-night-food",
  "late-night": "late-night-food",
  pizza: "food",
  noodles: "late-night-food",
  dinner: "food",
  game: "games",
  bowling: "games",
  arcade: "games",
  free: "free-stuff",
  campus: "free-stuff",
  freestuff: "free-stuff",
  cafe: "coffee",
  tea: "boba",
  concert: "music",
  gallery: "art",
  museum: "art",
  view: "views",
  lookout: "views",
  climbing: "outdoors",
};

export const normalizeTag = (tag: string) => {
  const k = tag.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return ALIASES[k] ?? ALIASES[k.replace(/-/g, "")] ?? k;
};

const GENERIC: Template = { name: "The Good Company", phrase: "here for whatever the day brings" };

export function templateTaste(topTags: string[], budget: string[]): TasteLine {
  const keys = [...new Set(topTags.map(normalizeTag))];
  const first = TAG_TEMPLATES[keys[0]] ?? GENERIC;
  const second = keys[1] ? TAG_TEMPLATES[keys[1]] : undefined;
  const money = budget[0]?.replace(/[.!]+$/, "");
  const parts = [first.phrase[0].toUpperCase() + first.phrase.slice(1)];
  if (second) parts.push("with a soft spot for " + second.phrase);
  if (money) parts.push(money.charAt(0).toLowerCase() + money.slice(1));
  return { headline: first.name, why: parts.join(", ") + ".", source: "template" };
}

export function validateTasteLine(line: { headline: string; why: string }): string | null {
  const headline = line.headline.trim();
  const why = line.why.trim();
  if (!headline || headline.length > HEADLINE_MAX) return "headline must be 1 to " + HEADLINE_MAX + " characters";
  if (!why || why.length > WHY_MAX) return "why must be 1 to " + WHY_MAX + " characters";
  for (const text of [headline, why]) {
    if (/[\u2014\u2013]/.test(text)) return "no dashes of the em or en kind";
    if (text.includes("!")) return "no exclamation marks";
    if (/\bnot\b[^.]{0,40}\bbut\b/i.test(text)) return "no not-X-but-Y phrasing";
  }
  return null;
}

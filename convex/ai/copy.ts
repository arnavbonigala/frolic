import { copyOk } from "../plans/engine";
import { dateLabel } from "../plans/time";
import { callStructured, type Fetcher, type JsonSchema } from "./openai";

export type CopyInput =
  | { kind: "tasteHeadline"; tags: string[]; vibe: string[]; budget: string[] }
  | { kind: "why"; placeName: string; topTags: string[]; memory: string | null; weather: string | null; rainSwap: boolean }
  | { kind: "gardenCaption"; placeName: string; date: string; people: number; memory: string | null };

export type CopyOutput =
  | { kind: "tasteHeadline"; headline: string; why: string }
  | { kind: "why"; text: string }
  | { kind: "gardenCaption"; text: string };

export const COPY_MAX = { headline: 32, tasteWhy: 90, why: 120, caption: 80 } as const;

const VOICE = [
  "You write copy for Frolic, which turns a friend group's tastes into one plan for tonight.",
  "",
  "Voice:",
  "- Plain and warm. Say what is true of this group: what they like, what it costs, and the sky only when a weather line is given.",
  "- Lowercase openings on why lines and captions. Sentence case elsewhere.",
  "- Commas, not dashes. No em dashes. No exclamation marks. No hype adjectives, no emoji, no hashtags.",
  "- Never the shape not X, but Y.",
].join("\n");

const KIND_PROMPT: Record<CopyInput["kind"], string> = {
  tasteHeadline: [
    "Write a crew name and a one line why for this group's taste.",
    "headline is the name they will recognize, at most 32 characters, title case, like Sunset Crew or Late-Night Noodle Society.",
    "why is one clause at most 90 characters, lowercase start, like: you keep picking sunsets, free stuff, and being outside.",
  ].join("\n"),
  why: [
    "Write the one line reason under tonight's plan.",
    "At most 120 characters, lowercase start, one clause, ends with a period.",
    'Like: you\'re into sunsets, it\'s free, and the sky\'s clear until dark.',
    "If memory is set, use it in the line. If rainSwap is true, the plan moved indoors because of rain.",
  ].join("\n"),
  gardenCaption: [
    "Write one line for the group's memory book about the night that just happened.",
    "At most 80 characters, one full sentence that starts with a capital, like: Three of us at the marina on Nov 15, and the sky did the rest.",
    "Mention the place. If memory is set, fold in what someone said about it.",
  ].join("\n"),
};

export function copySchema(kind: CopyInput["kind"]): JsonSchema {
  if (kind === "tasteHeadline") {
    return {
      type: "object",
      properties: {
        headline: { type: "string", description: "crew name, at most " + COPY_MAX.headline + " characters" },
        why: { type: "string", description: "one clause, at most " + COPY_MAX.tasteWhy + " characters" },
      },
      required: ["headline", "why"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: { text: { type: "string", description: "one line of copy" } },
    required: ["text"],
    additionalProperties: false,
  };
}

export function copyPrompt(input: CopyInput): { system: string; user: string } {
  return { system: VOICE + "\n\n" + KIND_PROMPT[input.kind], user: copyBrief(input) };
}

function plainName(name: string): string {
  const flat = name
    .replace(/[\u2014\u2013]/g, ",")
    .replace(/!/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > 0 ? flat : "tonight's spot";
}

function clean(v: string): string {
  return v.trim().toLowerCase().replace(/[\s-]+/g, " ");
}

function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return items[0] + " and " + items[1];
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
}

function sentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return flat;
  const capped = flat.charAt(0).toUpperCase() + flat.slice(1);
  return /[.!?]$/.test(capped) ? capped : capped + ".";
}

function firstValid(candidates: string[], fallback: string): string {
  for (const text of candidates) if (copyOk(text)) return text;
  return fallback;
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
}

function trimQuote(text: string, max: number): string {
  const flat = text
    .replace(/[\u2014\u2013]/g, ",")
    .replace(/!/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "");
}

function trimTo(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "");
}

function copyBrief(input: CopyInput): string {
  if (input.kind === "tasteHeadline") {
    return [
      "Tags: " + (input.tags.length > 0 ? input.tags.join(", ") : "none"),
      "Vibe: " + (input.vibe.length > 0 ? input.vibe.join(", ") : "none"),
      "Budget: " + (input.budget.length > 0 ? input.budget.join(", ") : "none"),
    ].join("\n");
  }
  if (input.kind === "why") {
    return [
      "Place: " + input.placeName,
      "Group top tags: " + (input.topTags.length > 0 ? input.topTags.join(", ") : "unknown"),
      "Memory: " + (input.memory ?? "none yet"),
      ...(input.weather ? ["Weather: " + input.weather] : []),
      "Rain swap: " + (input.rainSwap ? "yes, the plan moved indoors" : "no"),
    ].join("\n");
  }
  return [
    "Place: " + input.placeName,
    "Night: " + input.date,
    "People: " + input.people,
    "Memory: " + (input.memory ?? "none yet"),
  ].join("\n");
}

const CREW_NAMES: Record<string, string> = {
  sunsets: "Sunset Crew",
  views: "Big View Club",
  outdoors: "Outside Crew",
  free: "Free Stuff Crew",
  hiking: "Trail Crew",
  picnic: "Picnic Society",
  food: "Dinner Crew",
  late_night_food: "Late-Night Noodle Society",
  dessert: "Dessert Club",
  coffee: "Slow Coffee Club",
  boba: "Boba Society",
  games: "Game Night Crew",
  books: "Reading Room",
  music: "Vinyl Crew",
  art: "Museum Crew",
  science: "Science Crew",
  nature: "Nature Crew",
  water: "Marina Crew",
  animals: "Goat Crew",
  market: "Market Crew",
  climbing: "Climbing Crew",
  play: "Silly Crew",
  campus: "Campus Crew",
  city_trip: "City Trip Crew",
  free_stuff: "Free Stuff Crew",
  cheap: "Budget Crew",
  worth_it: "Worth It Society",
  chill: "Slow Sunday Crew",
  silly: "Silly Crew",
  adventurous: "Trail Crew",
};

function crewName(raw: string[]): string | null {
  for (const tag of raw) {
    const name = CREW_NAMES[clean(tag).replace(/\s+/g, "_")];
    if (name) return name;
  }
  return null;
}

const COUNTS = ["zero", "just me", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function peopleWord(people: number): string {
  const n = Math.max(0, Math.round(people));
  return COUNTS[n] ?? String(n) + " of us";
}

export function templateCopy(input: CopyInput): CopyOutput {
  if (input.kind === "tasteHeadline") {
    const headline =
      crewName(input.tags) ??
      crewName(input.budget) ??
      crewName(input.vibe) ??
      "The Regulars";
    const words = [...input.tags.map(clean), ...input.vibe.map(clean)].filter((w) => w.length > 0).slice(0, 2);
    const budget = input.budget.map(clean).filter((w) => w.length > 0)[0];
    const bits = [...words];
    if (budget) bits.push(budget);
    const plain = "you all said yes to plans on a whim.";
    const why = bits.length > 0 ? trimTo("you all said yes to " + listPhrase(bits) + ".", COPY_MAX.tasteWhy) : plain;
    return {
      kind: "tasteHeadline",
      headline: trimTo(headline, COPY_MAX.headline),
      why: copyOk(why) ? why : plain,
    };
  }
  if (input.kind === "why") {
    const memory = input.memory ? trimQuote(input.memory, 70) : "";
    if (memory) {
      const line = trimTo("you loved it here like this: \u201c" + memory + ".\u201d", COPY_MAX.why);
      if (copyOk(line)) return { kind: "why", text: line };
    }
    const place = plainName(input.placeName);
    const tags = input.topTags.map(clean).filter((t) => t.length > 0).slice(0, 2);
    const bits: string[] = [];
    if (input.rainSwap) bits.push("rain's coming, so " + place + " keeps everyone dry");
    if (tags.length > 0) bits.push("you're into " + listPhrase(tags));
    if (!input.rainSwap && input.weather) bits.push("it's " + clean(input.weather) + " out");
    if (!input.rainSwap && bits.length < 2) bits.push(place + " is open when you're free");
    const line = trimTo(bits.length > 0 ? joinClauses(bits) + "." : place + " is on tonight.", COPY_MAX.why);
    const plain = trimTo(place + " is on tonight.", COPY_MAX.why);
    return { kind: "why", text: firstValid([line, plain], "tonight's plan is on.") };
  }
  const night = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? dateLabel(input.date) : input.date;
  const memory = input.memory ? trimQuote(input.memory, 32) : "";
  const base = sentence(peopleWord(input.people) + " at " + plainName(input.placeName) + " on " + night);
  const line = trimTo(memory ? base.slice(0, -1) + ". \u201c" + memory + ".\u201d" : base, COPY_MAX.caption);
  const plain = trimTo(base, COPY_MAX.caption);
  return { kind: "gardenCaption", text: firstValid([line, plain], "Tonight was a good one.") };
}

function readCopy(input: CopyInput, raw: { headline?: unknown; why?: unknown; text?: unknown }): CopyOutput | null {
  if (input.kind === "tasteHeadline") {
    if (typeof raw.headline !== "string" || typeof raw.why !== "string") return null;
    const headline = raw.headline.trim();
    const why = raw.why.trim();
    if (headline.length > COPY_MAX.headline || !copyOk(headline)) return null;
    if (why.length > COPY_MAX.tasteWhy || !copyOk(why)) return null;
    return { kind: "tasteHeadline", headline, why };
  }
  if (typeof raw.text !== "string") return null;
  const text = raw.text.trim();
  if (input.kind === "why") {
    if (text.length > COPY_MAX.why || !copyOk(text)) return null;
    return { kind: "why", text };
  }
  if (text.length > COPY_MAX.caption || !copyOk(text)) return null;
  return { kind: "gardenCaption", text: sentence(text) };
}

export async function writeCopy(input: CopyInput, fetcher?: Fetcher): Promise<CopyOutput | null> {
  const prompt = copyPrompt(input);
  const raw = await callStructured<{ headline?: unknown; why?: unknown; text?: unknown }>({
    schemaName: "frolic_" + input.kind,
    schema: copySchema(input.kind),
    system: prompt.system,
    user: prompt.user,
    fetcher,
  });
  if (!raw) return null;
  return readCopy(input, raw);
}

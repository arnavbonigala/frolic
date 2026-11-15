import { copyOk } from "../plans/engine";
import { callStructured, type Fetcher, type JsonSchema } from "./openai";

export type PickCandidate = { slug: string; name: string; tags: string[]; costLabel: string; indoor: boolean; why: string };
export type PickContext = { topTags: string[]; memory: string | null; weather: string | null };
export type PickResult = { slug: string; why: string };

export const PICK_SCHEMA_NAME = "frolic_pick";
export const PICK_MAX_WHY = 140;

const SYSTEM = [
  "You pick tonight's plan for a tight friend group in Berkeley.",
  "You get the shortlist the scorer already vetted. Choose the one plan this group would actually go to tonight.",
  "",
  "Rules:",
  "- Answer with one candidate id, copied exactly. Never invent a place.",
  "- The why is one short clause in the group's own voice, at most 140 characters, lowercase start.",
  "- Name what they are into and what it costs. Mention the sky only when a weather line is given. Use commas.",
  "- No em dashes. No exclamation marks. No hype adjectives.",
  '- Example: "you\'re into sunsets, it\'s free, and the sky\'s clear until dark."',
].join("\n");

function line(c: PickCandidate): string {
  return [c.slug, c.name, c.tags.join(", "), c.costLabel, c.indoor ? "indoors" : "outdoors", c.why].join(" | ");
}

export function pickSchema(slugs: string[]): JsonSchema {
  return {
    type: "object",
    properties: {
      slug: { type: "string", enum: slugs },
      why: { type: "string", description: "one short lowercase clause, at most " + PICK_MAX_WHY + " characters" },
    },
    required: ["slug", "why"],
    additionalProperties: false,
  };
}

export function pickPrompt(candidates: PickCandidate[], context: PickContext): { system: string; user: string } {
  const user = [
    "Candidates (id | name | tags | cost | setting | scorer note):",
    ...candidates.map(line),
    "",
    "Group top tags: " + (context.topTags.length > 0 ? context.topTags.join(", ") : "unknown"),
    "Memory: " + (context.memory ?? "none yet"),
    ...(context.weather ? ["Weather: " + context.weather] : []),
  ].join("\n");
  return { system: SYSTEM, user };
}

export async function pickPlace(input: {
  candidates: PickCandidate[];
  context: PickContext;
  fetcher?: Fetcher;
}): Promise<PickResult | null> {
  if (input.candidates.length === 0) return null;
  const slugs = input.candidates.map((c) => c.slug);
  const prompt = pickPrompt(input.candidates, input.context);
  const out = await callStructured<{ slug?: unknown; why?: unknown }>({
    schemaName: PICK_SCHEMA_NAME,
    schema: pickSchema(slugs),
    system: prompt.system,
    user: prompt.user,
    fetcher: input.fetcher,
  });
  if (!out || typeof out.slug !== "string" || typeof out.why !== "string") return null;
  if (!slugs.includes(out.slug)) return null;
  if (!copyOk(out.why)) return null;
  return { slug: out.slug, why: out.why };
}

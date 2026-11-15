import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Fetcher, StructuredBody } from "./openai";
import { PICK_SCHEMA_NAME, pickPlace, pickPrompt, pickSchema, type PickCandidate, type PickContext } from "./pick";

const KEY = "sk-test-key";

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const candidates: PickCandidate[] = [
  {
    slug: "memorial-glade",
    name: "Memorial Glade",
    tags: ["sunsets", "views", "free"],
    costLabel: "Free",
    indoor: false,
    why: "you're into sunsets, it's free, and the sky's clear until dark.",
  },
  {
    slug: "games-of-berkeley",
    name: "Games of Berkeley",
    tags: ["games", "play"],
    costLabel: "$8",
    indoor: true,
    why: "you're into games and it's dry inside while it rains.",
  },
];

const context: PickContext = { topTags: ["sunsets", "free"], memory: null, weather: "Clear, 62\u00b0" };

const envelope = (payload: unknown) => ({
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(payload) }] }],
});

const stub = (payload: unknown, status = 200) => {
  const bodies: StructuredBody[] = [];
  const fetcher: Fetcher = async (_url, init) => {
    bodies.push(JSON.parse(String(init.body)) as StructuredBody);
    return { ok: status >= 200 && status < 300, status, json: async () => payload } as unknown as Response;
  };
  return { fetcher, bodies };
};

beforeEach(() => {
  env.OPENAI_API_KEY = KEY;
});

afterEach(() => {
  delete env.OPENAI_API_KEY;
});

describe("pickPlace", () => {
  test("returns the chosen slug and why", async () => {
    const { fetcher } = stub(envelope({ slug: "memorial-glade", why: "you're into sunsets, it's free, and the sky's clear until dark." }));
    expect(await pickPlace({ candidates, context, fetcher })).toEqual({
      slug: "memorial-glade",
      why: "you're into sunsets, it's free, and the sky's clear until dark.",
    });
  });

  test("constrains the slug to the candidate ids in the request body", async () => {
    const { fetcher, bodies } = stub(envelope({ slug: "memorial-glade", why: "you're into sunsets and it's free." }));
    await pickPlace({ candidates, context, fetcher });
    const format = bodies[0].text.format;
    expect(format.type).toBe("json_schema");
    expect(format.strict).toBe(true);
    expect(format.name).toBe(PICK_SCHEMA_NAME);
    expect(bodies[0].model).toBe("gpt-5.6-luna");
    const slug = format.schema.properties.slug as { type: string; enum: string[] };
    expect(slug.type).toBe("string");
    expect(slug.enum).toEqual(["memorial-glade", "games-of-berkeley"]);
    expect(format.schema.additionalProperties).toBe(false);
    expect(bodies[0].input[1].content).toContain("memorial-glade");
    expect(bodies[0].input[1].content).toContain("games-of-berkeley");
  });

  test("rejects a slug that is not in the candidate list", async () => {
    const { fetcher } = stub(envelope({ slug: "tilden-park", why: "you're into sunsets and it's free." }));
    expect(await pickPlace({ candidates, context, fetcher })).toBeNull();
  });

  test("rejects a why that breaks the copy rules", async () => {
    const dash = stub(envelope({ slug: "memorial-glade", why: "you're into sunsets \u2014 and it's free." }));
    expect(await pickPlace({ candidates, context, fetcher: dash.fetcher })).toBeNull();
    const bang = stub(envelope({ slug: "memorial-glade", why: "sunset tonight and it's free!" }));
    expect(await pickPlace({ candidates, context, fetcher: bang.fetcher })).toBeNull();
  });

  test("rejects a why over 140 characters", async () => {
    const long =
      "you're into sunsets, it's free, and the sky is clear until dark, so bring a blanket, a speaker, a thermos, and a friend who never cancels on you";
    expect(long.length).toBeGreaterThan(140);
    const { fetcher } = stub(envelope({ slug: "memorial-glade", why: long }));
    expect(await pickPlace({ candidates, context, fetcher })).toBeNull();
  });

  test("rejects a response that is not JSON", async () => {
    const fetcher: Fetcher = async () =>
      ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: "the glade" }] }] }) }) as unknown as Response;
    expect(await pickPlace({ candidates, context, fetcher })).toBeNull();
  });

  test("returns null on an http error", async () => {
    const { fetcher } = stub({ error: "nope" }, 500);
    expect(await pickPlace({ candidates, context, fetcher })).toBeNull();
  });

  test("returns null without a request when there are no candidates", async () => {
    const { fetcher, bodies } = stub(envelope({ slug: "x", why: "y" }));
    expect(await pickPlace({ candidates: [], context, fetcher })).toBeNull();
    expect(bodies).toHaveLength(0);
  });
});

describe("pickSchema", () => {
  test("requires slug and why and forbids extras", () => {
    const schema = pickSchema(["a", "b"]);
    expect(schema.required).toEqual(["slug", "why"]);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("pickPrompt", () => {
  test("keeps the house voice rules in the system prompt", () => {
    const prompt = pickPrompt(candidates, context);
    expect(prompt.system).toContain("No em dashes");
    expect(prompt.system).toContain("No exclamation marks");
    expect(prompt.user).toContain("Clear, 62");
    expect(prompt.user).toContain("none yet");
  });
});

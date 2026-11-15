import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { copyOk } from "../../convex/plans/engine";
import { COPY_MAX, copySchema, templateCopy, writeCopy, type CopyInput } from "../../convex/ai/copy";
import type { Fetcher, StructuredBody } from "../../convex/ai/openai";

const KEY = "sk-test-key";

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

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

const taste: Extract<CopyInput, { kind: "tasteHeadline" }> = { kind: "tasteHeadline", tags: ["sunsets", "free"], vibe: ["chill"], budget: ["cheap"] };

const why: Extract<CopyInput, { kind: "why" }> = {
  kind: "why",
  placeName: "Memorial Glade",
  topTags: ["sunsets", "free stuff"],
  memory: null,
  weather: "Clear, 62\u00b0",
  rainSwap: false,
};

const caption: Extract<CopyInput, { kind: "gardenCaption" }> = { kind: "gardenCaption", placeName: "Berkeley Marina", date: "2026-11-18", people: 3, memory: null };

beforeEach(() => {
  env.OPENAI_API_KEY = KEY;
});

afterEach(() => {
  delete env.OPENAI_API_KEY;
});

describe("writeCopy", () => {
  test("returns a taste headline and why", async () => {
    const { fetcher } = stub(envelope({ headline: "Sunset Crew", why: "you keep picking sunsets and free stuff." }));
    expect(await writeCopy(taste, fetcher)).toEqual({
      kind: "tasteHeadline",
      headline: "Sunset Crew",
      why: "you keep picking sunsets and free stuff.",
    });
  });

  test("asks for the taste headline shape with strict json schema", async () => {
    const { fetcher, bodies } = stub(envelope({ headline: "Sunset Crew", why: "you keep picking sunsets and free stuff." }));
    await writeCopy(taste, fetcher);
    expect(bodies[0].model).toBe("gpt-5.6-luna");
    expect(bodies[0].text.format.type).toBe("json_schema");
    expect(bodies[0].text.format.strict).toBe(true);
    expect(bodies[0].text.format.name).toBe("frolic_tasteHeadline");
    expect(bodies[0].text.format.schema.required).toEqual(["headline", "why"]);
    expect(bodies[0].input[1].content).toContain("sunsets");
  });

  test("asks for the garden caption shape", async () => {
    const { fetcher, bodies } = stub(envelope({ text: "three of us at the marina on Nov 18." }));
    expect(await writeCopy(caption, fetcher)).toEqual({ kind: "gardenCaption", text: "three of us at the marina on Nov 18." });
    expect(bodies[0].text.format.name).toBe("frolic_gardenCaption");
  });

  test("rejects a headline with an em dash", async () => {
    const { fetcher } = stub(envelope({ headline: "Sunset \u2014 Crew", why: "you keep picking sunsets." }));
    expect(await writeCopy(taste, fetcher)).toBeNull();
  });

  test("rejects copy with an exclamation mark", async () => {
    const { fetcher } = stub(envelope({ headline: "Sunset Crew", why: "you keep picking sunsets!" }));
    expect(await writeCopy(taste, fetcher)).toBeNull();
  });

  test("rejects an over-length headline", async () => {
    const headline = "The Late Night Noodle and Sunset Appreciation Society";
    expect(headline.length).toBeGreaterThan(COPY_MAX.headline);
    const { fetcher } = stub(envelope({ headline, why: "you keep picking sunsets." }));
    expect(await writeCopy(taste, fetcher)).toBeNull();
  });

  test("rejects an over-length why line", async () => {
    const text =
      "you're into sunsets, it's free, and the sky is clear until dark, so bring a blanket and a speaker and a friend who never cancels";
    expect(text.length).toBeGreaterThan(COPY_MAX.why);
    const { fetcher } = stub(envelope({ text }));
    expect(await writeCopy(why, fetcher)).toBeNull();
  });

  test("rejects an over-length garden caption", async () => {
    const text =
      "three of us at the berkeley marina on Nov 18 and the sky turned orange for a while and nobody wanted to go home";
    expect(text.length).toBeGreaterThan(COPY_MAX.caption);
    const { fetcher } = stub(envelope({ text }));
    expect(await writeCopy(caption, fetcher)).toBeNull();
  });

  test("rejects contrastive copy", async () => {
    const { fetcher } = stub(envelope({ headline: "Sunset Crew", why: "it's not a hike, but it is close." }));
    expect(await writeCopy(taste, fetcher)).toBeNull();
  });

  test("rejects a missing field", async () => {
    const { fetcher } = stub(envelope({ headline: "Sunset Crew" }));
    expect(await writeCopy(taste, fetcher)).toBeNull();
  });

  test("returns null on an http error and without a key", async () => {
    const failed = stub({ error: "nope" }, 503);
    expect(await writeCopy(taste, failed.fetcher)).toBeNull();
    delete env.OPENAI_API_KEY;
    const unused = stub(envelope({ headline: "Sunset Crew", why: "you keep picking sunsets." }));
    expect(await writeCopy(taste, unused.fetcher)).toBeNull();
    expect(unused.bodies).toHaveLength(0);
  });
});

const every: CopyInput[] = [
  taste,
  { kind: "tasteHeadline", tags: [], vibe: [], budget: [] },
  why,
  { ...why, rainSwap: true },
  { ...why, topTags: [], weather: null },
  { ...why, memory: "we stayed until the lights came on \u2014 nobody wanted to leave!" },
  caption,
  { ...caption, memory: "best night this month" },
  { ...caption, people: 1 },
  { ...caption, people: 9 },
  { ...caption, placeName: "Lawrence Hall of Science and the Bay View Deck on Panoramic Hill", memory: "we got lost \u2014 twice!" },
  { ...why, placeName: "Sather Tower!", topTags: ["views!", "sunset\u2014ish"], weather: "Clear\u2014ish, 62\u00b0" },
  { ...why, topTags: ["a very long tag about late night noodles and jazz records", "music"], rainSwap: true },
  taste,
];

describe("templateCopy", () => {
  const limits = (input: CopyInput): number[] =>
    input.kind === "tasteHeadline" ? [COPY_MAX.headline, COPY_MAX.tasteWhy] : input.kind === "why" ? [COPY_MAX.why] : [COPY_MAX.caption];

  test("returns valid copy for every kind and edge case", () => {
    for (const input of every) {
      const out = templateCopy(input);
      expect(out.kind).toBe(input.kind);
      const strings = out.kind === "tasteHeadline" ? [out.headline, out.why] : [out.text];
      const maxes = limits(input);
      strings.forEach((s, i) => {
        expect(copyOk(s)).toBe(true);
        expect(s.length).toBeLessThanOrEqual(maxes[i]);
        expect(s.trim()).toBe(s);
      });
    }
  });

  test("names the crew instead of listing tags", () => {
    expect(templateCopy(taste)).toEqual({
      kind: "tasteHeadline",
      headline: "Sunset Crew",
      why: "you all said yes to sunsets, free, and cheap.",
    });
    expect(templateCopy({ kind: "tasteHeadline", tags: ["late_night_food"], vibe: [], budget: [] })).toMatchObject({
      headline: "Late-Night Noodle Society",
    });
    expect(templateCopy({ kind: "tasteHeadline", tags: [], vibe: [], budget: [] })).toMatchObject({ headline: "The Regulars" });
  });

  test("writes a why from the group's tags, weather and memory", () => {
    expect(templateCopy(why)).toEqual({ kind: "why", text: "you're into sunsets and free stuff, and it's clear, 62\u00b0 out." });
    expect(templateCopy({ ...why, rainSwap: true })).toMatchObject({ text: expect.stringContaining("keeps everyone dry") });
    expect(templateCopy({ ...why, memory: "we stayed until the lights came on \u2014 nobody wanted to leave!" })).toMatchObject({
      text: expect.stringContaining("you loved it here like this"),
    });
  });

  test("writes a garden caption with the place and the date", () => {
    expect(templateCopy(caption)).toEqual({ kind: "gardenCaption", text: "three at Berkeley Marina on Nov 18." });
    expect(templateCopy({ ...caption, people: 1 })).toEqual({ kind: "gardenCaption", text: "just me at Berkeley Marina on Nov 18." });
    expect(templateCopy({ ...caption, memory: "best night this month" })).toMatchObject({
      text: expect.stringContaining("best night this month"),
    });
  });
});

describe("copySchema", () => {
  test("matches the shape of each kind", () => {
    expect(copySchema("tasteHeadline").required).toEqual(["headline", "why"]);
    expect(copySchema("why").required).toEqual(["text"]);
    expect(copySchema("gardenCaption").required).toEqual(["text"]);
    expect(copySchema("why").additionalProperties).toBe(false);
  });
});

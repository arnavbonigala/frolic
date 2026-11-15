declare const process: { env: Record<string, string | undefined> };
import { describe, expect, test } from "vitest";
import { copyOk } from "../plans/engine";
import { COPY_MAX, writeCopy } from "./copy";
import { pickPlace } from "./pick";

const live = process.env.FROLIC_AI_LIVE === "1" && !!process.env.OPENAI_API_KEY;

describe.skipIf(!live)("live OpenAI smoke", () => {
  test("picks a candidate id and writes a why line", async () => {
    const pick = await pickPlace({
      candidates: [
        { slug: "indian-rock", name: "Indian Rock", tags: ["sunsets", "free"], costLabel: "Free", indoor: false, why: "the whole bay lights up from the top" },
        { slug: "cheese-board", name: "Cheese Board", tags: ["food", "music"], costLabel: "$3.25 a slice", indoor: false, why: "one pizza a day and a line that moves" },
        { slug: "victory-point-cafe", name: "Victory Point Cafe", tags: ["games", "coffee"], costLabel: "$12 a seat", indoor: true, why: "hundreds of games and warm drinks" },
      ],
      context: { topTags: ["sunsets", "free stuff"], memory: null, weather: "Clear, 62 degrees" },
    });
    expect(pick).not.toBeNull();
    expect(["indian-rock", "cheese-board", "victory-point-cafe"]).toContain(pick!.slug);
    expect(copyOk(pick!.why)).toBe(true);
  }, 15000);

  test("writes the three short copy kinds inside their limits", async () => {
    const taste = await writeCopy({ kind: "tasteHeadline", tags: ["sunsets", "late-night food"], vibe: ["golden hour"], budget: ["under $10"] });
    expect(taste).not.toBeNull();
    if (taste!.kind !== "tasteHeadline") throw new Error("kind");
    expect(taste!.headline.length).toBeLessThanOrEqual(COPY_MAX.headline);
    expect(taste!.why.length).toBeLessThanOrEqual(COPY_MAX.tasteWhy);
    expect(copyOk(taste!.headline) && copyOk(taste!.why)).toBe(true);

    const why = await writeCopy({ kind: "why", placeName: "Indian Rock", topTags: ["sunsets"], memory: null, weather: "Clear, 62 degrees", rainSwap: false });
    expect(why).not.toBeNull();
    if (why!.kind !== "why") throw new Error("kind");
    expect(why!.text.length).toBeLessThanOrEqual(COPY_MAX.why);
    expect(copyOk(why!.text)).toBe(true);

    const caption = await writeCopy({ kind: "gardenCaption", placeName: "the Marina", date: "2026-11-15", people: 3, memory: null });
    expect(caption).not.toBeNull();
    if (caption!.kind !== "gardenCaption") throw new Error("kind");
    expect(caption!.text.length).toBeLessThanOrEqual(COPY_MAX.caption);
    expect(copyOk(caption!.text)).toBe(true);
  }, 30000);
});

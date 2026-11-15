import { describe, expect, test } from "vitest";
import { TAG_TEMPLATES, normalizeTag, templateTaste, validateTasteLine } from "./taste";

describe("template taste", () => {
  test("every tag the mock and place set use has a hand-written template", () => {
    for (const tag of ["Sunsets", "Outdoors", "Late-night food", "Games", "Free stuff", "sunset", "golden-hour", "boba", "coffee", "music", "art", "views", "water", "food", "indoor", "bowling", "picnic", "campus", "marina", "pier", "climbing", "hike", "arcade"]) {
      expect(TAG_TEMPLATES[normalizeTag(tag)], tag).toBeDefined();
    }
  });

  test("the top tag names the crew", () => {
    expect(templateTaste(["Sunsets", "Late-night food"], ["under 10 dollars"])).toEqual({
      headline: "Sunset Crew",
      why: "Golden-hour chasers, with a soft spot for night owls who follow the smell of dinner, under 10 dollars.",
      source: "template",
    });
    expect(templateTaste(["late-night-food"], []).headline).toBe("Late-Night Noodle Society");
  });

  test("an unknown tag still reads well and never prints a raw tag list", () => {
    const t = templateTaste(["zzz"], []);
    expect(t.headline).toBe("The Good Company");
    expect(t.why).not.toContain("zzz");
    expect(templateTaste([], []).headline).toBe("The Good Company");
  });

  test("every template passes the copy rules", () => {
    for (const [tag, tpl] of Object.entries(TAG_TEMPLATES)) {
      const line = templateTaste([tag, "sunset"], ["under 10 dollars"]);
      expect(validateTasteLine(line), tag).toBeNull();
      expect(tpl.name.length).toBeLessThanOrEqual(40);
    }
  });
});

describe("validateTasteLine", () => {
  test("accepts a clean line", () => {
    expect(validateTasteLine({ headline: "Sunset Crew", why: "Golden-hour chasers, under 10 dollars." })).toBeNull();
  });
  test.each([
    [{ headline: "", why: "ok" }],
    [{ headline: "x".repeat(41), why: "ok" }],
    [{ headline: "Sunset Crew", why: "x".repeat(141) }],
    [{ headline: "Sunset Crew", why: "Golden hour \u2014 always." }],
    [{ headline: "Sunset Crew!", why: "ok" }],
    [{ headline: "Sunset Crew", why: "Not about the food, but the people." }],
  ])("rejects %j", (line) => {
    expect(validateTasteLine(line)).not.toBeNull();
  });
});

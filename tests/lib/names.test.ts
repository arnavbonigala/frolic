import { describe, expect, test } from "vitest";
import { comePhrase, listNames, midSentence, titleNamesPlace } from "../../convex/lib/names";

describe("name lists", () => {
  test("two, three and four names read the way the mock reads them", () => {
    expect(listNames(["you", "Dev"])).toBe("you and Dev");
    expect(listNames(["you", "Dev", "Jordan"])).toBe("you, Dev and Jordan");
    expect(listNames(["you", "Dev", "Jordan", "Priya"])).toBe("you, Dev, Jordan and Priya");
    expect(listNames(["Maya"])).toBe("Maya");
    expect(listNames([])).toBe("");
    expect(listNames([" ", " Dev "])).toBe("Dev");
  });

  test("only-if reads comes or come, never a bare name", () => {
    expect(comePhrase(["Jordan"])).toBe("Jordan comes");
    expect(comePhrase(["Dev", "Jordan"])).toBe("Dev and Jordan come");
    expect(comePhrase(["Maya", "Dev", "Jordan"])).toBe("all 3 come");
    expect(comePhrase([])).toBe("");
  });

  test("a mid sentence label drops its capital", () => {
    expect(midSentence("Noodles")).toBe("noodles");
    expect(midSentence("")).toBe("");
  });
});

describe("title and place", () => {
  test("a title that already names the place is left alone", () => {
    expect(titleNamesPlace("Sunset at Indian Rock", "Indian Rock Park")).toBe(true);
    expect(titleNamesPlace("Sunset at Indian Rock", "Indian Rock")).toBe(true);
    expect(titleNamesPlace("Cheese Board pizza", "Cheese Board")).toBe(true);
    expect(titleNamesPlace("Hot dogs at Top Dog", "Top Dog")).toBe(true);
    expect(titleNamesPlace("The Marina at dusk", "the Marina")).toBe(true);
    expect(titleNamesPlace("Ice cream sandwiches at CREAM", "CREAM")).toBe(true);
  });

  test("a title about somewhere else still gets the place", () => {
    expect(titleNamesPlace("Sunset at Indian Rock", "Cheese Board")).toBe(false);
    expect(titleNamesPlace("Picnic on the grass", "Memorial Glade")).toBe(false);
    expect(titleNamesPlace("Sunset at Indian Rock", null)).toBe(false);
    expect(titleNamesPlace("Sunset kayaks", "berkeley-marina-kayaks")).toBe(false);
    expect(titleNamesPlace("Kayaks at the Marina", "berkeley-marina-kayaks")).toBe(true);
  });
});

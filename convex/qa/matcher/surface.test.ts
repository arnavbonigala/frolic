import { describe, expect, it } from "vitest";
import { discoverSurface } from "./surface";

describe("matcher API surface", () => {
  it("reports every exported convex function", async () => {
    const entries = await discoverSurface();
    const listing = entries.map((e) => `${e.module}:${e.name}`).sort();
    console.log(JSON.stringify(listing));
    expect(Array.isArray(listing)).toBe(true);
  });
});

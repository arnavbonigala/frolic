import { describe, expect, it } from "vitest";
import { describeExports, discoverSurface, internalExports, publicQueries } from "./surface";

describe("matcher API surface", () => {
  it("classifies every exported convex function as public or internal", async () => {
    const kinds = await describeExports();
    const entries = await discoverSurface();
    const unclassified = entries
      .filter((e) => !kinds.has(`${e.module}:${e.name}`))
      .map((e) => `${e.module}:${e.name}`);
    console.log("public queries:", (await publicQueries()).map((e) => `${e.module}:${e.name}`).join(", "));
    console.log("unclassified:", unclassified.join(", "));
    expect(kinds.size, "the surface scan must find the functions").toBeGreaterThan(10);
  });

  it("knows which functions a client can reach", async () => {
    const publicNames = (await publicQueries()).map((e) => `${e.module}:${e.name}`);
    const internalNames = (await internalExports()).map((e) => `${e.module}:${e.name}`);
    expect(publicNames).toContain("frolics:today");
    expect(publicNames).toContain("crew:crew");
    expect(internalNames).toContain("reveal:flip");
    expect(internalNames).toContain("taps:tapAs");
    expect(publicNames, "the reveal must never be client reachable").not.toContain("reveal:flip");
    expect(publicNames, "the matcher must never be client reachable").not.toContain("taps:tapAs");
  });
});

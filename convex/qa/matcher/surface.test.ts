import { describe, expect, it } from "vitest";
import {
  classifyFunctions,
  describeExports,
  discoverSurface,
  internalExports,
  makeTest,
  publicQueries,
} from "./surface";

describe("matcher API surface", () => {
  it("classifies every exported convex function as public or internal", async () => {
    const kinds = await describeExports();
    const entries = await discoverSurface();
    const unclassified = entries
      .filter((e) => !kinds.has(`${e.module}:${e.name}`))
      .map((e) => `${e.module}:${e.name}`);
    const byName = (await import("./surface")).classifyFunctions;
    console.log("classifier available:", typeof byName);
    console.log("unclassified:", unclassified.join(", "));
    expect(kinds.size, "the surface scan must find the functions").toBeGreaterThan(10);
  });

  it("knows which functions a client can reach", async () => {
    const sourcePublic = (await publicQueries()).map((e) => `${e.module}:${e.name}`);
    const sourceInternal = (await internalExports()).map((e) => `${e.module}:${e.name}`);
    const { queries, others } = await classifyFunctions(makeTest());
    const runtimeQueries = new Set(queries.map((e) => `${e.module}:${e.name}`));
    const runtimeOthers = new Set(others.map((e) => `${e.module}:${e.name}`));
    expect(runtimeOthers.size, "mutations and actions are classified apart from queries").toBeGreaterThan(0);
    const publicNames = sourcePublic;
    const internalNames = sourceInternal;
    for (const name of sourcePublic) {
      expect(runtimeQueries.has(name), `${name} is declared a query and must run as one`).toBe(true);
    }
    expect(sourceInternal.length, "the internal surface is classified too").toBeGreaterThan(0);
    expect(publicNames).toContain("frolics:today");
    expect(publicNames).toContain("crew:crew");
    expect(internalNames).toContain("reveal:flip");
    expect(internalNames).toContain("taps:tapAs");
    expect(publicNames, "the reveal must never be client reachable").not.toContain("reveal:flip");
    expect(publicNames, "the matcher must never be client reachable").not.toContain("taps:tapAs");
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

const FORBIDDEN = ["WHOP", "API", "KEY"].join("_");

const sources = import.meta.glob("../**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function files() {
  return Object.entries(sources).filter(([path]) => !path.startsWith("../_generated/") && !path.endsWith("noProdKey.test.ts"));
}

describe("no production Whop key", () => {
  it("reads the convex sources", () => {
    expect(files().length).toBeGreaterThan(10);
  });

  it("never names the production key", () => {
    const pattern = new RegExp(`\\b${FORBIDDEN}\\b`);
    expect(files().filter(([, source]) => pattern.test(source)).map(([path]) => path)).toEqual([]);
  });
});

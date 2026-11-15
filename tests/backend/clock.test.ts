import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { makeT } from "./setup.helpers";

describe("clock", () => {
  test("hands back the server epoch in milliseconds without a session", async () => {
    const t = makeT();
    const before = Date.now();
    const first = await t.mutation(api.clock.now, {});
    const second = await t.mutation(api.clock.now, {});
    const after = Date.now();
    expect(first).toBeGreaterThanOrEqual(before);
    expect(first).toBeLessThanOrEqual(after);
    expect(first).toBeGreaterThan(1_700_000_000_000);
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

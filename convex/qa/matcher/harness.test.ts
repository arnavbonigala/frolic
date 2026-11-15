import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { modules, seed } from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);

const stampNow = makeFunctionReference<"mutation">("qa/matcher/clockFixture:stampNow");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("harness", () => {
  it("fake timers reach mutations and scheduled work, so reveal timing is testable", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const stamped = await t.mutation(stampNow, {});
    expect(stamped, "Date.now() inside a mutation follows the test clock").toBe(NOW);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const clockRows = await t.run(async (ctx: any) =>
      (await ctx.db.query("availability").collect()).filter((r: any) => r.day === "qa-clock"),
    );
    expect(clockRows.length, "a 1500ms schedule fires and writes at the advanced clock").toBe(1);
    expect(clockRows[0].updatedAt).toBe(NOW + 1500);
  });
});

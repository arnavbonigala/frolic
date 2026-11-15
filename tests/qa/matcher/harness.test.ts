import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTest, matchState, readTaps, seed, tapById } from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("harness", () => {
  it("fake timers reach mutations and the reveal schedule, so reveal timing is testable", async () => {
    const t = makeTest();
    const f = await seed(t);

    await tapById(t, f, "Maya");
    const taps = await readTaps(t, f.frolicId);
    expect(taps.length, "a down tap lands on the seeded frolic").toBe(1);
    expect(taps[0].updatedAt, "Date.now() inside a mutation follows the test clock").toBe(NOW);

    await tapById(t, f, "Dev");
    const matched = await matchState(t, f.frolicId);
    expect(matched.pending, "the second down tap schedules the reveal").not.toBeNull();
    const revealAt = matched.pending.revealAt;
    expect(revealAt, "the reveal sits in the future, not at the tap").toBeGreaterThan(NOW);
    expect(matched.frolic.status, "nothing flips before the clock reaches revealAt").toBe("open");

    vi.advanceTimersByTime(revealAt - NOW);
    await t.finishInProgressScheduledFunctions();

    const flipped = await matchState(t, f.frolicId);
    expect(flipped.frolic.status, "advancing the clock to revealAt flips the frolic").toBe("on");
    const log = await t.run(
      async (ctx: any) =>
        await ctx.db
          .query("revealLog")
          .withIndex("by_frolicId", (q: any) => q.eq("frolicId", f.frolicId))
          .collect(),
    );
    expect(log.length, "both who tapped down are logged").toBe(2);
    expect(
      Math.abs(log[0].flippedAt - revealAt),
      "the flip fires on the scheduled instant in test time, not on the wall clock",
    ).toBeLessThan(1000);
  });
});
